/**
 * Animações padrão (Mesh2Motion): a biblioteca humana do Mesh2Motion (CC0) convertida para o esqueleto de cada
 * Companion (rig do Tripo/Mixamo) pelo retarget "swing-twist" do Mesh2Motion (MIT, código em client/src/m2m).
 * Roda só no Administrador: converte, mostra no campo de treino e grava um .GLB só de animação para o jogo.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationRetargetService } from './AnimationRetargetService';
import { BoneAutoMapper } from './bone-automap/BoneAutoMapper';
import { MixamoMapper } from './bone-automap/MixamoMapper';
import { RigifyMapper } from './bone-automap/RigifyMapper';
import { Mesh2MotionMapper } from './bone-automap/Mesh2MotionMapper';
import { TargetBoneMappingType } from './TargetBoneMappingType';
import { SkeletonType } from './SkeletonType';
import { RetargetUtils } from './RetargetUtils';

import { STANDARD_PREFIX, STANDARD_VIRTUAL, STANDARD_SLOTS, STANDARD_EXTRAS } from './slots';
export { STANDARD_PREFIX, STANDARD_VIRTUAL, STANDARD_SLOTS, STANDARD_EXTRAS };

/** Clipe montado: puxar + soltar (veja loadLibrary). */
export const ARCHERY = 'Archery';

const LIBS = ['/m2m/human-base.glb', '/m2m/human-addon.glb', '/m2m/human-mocap.glb'];
const RIG = '/m2m/rig-human.glb';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
let libPromise: Promise<{ rig: THREE.Group; clips: Map<string, THREE.AnimationClip> }> | null = null;

/** Biblioteca (~9 MB, só no Administrador): o esqueleto de origem e todos os clipes, por nome. */
export function loadLibrary() {
  libPromise ??= (async () => {
    const [rig, ...libs] = await Promise.all([loader.loadAsync(RIG), ...LIBS.map((u) => loader.loadAsync(u))]);
    const clips = new Map<string, THREE.AnimationClip>();
    for (const l of libs) for (const c of l.animations) if (!clips.has(c.name)) clips.set(c.name, c);
    // tiro com arco em um clipe só: puxar a corda, segurar mirando e soltar. A mira ocupa de 38% a 52% e o jogo congela
    // em 45% enquanto o arco carrega, então a pose parada é sempre a da corda toda puxada.
    const pull = clips.get('Bow Pull Back'), hold = clips.get('Bow Pull Hold'), rel = clips.get('Bow Release');
    if (pull && hold && rel) clips.set(ARCHERY, joinClips(ARCHERY, [{ clip: pull, share: 0.38 }, { clip: hold, share: 0.14, cut: 0.5 }, { clip: rel, share: 0.48 }]));
    else if (pull && rel) clips.set(ARCHERY, joinClips(ARCHERY, [{ clip: pull, share: 0.45 }, { clip: rel, share: 0.55 }]));
    return { rig: rig.scene, clips };
  })();
  libPromise.catch(() => { libPromise = null; });
  return libPromise;
}

export interface Retargeter {
  /** Converte (e guarda) um clipe da biblioteca para este Companion. */
  get(name: string): THREE.AnimationClip | null;
  /** Todos os nomes da biblioteca, em ordem. */
  names: string[];
  /** Ossos ligados / ossos do modelo, e o tipo de rig reconhecido. */
  mapped: number; bones: number; rigType: string;
  /** O rig tinha esquerda e direita trocadas nos nomes (e o mapa foi corrigido). */
  mirrored: boolean;
}

/**
 * Prepara a conversão para um modelo (o .GLB do Companion, já com rig). Lança erro se o esqueleto não for humanoide
 * reconhecível (poucos ossos ligados).
 */
