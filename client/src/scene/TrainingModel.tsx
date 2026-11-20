/**
 * Modelo de Companion para os campos de treino do Administrador (Forja e Arsenal) e para o retrato 3D do Inventário:
 * carrega o .GLB, deixa com ~1 m e de frente para +Z (as mesmas regras do jogo), fica parado respirando e toca uma
 * animação a cada "deixa" (`cue`): por tipo ("attack", "cast", "attack:espada"…) ou por clipe ("clip:<nome>").
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { animKind, clipAnimKind, attackVariant, COMPANION_ANIM_SLOTS, parseAnimRef, type EquipSlot, type ItemDef } from '@rules';
import { companionModelById, useAnimMap } from '../ui/companionModels';
import { useSkills } from '../ui/skillState';
import { STANDARD_SLOTS } from '../m2m/slots';
import { restBox, facingYaw, inPlace, sanitizeSkins } from './CompanionModel';
import { EquipmentLayer, findGearBones } from './Equipment';

export interface Cue { id: number; kinds: string[]; speed?: number }

/** Lista de clipes do modelo (nome → tipo reconhecido), para escolhas no Administrador. */
export function clipKinds(clips: THREE.AnimationClip[]) {
  return clips.map((c) => ({ name: c.name, kind: animKind(c.name) ?? 'special' }));
}

export function TrainingModel({ url, anims, cue, items, equipSlots, modelKey, charge, showSocket, companionId, timeScale = 1 }: { timeScale?: number; url: string; anims?: { url: string; name: string; kind: string }[]; cue: Cue | null; items?: ItemDef[]; equipSlots?: Record<string, EquipSlot>; modelKey?: string | null; charge?: { current: number }; showSocket?: boolean; companionId?: string | null }) {
  const gltf = useLoader(GLTFLoader, url, (l) => { (l as GLTFLoader).setMeshoptDecoder(MeshoptDecoder); });
  // como no jogo: as animações extras do Companion (o pacote padrão do Mesh2Motion fica num arquivo à parte) e as
  // escolhas da aba Animações ("slot:<papel>"); no Inventário elas vêm direto via `anims` e `useSkills`
  const who = companionId ?? modelKey ?? null;
  const dbSlots = useAnimMap(who);
  const liveSlots = useSkills((s) => s.animMap);
  const slots = useMemo(() => ({ ...liveSlots, ...dbSlots }), [liveSlots, dbSlots]);
  const [extra, setExtra] = useState<{ file: string; clips: THREE.AnimationClip[]; kind: string }[]>([]);
  const animsKey = (anims ?? []).map((a) => a.url.split('?')[0]).join('|');
  useEffect(() => {
    const list = (anims?.length ? anims : companionModelById(who)?.anims ?? []).filter((a) => a.url.split('?')[0] !== url.split('?')[0]);
    if (!list.length) { setExtra([]); return; }
    let alive = true;
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    Promise.all(list.map((a) => l.loadAsync(a.url).then((g) => ({ file: a.name, clips: g.animations, kind: a.kind }), () => null)))
      .then((res) => { if (alive) setExtra(res.filter((x): x is { file: string; clips: THREE.AnimationClip[]; kind: string } => !!x)); });
    return () => { alive = false; };
  }, [who, url, animsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const root = useRef<THREE.Group>(null);
  const { model, scale, mixer, actions, bones } = useMemo(() => {
    const m = cloneSkinned(gltf.scene);
    sanitizeSkins(m);
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const box = restBox(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const scale = 1 / Math.max(0.05, size.y);
    m.position.set(-c.x, -box.min.y, -c.z);
    const orient = new THREE.Group(); orient.rotation.y = -facingYaw(m); orient.add(m);
    const mixer = new THREE.AnimationMixer(m);
    const actions = new Map<string, THREE.AnimationAction>();
    // Os pacotes retargetados (extra, ex.: padrao-m2m) entram ANTES das animações cruas embutidas no corpo,
    // evitando que um clipe antigo sem retarget (com braços cruzados/invertidos em pose A) sobrescreva o pacote corrigido.
    const all = [
      ...extra.flatMap((e) => e.clips.map((clip) => ({ file: e.file, clip, hint: e.clips.length > 1 ? null : (e.kind ?? null) }))),
      ...gltf.animations.map((clip) => ({ file: 'corpo', clip, hint: gltf.animations.length > 1 ? null : animKind(url.split('?')[0]) })),
    ];
    const put = (k: string, clip: THREE.AnimationClip, force = false) => {
      if (!force && actions.has(k)) return;
      const cloned = clip.clone();
      const stride = inPlace(cloned) / Math.max(0.01, cloned.duration);
      // ignora "idle" embutido que na verdade anda
      if (k === 'idle' && !force && stride * scale > 0.12) return;
      const a = mixer.clipAction(cloned);
      a.setLoop(k === 'idle' || k === 'walk' || k === 'run' ? THREE.LoopRepeat : THREE.LoopOnce, k === 'idle' || k === 'walk' || k === 'run' ? Infinity : 1);
      a.clampWhenFinished = false;
      actions.set(k, a);
    };
    for (const { file, clip, hint } of all) {
      // quando há pacote retargetado (extra), ignora clipes de 'corpo' para os papéis principais (evita braços invertidos do molde cru)
      const fromCorpoWithExtra = file === 'corpo' && extra.length > 0;
      const kind = clipAnimKind(clip.name, file, hint);
      if (kind && !fromCorpoWithExtra) put(kind, clip);
      if (kind === 'attack' && !fromCorpoWithExtra) { const v = attackVariant(clip.name); if (v) put('attack:' + v, clip); }
      put('clip:' + clip.name, clip);
    }
    // papéis padrão do Mesh2Motion pelo nome do clipe (caso companion_skill_anims ainda esteja carregando)
    for (const [role, clipName] of Object.entries(STANDARD_SLOTS)) {
      if (actions.has(role)) continue;
      const hit = all.find((x) => x.file !== 'corpo' && x.clip.name === clipName) ?? all.find((x) => x.clip.name === clipName);
      if (hit) put(role, hit.clip, true);
    }
    // escolhas do Administrador por papel, por cima do automático
    for (const sl of COMPANION_ANIM_SLOTS) {
      const ref = parseAnimRef(slots['slot:' + sl.key]);
      if (!ref || ref === 'procedural') continue;
      const hit = all.find((c2) => c2.clip.name === ref.clip && (ref.file === '*' || c2.file === ref.file)) ?? all.find((c2) => c2.clip.name === ref.clip);
      if (hit) put(sl.key, hit.clip, true);
    }
    if (!actions.has('idle')) {
      const base = all.find((x) => x.file !== 'corpo' && clipAnimKind(x.clip.name, x.file, x.hint) === 'walk') ?? all[0];
      if (base) { const a = mixer.clipAction(base.clip.clone()); a.timeScale = 0; actions.set('idle', a); }
    }
    return { model: orient, scale, mixer, actions, bones: findGearBones(m) };
  }, [gltf, extra, slots, url]);

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
      {items && items.length > 0 && <EquipmentLayer items={items} slots={equipSlots} bones={bones} root={root} charge={charge} modelKey={modelKey} showSocket={showSocket} />}
    </>
  );
}
