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
import { animKind, type CreatureDef } from '@rules';
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

interface Loaded { scene: THREE.Object3D; clips: { clip: THREE.AnimationClip; kind: string }[] }

function ModelBody({ def, act }: { def: CreatureDef; act: CreatureAct }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const g = await loadGltf(def.model!.url);
      const clips: Loaded['clips'] = g.animations.map((c) => ({ clip: c, kind: animKind(def.model!.url, c.name) ?? 'idle' }));
      for (const a of def.model!.anims) {
        if (a.url === def.model!.url) continue;
        try { const ga = await loadGltf(a.url); ga.animations.forEach((c) => clips.push({ clip: c, kind: a.kind })); } catch { /* fica sem essa */ }
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
  const { root, mixer, actions, lu } = useMemo(() => {
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
    const root = new THREE.Group(); root.add(orient); root.scale.setScalar(def.size / Math.max(0.05, size.y));
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const { clip, kind } of data.clips) {
      if (actions.has(kind)) continue;
      const cl = clip.clone(); inPlace(cl);
      const a = mixer.clipAction(cl);
      if (kind === 'attack' || kind === 'hurt' || kind === 'happy') a.setLoop(THREE.LoopRepeat, Infinity);
      actions.set(kind, a);
    }
    return { root, mixer, actions, lu };
  }, [data, def.size]);
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
  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1) * (act === 'run' ? 1.4 : 1)));
  return <primitive object={root} />;
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