export async function makeRetargeter(model: THREE.Object3D): Promise<Retargeter> {
  const lib = await loadLibrary();
  const target = new THREE.Scene();
  const body = cloneSkinned(model);
  target.add(body);
  RetargetUtils.reset_skinned_mesh_to_rest_pose(target);
  // pose de descanso de cada osso: trilha parada nessa pose não precisa ir no arquivo (o jogo volta o osso a ela sozinho)
  const rest = new Map<string, number[]>();
  body.traverse((o) => { if ((o as THREE.Bone).isBone) { rest.set(o.name + '.quaternion', o.quaternion.toArray()); rest.set(o.name + '.position', o.position.toArray()); } });
  // sem mudar a escala: o deslocamento do quadril sai nas unidades do próprio modelo (as do arquivo gravado)
  target.updateMatrixWorld(true);

  const svc = AnimationRetargetService.getInstance();
  svc.clear_bone_mappings();
  svc.set_skeleton_type(SkeletonType.Human);
  svc.set_source_armature(lib.rig.clone() as THREE.Group);
  svc.set_target_armature(target);
  const names: string[] = [];
  target.traverse((o) => { if ((o as THREE.Bone).isBone) names.push(o.name); });
  const srcNames: string[] = []; lib.rig.traverse((o) => { if ((o as THREE.Bone).isBone) srcNames.push(o.name); });
  // que esqueleto é: o do próprio Mesh2Motion (riggado no editor), Mixamo/Tripo, Rigify ou outro
  svc.set_target_mapping_type(Mesh2MotionMapper.is_source_bones_same_as_target(srcNames, names) ? TargetBoneMappingType.Mesh2Motion : MixamoMapper.is_target_valid_skeleton(names) ? TargetBoneMappingType.Mixamo : RigifyMapper.is_target_valid_skeleton(names) ? TargetBoneMappingType.Rigify : TargetBoneMappingType.Custom);
  let map = BoneAutoMapper.auto_map_bones();
  // Esqueleto do próprio Mesh2Motion: os nomes são os mesmos, mas as juntas foram encaixadas noutro corpo (braços em
  // pose A, ombros noutro lugar). Copiar as rotações do molde giraria os braços demais (cruzam na frente); a conversão
  // por direção dos ossos (swing-twist) acompanha o encaixe. Mapa de nomes iguais, tipo "próprio" para usá-la.
  const sameSkeleton = svc.get_target_mapping_type() === TargetBoneMappingType.Mesh2Motion;
  if (sameSkeleton) {
    map = new Map(names.filter((n) => srcNames.includes(n)).map((n) => [n, n]));
    svc.set_target_mapping_type(TargetBoneMappingType.Custom);
  }
  svc.set_bone_mappings(map);
  // Rigs com os lados trocados no nome ("Left" no braço direito): os pés dizem para onde o corpo olha; se a esquerda
  // dos nomes cair do lado direito, troca _l/_r no mapa (senão os clipes saem espelhados e torcidos).
  const mirrored = fixMirroredSides(target, map);
  svc.set_bone_mappings(map);
  svc.set_target_armature(target);
  if (!names.length) throw new Error('Este modelo não tem esqueleto (rig). Exporte do Tripo com rig, ou faça o rig no editor do Mesh2Motion (esqueleto humano) e envie o .GLB que ele gerar.');
  if (map.size < 12) throw new Error(`Não reconheci o esqueleto (${map.size} ossos ligados de ${names.length}). Ele precisa ser humanoide, como o rig do Tripo, do Mixamo ou do Mesh2Motion.`);

  const cache = new Map<string, THREE.AnimationClip>();
  const svcType = svc.get_target_mapping_type();
  const rigType = sameSkeleton ? TargetBoneMappingType.Mesh2Motion : svcType;
  return {
    names: [...lib.clips.keys()].sort((a, b) => a.localeCompare(b)),
    mapped: map.size, bones: names.length, rigType, mirrored,
    get(name) {
      if (cache.has(name)) return cache.get(name)!;
      const src = lib.clips.get(name);
      if (!src) return null;
      // o serviço é único: garante que ele ainda aponta para este modelo (outro Companion pode ter sido aberto)
      if (svc.get_target_armature() !== target) { svc.set_source_armature(lib.rig.clone() as THREE.Group); svc.set_target_armature(target); svc.set_target_mapping_type(svcType); svc.set_bone_mappings(map); svc.set_skeleton_type(SkeletonType.Human); }
      const quiet = console.log; console.log = () => {};
      let out: THREE.AnimationClip;
      try { out = svc.retarget_animation_clip(src); } finally { console.log = quiet; }
      out.name = name; // sem o " RT": o nome é a chave nas escolhas do Administrador
      slimClip(out, rest); // ossos parados viram 2 chaves; quadros que a interpolação refaz saem (o arquivo do jogo fica leve)
      cache.set(name, out);
      return out;
    },
  };
}

/**
 * Enxuga um clipe sem mudar o que se vê: trilha parada (dedos, por exemplo) fica com 2 chaves, e chaves que a
 * interpolação entre as vizinhas refaz (erro < ~0,3° nas rotações, < 3 mm nas posições) saem.
 */
