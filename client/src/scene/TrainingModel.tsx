/**
 * Modelo de Companion para os campos de treino do Administrador (Forja e Arsenal): carrega o .GLB, deixa com ~1 m e de
 * frente para +Z (as mesmas regras do jogo), fica parado respirando e toca uma animação a cada "deixa" (`cue`):
 * por tipo ("attack", "cast", "attack:espada"…) ou por clipe ("clip:<nome>"). Pode segurar itens (pegada por modelo).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { animKind, attackVariant, COMPANION_ANIM_SLOTS, parseAnimRef, type ItemDef } from '@rules';
import { companionModelById, useAnimMap } from '../ui/companionModels';
import { restBox, facingYaw, sanitizeSkins } from './CompanionModel';
import { EquipmentLayer, findGearBones } from './Equipment';

export interface Cue { id: number; kinds: string[]; speed?: number }

/** Lista de clipes do modelo (nome → tipo reconhecido), para escolhas no Administrador. */
export function clipKinds(clips: THREE.AnimationClip[]) {
  return clips.map((c) => ({ name: c.name, kind: animKind(c.name) ?? 'special' }));
}

export function TrainingModel({ url, cue, items, modelKey, charge, showSocket, companionId, timeScale = 1 }: { timeScale?: number; url: string; cue: Cue | null; items?: ItemDef[]; modelKey?: string | null; charge?: { current: number }; showSocket?: boolean; companionId?: string | null }) {
  const gltf = useLoader(GLTFLoader, url, (l) => { (l as GLTFLoader).setMeshoptDecoder(MeshoptDecoder); });
  // como no jogo: as animações extras do Companion (o pacote padrão do Mesh2Motion fica num arquivo à parte) e as
  // escolhas da aba Animações ("slot:<papel>"); sem isso o modelo riggado no Mesh2Motion ficava parado no treino
  const who = companionId ?? modelKey ?? null;
  const slots = useAnimMap(who);
  const [extra, setExtra] = useState<{ file: string; clips: THREE.AnimationClip[] }[]>([]);
  useEffect(() => {
    const ref = companionModelById(who);
    if (!ref?.anims.length) { setExtra([]); return; }
    let alive = true;
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    Promise.all(ref.anims.map((a) => l.loadAsync(a.url).then((g) => ({ file: a.name, clips: g.animations }), () => null)))
      .then((list) => { if (alive) setExtra(list.filter((x): x is { file: string; clips: THREE.AnimationClip[] } => !!x)); });
    return () => { alive = false; };
  }, [who]);
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
    const all = [...gltf.animations.map((clip) => ({ file: 'corpo', clip })), ...extra.flatMap((e) => e.clips.map((clip) => ({ file: e.file, clip })))];
    const put = (k: string, clip: THREE.AnimationClip, force = false) => {
      if (!force && actions.has(k)) return;
      const a = mixer.clipAction(clip.clone()); a.setLoop(k === 'idle' || k === 'walk' || k === 'run' ? THREE.LoopRepeat : THREE.LoopOnce, k === 'idle' || k === 'walk' || k === 'run' ? Infinity : 1); a.clampWhenFinished = false; actions.set(k, a);
    };
    for (const { clip } of all) {
      const kind = animKind(clip.name);
      if (kind) put(kind, clip);
      if (kind === 'attack') { const v = attackVariant(clip.name); if (v) put('attack:' + v, clip); }
      put('clip:' + clip.name, clip);
    }
    // escolhas do Administrador por papel, por cima do automático
    for (const sl of COMPANION_ANIM_SLOTS) {
      const ref = parseAnimRef(slots['slot:' + sl.key]);
      if (!ref || ref === 'procedural') continue;
      const hit = all.find((c) => c.clip.name === ref.clip && (ref.file === '*' || c.file === ref.file));
      if (hit) put(sl.key, hit.clip, true);
    }
    return { model: orient, scale: 1 / Math.max(0.05, size.y), mixer, actions, bones: findGearBones(m) };
  }, [gltf, extra, slots]);

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

  // só no dev: os labs posam uma animação num instante exato (window.__train.pose('shoot', 0.45))
  const frozen = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __train: unknown }).__train = {
      pose: (k: string, f: number) => { const a = actions.get(k); if (!a) return false; frozen.current = true; mixer.stopAllAction(); a.reset().play(); a.paused = false; mixer.setTime(a.getClip().duration * f); return a.getClip().duration; },
      free: () => { frozen.current = false; },
      where: (re: string) => { const out: string[] = []; model.updateMatrixWorld(true); model.traverse((o) => { if ((o as THREE.Bone).isBone && new RegExp(re).test(o.name)) out.push(o.name + ' ' + o.getWorldPosition(new THREE.Vector3()).toArray().map((n) => n.toFixed(2)).join(',')); }); return out; },
      list: () => [...actions.entries()].map(([k, a]) => k + '=' + a.getClip().name + ':' + a.getClip().tracks.length),
    };
  }, [actions, mixer, model]);
  useFrame((_, dt) => { if (!frozen.current) mixer.update(Math.min(dt, 0.05) * timeScale); });
  return (
    <>
      <group ref={root}>
        <group scale={scale}><primitive object={model} /></group>
      </group>
      {items && items.length > 0 && <EquipmentLayer items={items} bones={bones} root={root} charge={charge} modelKey={modelKey} showSocket={showSocket} />}
    </>
  );
}
