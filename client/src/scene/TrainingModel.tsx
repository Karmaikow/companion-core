/**
 * Modelo de Companion para os campos de treino do Administrador (Forja e Arsenal): carrega o .GLB, deixa com ~1 m e de
 * frente para +Z (as mesmas regras do jogo), fica parado respirando e toca uma animação a cada "deixa" (`cue`):
 * por tipo ("attack", "cast", "attack:espada"…) ou por clipe ("clip:<nome>"). Pode segurar itens (pegada por modelo).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { animKind, attackVariant, type ItemDef } from '@rules';
import { restBox, facingYaw, sanitizeSkins } from './CompanionModel';
import { EquipmentLayer, findGearBones } from './Equipment';

export interface Cue { id: number; kinds: string[]; speed?: number }

/** Lista de clipes do modelo (nome → tipo reconhecido), para escolhas no Administrador. */
export function clipKinds(clips: THREE.AnimationClip[]) {
  return clips.map((c) => ({ name: c.name, kind: animKind(c.name) ?? 'special' }));
}

export function TrainingModel({ url, cue, items, modelKey, charge, showSocket }: { url: string; cue: Cue | null; items?: ItemDef[]; modelKey?: string | null; charge?: { current: number }; showSocket?: boolean }) {
  const gltf = useLoader(GLTFLoader, url, (l) => { (l as GLTFLoader).setMeshoptDecoder(MeshoptDecoder); });
  const root = useRef<THREE.Group>(null);
  const { model, scale, mixer, actions, bones } = useMemo(() => {
    const m = cloneSkinned(gltf.scene);
    sanitizeSkins(m);
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const box = restBox(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    const orient = new THREE.Group(); orient.rotation.y = -facingYaw(m); orient.add(m);
    const mixer = new THREE.AnimationMixer(m);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) {
      const kind = animKind(clip.name);
      const once = (k: string) => { const a = mixer.clipAction(clip.clone()); a.setLoop(k === 'idle' ? THREE.LoopRepeat : THREE.LoopOnce, 1); a.clampWhenFinished = false; actions.set(k, a); };
      if (kind && !actions.has(kind)) once(kind);
      if (kind === 'attack') { const v = attackVariant(clip.name); if (v && !actions.has('attack:' + v)) once('attack:' + v); }
      once('clip:' + clip.name);
    }
    return { model: orient, scale: 1 / Math.max(0.05, size.y), mixer, actions, bones: findGearBones(m) };
  }, [gltf]);

  const cur = useRef<THREE.AnimationAction | null>(null);
  const toIdle = () => {
    const idle = actions.get('idle');
    if (cur.current && cur.current !== idle) cur.current.fadeOut(0.2);
    if (idle) idle.reset().fadeIn(0.2).play();
    cur.current = idle ?? null;
  };
  useEffect(() => { toIdle(); return () => { mixer.stopAllAction(); }; }, [mixer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cue) return;
    const key = cue.kinds.find((k) => actions.has(k));
    if (!key) return;
    const a = actions.get(key)!;
    if (cur.current && cur.current !== a) cur.current.fadeOut(0.08);
    a.reset(); a.timeScale = cue.speed ?? 1; a.fadeIn(0.06).play();
    cur.current = a;
    const back = (e: { action: THREE.AnimationAction }) => { if (e.action === a) toIdle(); };
    mixer.addEventListener('finished', back);
    return () => mixer.removeEventListener('finished', back);
  }, [cue, actions, mixer]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => mixer.update(Math.min(dt, 0.05)));
  return (
    <>
      <group ref={root}>
        <group scale={scale}><primitive object={model} /></group>
      </group>
      {items && items.length > 0 && <EquipmentLayer items={items} bones={bones} root={root} charge={charge} modelKey={modelKey} showSocket={showSocket} />}
    </>
  );
}
