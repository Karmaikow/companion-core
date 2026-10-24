/**
 * Corpo de uma criatura do Invocador: o modelo .GLB (com animações e aparência própria), a imagem (sprite que sempre
 * olha para a câmera) ou, sem nenhum dos dois, um slime de gelatina na cor dela. O mesmo componente serve para a
 * prévia no painel e para as criaturas andando no Companion World.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { animKind, motionFor, parseAnimRef, type CreatureDef } from '@rules';
import { inPlace, sanitizeSkins, restBox, facingYaw } from './CompanionModel';
import { lookUniforms, setLook, withLook } from './look';
import { SlimeBody } from './Slime';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();
const loadGltf = (url: string) => { let p = cache.get(url); if (!p) { p = new Promise<GLTF>((ok, bad) => loader.load(url, ok, undefined, bad)); cache.set(url, p); p.catch(() => cache.delete(url)); } return p; };

export type CreatureAct = 'idle' | 'walk' | 'run' | 'attack' | 'hurt' | 'happy' | 'sleep';

/** Corpo da criatura. `act` é o que ela está fazendo; o pai cuida da posição e da direção. */
export function CreatureBody({ def, act }: { def: CreatureDef; act: CreatureAct }) {
  if (def.model) return <ModelBody def={def} act={act} />;
  if (def.art) return <SpriteBody def={def} act={act} />;
  return <MistBody def={def} act={act} />;
}

interface Loaded { scene: THREE.Object3D; clips: { clip: THREE.AnimationClip; kind: string; src: string }[] }

function ModelBody({ def, act }: { def: CreatureDef; act: CreatureAct }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const g = await loadGltf(def.model!.url);
      // o nome do clipe decide (o endereço do arquivo só quando o clipe não diz nada); o clipe com o nome exato do
      // papel vem antes ("Walk" ganha de "Swim" no andar do kaiju)
      const exact = /^(idle|walk|run|attack|death|hit|sleep)$/i;
      const clips: Loaded['clips'] = g.animations.slice().sort((a, b) => Number(exact.test(b.name)) - Number(exact.test(a.name)))
        .map((c) => ({ clip: c, kind: animKind(c.name) ?? (g.animations.length === 1 ? animKind(def.model!.url) ?? 'idle' : 'special'), src: 'corpo' }));
      for (const a of def.model!.anims) {
        if (a.url === def.model!.url) continue;
        try { const ga = await loadGltf(a.url); ga.animations.forEach((c) => clips.push({ clip: c, kind: a.kind, src: a.name })); } catch { /* fica sem essa */ }
      }
      if (alive) setData({ scene: g.scene, clips });
    })().catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [def.model]);
  if (failed) return <MistBody def={def} act={act} />;
  if (!data) return null;
  return <ModelInstance def={def} data={data} act={act} />;
}

function ModelInstance({ def, data, act }: { def: CreatureDef; data: Loaded; act: CreatureAct }) {
  const { root, pivot, mixer, actions, lu } = useMemo(() => {
    const model = cloneSkinned(data.scene);
    sanitizeSkins(model);
    const lu = lookUniforms();
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      m.material = Array.isArray(m.material) ? m.material.map((x) => withLook(x.clone(), lu)) : withLook((m.material as THREE.Material).clone(), lu);
    });
    const box = restBox(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    const orient = new THREE.Group(); orient.rotation.y = -facingYaw(model); orient.add(model);
    // pivô no pé: o movimento por código (pulo, ginga, voo, serpentear) mexe aqui, sem rig
    const pivot = new THREE.Group(); pivot.add(orient);
    const root = new THREE.Group(); root.add(pivot); root.scale.setScalar(def.size / Math.max(0.05, size.y));
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const { clip, kind } of data.clips) {
      if (actions.has(kind)) continue;
      const cl = clip.clone(); inPlace(cl);
      const a = mixer.clipAction(cl);
      if (kind === 'attack' || kind === 'hurt' || kind === 'happy') a.setLoop(THREE.LoopRepeat, Infinity);
      actions.set(kind, a);
    }
    // escolhas do Administrador (aba Animações): um clipe para o papel, ou o movimento por código
    for (const [act, v] of Object.entries(def.animMap ?? {})) {
      const ref = parseAnimRef(v);
      if (ref === 'procedural') { actions.get(act)?.stop(); actions.delete(act); continue; }
      if (!ref) continue;
      const hit = data.clips.find((c) => c.clip.name === ref.clip && (ref.file === '*' || c.src === ref.file));
      if (!hit) continue;
      const cl = hit.clip.clone(); inPlace(cl);
      actions.set(act, mixer.clipAction(cl));
    }
    return { root, pivot, mixer, actions, lu };
  }, [data, def.size, def.animMap]);
  useEffect(() => setLook(lu, def.look), [lu, def.look]);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  const cur = useRef('');
  useEffect(() => {
    const want = actions.has(act) ? act : act === 'run' && actions.has('walk') ? 'walk' : actions.has('idle') ? 'idle' : [...actions.keys()][0];
    if (!want || cur.current === want) return;
    actions.get(want)?.reset().fadeIn(0.25).play();
    actions.forEach((a, k) => { if (k !== want && a.isRunning()) a.fadeOut(0.25); });
    cur.current = want;
  }, [act, actions]);
  const style = motionFor(def);
  const ph = useRef({ t: Math.random() * 10, act: act as string, since: 0 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    mixer.update(dt * (act === 'run' ? 1.4 : 1));
    // movimento por código: tudo quando o .GLB não tem animação; senão, só nas ações que faltam no modelo
    const P = ph.current; P.t += dt; if (P.act !== act) { P.act = act; P.since = 0; } P.since += dt;
    const own = actions.size > 0 && (actions.has(act) || (act === 'run' && actions.has('walk')));
    proceduralMotion(pivot, style, own ? 'idle-own' : act, P.t, P.since, actions.size > 0);
  });
  return <primitive object={root} />;
}