export function slimClip(clip: THREE.AnimationClip, rest?: Map<string, number[]>) {
  const atRest = (t: THREE.KeyframeTrack, quat: boolean) => {
    const r = rest?.get(t.name), v = t.values;
    if (!r && !t.name.endsWith('.scale')) return false;
    if (t.name.endsWith('.scale')) return Math.abs(v[0] - 1) + Math.abs(v[1] - 1) + Math.abs(v[2] - 1) < 1e-4;
    if (quat && r) return Math.abs(r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + r[3] * v[3]) > 0.99999;
    if (!r) return false;
    return Math.abs(r[0] - v[0]) + Math.abs(r[1] - v[1]) + Math.abs(r[2] - v[2]) < 1e-4 * (1 + Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]));
  };
  const out: THREE.KeyframeTrack[] = [];
  for (const t0 of clip.tracks) { const t = slimTrack(t0); if (t && !(t.times.length === 2 && atRest(t, t.name.endsWith('.quaternion')))) out.push(t); }
  clip.tracks = out;
  return clip;
}

function slimTrack(t: THREE.KeyframeTrack): THREE.KeyframeTrack | null {
  {
    const n = t.getValueSize(), times = t.times, v = t.values, count = times.length;
    if (count <= 2) return t;
    const quat = t.name.endsWith('.quaternion'), tol = quat ? 0.0025 : 0.003;
    let still = true;
    for (let i = n; i < v.length && still; i++) if (Math.abs(v[i] - v[i % n]) > tol * 0.4) still = false;
    const keep: number[] = [0];
    if (!still) {
      let a = 0;
      for (let j = 2; j < count; j++) {
        // cabe tudo entre a e j numa interpolação reta? então a chave j-1 não precisa ficar
        let ok = true;
        for (let k = a + 1; k < j && ok; k++) {
          const f = (times[k] - times[a]) / (times[j] - times[a]);
          if (quat) {
            // nlerp (respeita o hemisfério) contra a chave real
            const dot = v[a * 4] * v[j * 4] + v[a * 4 + 1] * v[j * 4 + 1] + v[a * 4 + 2] * v[j * 4 + 2] + v[a * 4 + 3] * v[j * 4 + 3];
            const sgn = dot < 0 ? -1 : 1;
            const q = [0, 1, 2, 3].map((c) => v[a * 4 + c] * (1 - f) + sgn * v[j * 4 + c] * f);
            const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
            const d = Math.abs(q[0] / len * v[k * 4] + q[1] / len * v[k * 4 + 1] + q[2] / len * v[k * 4 + 2] + q[3] / len * v[k * 4 + 3]);
            if (1 - d > tol * tol * 0.5) ok = false;
          } else {
            for (let c = 0; c < n && ok; c++) if (Math.abs(v[a * n + c] * (1 - f) + v[j * n + c] * f - v[k * n + c]) > tol) ok = false;
          }
        }
        if (!ok) { keep.push(j - 1); a = j - 1; }
      }
    }
    keep.push(count - 1);
    if (keep.length === count) return t;
    const nt = new Float32Array(keep.length), nv = new Float32Array(keep.length * n);
    keep.forEach((k, i) => { nt[i] = times[k]; for (let c = 0; c < n; c++) nv[i * n + c] = still ? v[c] : v[k * n + c]; });
    const Ctor = t.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack;
    return new Ctor(t.name, nt, nv);
  }
}

