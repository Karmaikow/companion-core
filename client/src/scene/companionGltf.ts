/**
 * Carregamento, cache e preparação geométrica de modelos .GLB de Companions e criaturas:
 * - Cache por URL (ignorando query string de token assinado) para evitar vazamento de texturas na GPU
 * - Remoção de deslocamento horizontal da raiz (`inPlace`) e cálculo de passo
 * - Saneamento de pesos/índices de ossos inválidos (`sanitizeSkins`)
 * - Medição de caixa delimitadora real com ossos aplicados (`restBox`) e direção frontal (`facingYaw`)
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { animKind, clipAnimKind, type AnimKind } from '@rules';
import type { CompanionModelFiles } from '../backend/types';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
export const loadGltf = (url: string) => new Promise<GLTF>((ok, bad) => loader.load(url, ok, undefined, bad));

/**
 * Modelo e animações do Companion, uma vez por arquivo (o endereço assinado muda, o arquivo não). Sem isto, cada vez que
 * a cena montava de novo o .glb inteiro era baixado e ia de novo para a placa — 4 texturas de 2048 (~88 MB) que nunca
 * eram liberadas, até o navegador derrubar o 3D.
 */
const companionFiles = new Map<string, Promise<GLTF>>();
export const loadCompanionGltf = (url: string) => {
  const k = url.split('?')[0];
  let p = companionFiles.get(k);
  if (!p) {
    p = loadGltf(url);
    companionFiles.set(k, p);
    p.catch(() => companionFiles.delete(k));
  }
  return p;
};

export interface LoadedCompanion {
  gltf: GLTF;
  clips: {
    clip: THREE.AnimationClip;
    kind: AnimKind | string;
    stride: number;
    /** arquivo de onde veio: "corpo" ou o nome do .GLB de animação */
    src: string;
  }[];
}

export async function loadCompanionBundle(files: CompanionModelFiles): Promise<LoadedCompanion> {
  const gltf = await loadCompanionGltf(files.url);
  const clips: LoadedCompanion['clips'] = [];
  const add = (list: THREE.AnimationClip[], kindHint: string | null, name: string) =>
    // "special" vindo do servidor (tipo que a função ainda não conhece): tenta pelo nome do arquivo/clipe
    list.forEach((clip) =>
      clips.push({
        clip,
        kind: clipAnimKind(clip.name, name, kindHint) ?? 'special',
        stride: inPlace(clip) / Math.max(0.01, clip.duration),
        src: name,
      }),
    );
  // pacotes de animação dedicados (ex.: padrao-m2m retargetado) vêm primeiro para prevalecer sobre clipes antigos embutidos no corpo
  for (const a of files.anims) {
    if (a.url === files.url) continue;
    try {
      const g = await loadCompanionGltf(a.url);
      add(g.animations, g.animations.length > 1 ? null : a.kind, a.name);
    } catch {
      /* animação que falhou só fica de fora */
    }
  }
  // várias animações num arquivo só: o tipo vem do nome de cada clipe; uma só: do nome do arquivo
  add(gltf.animations, gltf.animations.length > 1 ? null : animKind(files.url.split('?')[0]), 'corpo');
  return { gltf, clips };
}

/** Tira o deslocamento horizontal da raiz (quem move é o jogo) e devolve quanto ela andava por ciclo. */
export function inPlace(clip: THREE.AnimationClip): number {
  let best: THREE.KeyframeTrack | null = null, dist = 0;
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position') || t.values.length < 6) continue;
    const v = t.values, n = v.length;
    const d = Math.hypot(v[n - 3] - v[0], v[n - 1] - v[2]);
    if (d > dist) { dist = d; best = t; }
  }
  if (best && dist > 0.001) {
    const v = best.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return dist;
}

/** Rig com índice de osso inexistente derrubaria a renderização: esse vínculo vira peso zero no osso 0. */
export function sanitizeSkins(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const idx = m.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    const w = m.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
    const n = m.skeleton.bones.length;
    if (!idx || !w || !m.skeleton.bones.every(Boolean)) return;
    let fixed = false;
    for (let i = 0; i < idx.count; i++) for (let k = 0; k < 4; k++) {
      if (idx.getComponent(i, k) < n) continue;
      idx.setComponent(i, k, 0); w.setComponent(i, k, 0); fixed = true;
    }
    if (fixed) { idx.needsUpdate = true; w.needsUpdate = true; m.normalizeSkinWeights(); }
  });
}

/**
 * Caixa do modelo como ele aparece de verdade: com os ossos aplicados (a malha "crua" de alguns rigs do Tripo vem em
 * outra escala — a Mayuna humana media 2 m crua e 0,98 m com os ossos, e encolhia para metade). Se a conta precisa
 * falhar, cai para a geometria em pose de descanso.
 */
export function restBox(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  try {
    const precise = new THREE.Box3().setFromObject(root, true);
    const sz = precise.getSize(new THREE.Vector3());
    if (!precise.isEmpty() && Number.isFinite(sz.y) && sz.y > 1e-4) return precise;
  } catch { /* cai para a geometria */ }
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
  });
  return box;
}

/**
 * Para onde o modelo olha (o jogo anda com a frente em +Z). Humanoide em pé (mais alto que largo) segue a convenção
 * do glTF/Tripo/Mixamo: frente em +Z — de braços abertos ele é mais largo que fundo, e a regra de quadrúpede o
 * girava 90° (andava de lado). Corpo deitado: pela cabeça ou pelo comprimento.
 */
export function facingYaw(root: THREE.Object3D): number {
  const box = restBox(root), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  if (size.y > 1.1 * Math.max(size.x, size.z)) return 0;
  let head: THREE.Object3D | null = null;
  root.traverse((o) => { if (!head && o.name && /head|cabe[cç]a/i.test(o.name)) head = o; });
  if (head) {
    const p = (head as THREE.Object3D).getWorldPosition(new THREE.Vector3()).sub(c);
    if (Math.hypot(p.x, p.z) > 0.08 * Math.max(size.x, size.z)) return Math.atan2(p.x, p.z);
  }
  return size.x > size.z * 1.3 ? Math.PI / 2 : 0;
}