/**
 * Movimento de corpo inteiro sem rig (em unidades do modelo: 1 = altura). O pivô fica no pé, então amassar e
 * esticar parte do chão. `own`: a ação tem animação própria no modelo (aí não mexe).
 */
function proceduralMotion(g: THREE.Group, style: 'saltitar' | 'gingar' | 'flutuar' | 'rastejar', act: string, t: number, since: number, hasClips: boolean) {
  let y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1;
  if (act === 'idle-own') { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1); return; }
  const moving = act === 'walk' || act === 'run', run = act === 'run';
  const hover = style === 'flutuar' ? 0.28 + Math.sin(t * 2.2) * 0.05 : 0;
  // respirar parado (só sem animação nenhuma: um modelo com "parado" próprio já respira)
  if (!hasClips) { const b = Math.sin(t * 2.4) * 0.025; sy += b; sx -= b * 0.5; }
  if (moving) {
    const f = run ? 2 : 1.3; // passos por segundo (×2π abaixo)
    const w = t * Math.PI * 2 * f;
    if (style === 'saltitar') {
      const k = Math.abs(Math.sin(w)); y = k * (run ? 0.22 : 0.14);
      const land = Math.max(0, 1 - k * 4); sy *= 1 - land * 0.18; sx *= 1 + land * 0.12; // amassa ao tocar o chão
      sy *= 1 + k * 0.08; rx = 0.12 * (run ? 1.4 : 1) * k;
    } else if (style === 'gingar') {
      y = Math.abs(Math.sin(w)) * (run ? 0.06 : 0.035); rz = Math.sin(w) * (run ? 0.1 : 0.14); rx = run ? 0.18 : 0.06;
      ry = Math.sin(w) * 0.05;
    } else if (style === 'flutuar') {
      rx = run ? 0.32 : 0.18; rz = Math.sin(t * 3) * 0.12; y = Math.sin(w) * 0.04;
    } else {
      ry = Math.sin(w * 0.8) * (run ? 0.35 : 0.25); sx *= 1 + Math.sin(w * 1.6) * 0.04; rz = Math.sin(w * 0.8 + 1) * 0.06;
    }
  } else if (act === 'attack') {
    // investida: recua, avança, volta (ciclo de 0,8 s)
    const k = (since % 0.8) / 0.8, lunge = k < 0.35 ? -k / 0.35 * 0.3 : k < 0.55 ? -0.3 + (k - 0.35) / 0.2 * 1.3 : 1 - (k - 0.55) / 0.45;
    z = lunge * 0.22; rx = lunge * 0.28; sy *= 1 - Math.max(0, -lunge) * 0.15; sx *= 1 + Math.max(0, -lunge) * 0.1;
    if (style === 'rastejar') ry = Math.sin(since * 20) * 0.1 * Math.max(0, lunge);
  } else if (act === 'hurt') {
    const k = Math.max(0, 1 - since / 0.45);
    z = -0.12 * k; rx = -0.3 * k; rz = Math.sin(since * 50) * 0.12 * k; sy *= 1 - 0.12 * k; sx *= 1 + 0.08 * k;
  } else if (act === 'happy') {
    const k = Math.abs(Math.sin(t * 6)); y = k * 0.2; ry = t * 4;
  } else if (act === 'sleep') {
    const b = Math.sin(t * 1.1) * 0.03; sy = 0.92 + b; sx = 1.04 - b * 0.5; rz = 0.25;
  }
  g.position.set(0, y + hover, z);
  g.rotation.set(rx, ry, rz);
  g.scale.set(sx, sy, sx);
}

function SpriteBody({ def, act }: { def: CreatureDef; act: CreatureAct }) {
  const tex = useLoader(THREE.TextureLoader, def.art!.url);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; }, [tex]);
  const ref = useRef<THREE.Sprite>(null);
  const aspect = tex.image ? (tex.image as HTMLImageElement).width / Math.max(1, (tex.image as HTMLImageElement).height) : 1;
  useFrame((s) => {
    const t = s.clock.elapsedTime, sp = ref.current; if (!sp) return;
    const moving = act === 'walk' || act === 'run';
    sp.position.y = def.size / 2 + (moving ? Math.abs(Math.sin(t * (act === 'run' ? 14 : 9))) * 0.08 : Math.sin(t * 2) * 0.02);
    sp.scale.set(def.size * aspect * (act === 'attack' ? 1 + Math.max(0, Math.sin(t * 8)) * 0.12 : 1), def.size, 1);
  });
  return <sprite ref={ref}><spriteMaterial map={tex} transparent alphaTest={0.3} /></sprite>;
}

/** Sem modelo nem imagem: um slime de gelatina na cor da criatura (ver Slime.tsx). */
function MistBody({ def, act }: { def: CreatureDef; act: CreatureAct }) {
  return <SlimeBody def={def} act={act} />;
}