/** Corrige o mapa (alvo → origem) quando os nomes de esquerda/direita do alvo estão trocados. */
function fixMirroredSides(scene: THREE.Object3D, map: Map<string, string>): boolean {
  const toTarget = new Map<string, string>();
  map.forEach((src, tgt) => { if (!toTarget.has(src)) toTarget.set(src, tgt); });
  const pos = (src: string) => { const n = toTarget.get(src); const o = n ? scene.getObjectByName(n) : null; return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
  scene.updateMatrixWorld(true);
  const fl = pos('foot_l'), fr = pos('foot_r'), bl = pos('ball_l'), br = pos('ball_r'), tl = pos('thigh_l'), tr = pos('thigh_r');
  if (!fl || !fr || !bl || !br || !tl || !tr) return false;
  const toes = bl.clone().sub(fl).add(br.clone().sub(fr)).setY(0);           // para onde os pés apontam
  const named = tl.clone().sub(tr).cross(new THREE.Vector3(0, 1, 0)).setY(0); // frente se "esquerda" fosse esquerda mesmo
  if (toes.lengthSq() < 1e-8 || named.lengthSq() < 1e-8 || toes.dot(named) >= 0) return false;
  const swap = (n: string) => n.replace(/_l(\b|_|$)/, '_§$1').replace(/_r(\b|_|$)/, '_l$1').replace('_§', '_r');
  for (const [tgt, src] of [...map.entries()]) map.set(tgt, swap(src));
  return true;
}

/**
 * Junta clipes do mesmo esqueleto um depois do outro. Cada parte ocupa a fração `share` da duração total (`cut` corta o
 * clipe nesse tempo, em segundos). Trilha que falta numa parte fica parada no primeiro valor de outra parte.
 */
function joinClips(name: string, parts: { clip: THREE.AnimationClip; share: number; cut?: number }[]): THREE.AnimationClip {
  const lens = parts.map((p) => Math.min(p.clip.duration, p.cut ?? Infinity));
  const total = lens.reduce((a, b) => a + b, 0);
  const names = [...new Set(parts.flatMap((p) => p.clip.tracks.map((t) => t.name)))];
  const tracks = names.map((n) => {
    const own = parts.map((p) => p.clip.tracks.find((t) => t.name === n));
    const ref = own.find(Boolean)!;
    const size = ref.getValueSize();
    const times: number[] = [], values: number[] = [];
    let off = 0;
    parts.forEach((p, i) => {
      const dur = p.share * total, k = dur / Math.max(1e-6, lens[i]), t = own[i];
      const eps = i ? 1e-4 : 0;
      if (t) {
        for (let j = 0; j < t.times.length; j++) {
          if (t.times[j] > lens[i] + 1e-6) break;
          times.push(t.times[j] * k + off + (j === 0 ? eps : 0)); values.push(...Array.from(t.values.slice(j * size, j * size + size)));
        }
      } else {
        const v = Array.from(ref.values.slice(0, size));
        times.push(off + eps, off + dur); values.push(...v, ...v);
      }
      off += dur;
    });
    const Ctor = ref.constructor as new (n: string, t: number[], v: number[]) => THREE.KeyframeTrack;
    return new Ctor(n, times, values);
  });
  return new THREE.AnimationClip(name, total, tracks);
}

/** .GLB só com o esqueleto do modelo e os clipes convertidos (o jogo liga pelos nomes dos ossos). */
export async function exportClips(model: THREE.Object3D, clips: THREE.AnimationClip[]): Promise<ArrayBuffer> {
  const rig = cloneSkinned(model);
  const drop: THREE.Object3D[] = [];
  rig.traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) drop.push(o); });
  // a malha sai, mas os ossos que estão dentro dela ficam (no rig do Mesh2Motion o esqueleto mora dentro da malha)
  for (const o of drop) {
    const keep = new THREE.Object3D();
    keep.name = o.name; keep.position.copy(o.position); keep.quaternion.copy(o.quaternion); keep.scale.copy(o.scale);
    for (const ch of [...o.children]) keep.add(ch);
    const parent = o.parent;
    if (parent) { parent.add(keep); o.removeFromParent(); }
  }
  const out = await new GLTFExporter().parseAsync(rig, { binary: true, animations: clips, onlyVisible: false });
  return compactGlb(out as ArrayBuffer);
}

/**
 * Enxuga a descrição do .GLB de animação (o grosso do arquivo): um bufferView só para tudo, sem min/max nas saídas
 * (o glTF só exige nas entradas de tempo) e números com 6 casas. Os dados binários não mudam.
 */
export function compactGlb(buf: ArrayBuffer): ArrayBuffer {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as {
    accessors?: { bufferView?: number; byteOffset?: number; min?: number[]; max?: number[] }[];
    bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
    animations?: { samplers: { input: number }[] }[];
  };
  const binStart = 20 + jsonLen;
  const binLen = binStart + 8 <= buf.byteLength ? dv.getUint32(binStart, true) : 0;
  const inputs = new Set<number>();
  for (const a of json.animations ?? []) for (const sm of a.samplers) inputs.add(sm.input);
  const views = json.bufferViews ?? [];
  (json.accessors ?? []).forEach((acc, i) => {
    if (acc.bufferView !== undefined) { acc.byteOffset = (views[acc.bufferView]?.byteOffset ?? 0) + (acc.byteOffset ?? 0); acc.bufferView = 0; }
    if (!acc.byteOffset) delete acc.byteOffset;
    if (!inputs.has(i)) { delete acc.min; delete acc.max; }
  });
  if (views.length) json.bufferViews = [{ buffer: 0, byteLength: binLen }];
  const text = JSON.stringify(json, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(7)) : v));
  const enc = new TextEncoder().encode(text);
  const pad = (4 - (enc.length % 4)) % 4;
  const jsonChunk = new Uint8Array(enc.length + pad); jsonChunk.set(enc); jsonChunk.fill(0x20, enc.length);
  const rest = new Uint8Array(buf, binStart); // cabeçalho + dados do BIN, como estavam
  const total = 12 + 8 + jsonChunk.length + rest.length;
  const out = new ArrayBuffer(total), ov = new DataView(out), bytes = new Uint8Array(out);
  ov.setUint32(0, 0x46546c67, true); ov.setUint32(4, 2, true); ov.setUint32(8, total, true);
  ov.setUint32(12, jsonChunk.length, true); ov.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonChunk, 20); bytes.set(rest, 20 + jsonChunk.length);
  return out;
}
