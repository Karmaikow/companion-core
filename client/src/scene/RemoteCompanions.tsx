/**
 * Os Companions de outros jogadores no Companion World (presença, MMO fase 1). Desenho leve: o modelo 3D com
 * parado/andando/correndo e a plaquinha com o nome; sem modelo (ainda em forma de luz), uma esfera brilhante na cor
 * dele. A posição chega ~4×/s e é suavizada a cada quadro. Não colidem e não entram no combate.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { animKind, parseAnimRef } from '@rules';
import { remotePoses, usePresence, type RemoteInfo } from '../net/presence';
import { useRemoteSpeech, useSocial } from '../net/social';
import { facingYaw, inPlace, loadGltf, restBox, sanitizeSkins } from './CompanionModel';
import { companionFocus, type WorldShape } from './world';

/** Até onde desenhar (m) e quantos no máximo (os mais perto). */
const VIEW_R = 70, MAX_SHOWN = 24;

const cache = new Map<string, Promise<GLTF>>();
const loadOnce = (url: string) => { const k = url.split('?')[0]; if (!cache.has(k)) cache.set(k, loadGltf(url)); return cache.get(k)!; };

export function RemoteCompanions({ world }: { world: WorldShape }) {
  const others = usePresence((s) => s.others);
  const [near, setNear] = useState<string[]>([]);
  // quem está perto o bastante (revisto a cada meio segundo; a lista só muda quando muda de verdade)
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.5) return;
    acc.current = 0;
    const list = others.map((o) => { const p = remotePoses.get(o.id); return { id: o.id, d: p && Number.isFinite(p.x) ? Math.hypot(p.x - companionFocus.x, p.z - companionFocus.z) : Infinity }; })
      .filter((o) => o.d < VIEW_R).sort((a, b) => a.d - b.d).slice(0, MAX_SHOWN).map((o) => o.id).sort();
    if (list.join() !== near.join()) setNear(list);
  });
  return <>{others.filter((o) => near.includes(o.id)).map((o) => <Remote key={o.id} info={o} world={world} />)}</>;
}

interface Body { model: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; walk: number; run: number }

function Remote({ info, world }: { info: RemoteInfo; world: WorldShape }) {
  const root = useRef<THREE.Group>(null), lie = useRef<THREE.Group>(null);
  const [body, setBody] = useState<Body | null>(null);
  const modelKey = info.model ? info.model.url.split('?')[0] : '';
  useEffect(() => {
    const m = info.model;
    if (!m) { setBody(null); return; }
    let alive = true;
    (async () => {
      const gltf = await loadOnce(m.url);
      const clips: { clip: THREE.AnimationClip; kind: string; stride: number; src: string }[] = [];
      const add = (list: THREE.AnimationClip[], hint: string | null, src: string) => list.forEach((clip) => clips.push({ clip, kind: (hint && hint !== 'special' ? hint : null) ?? animKind(clip.name) ?? 'special', stride: inPlace(clip) / Math.max(0.01, clip.duration), src }));
      add(gltf.animations, gltf.animations.length > 1 ? null : animKind(m.url.split('?')[0]), 'corpo');
      for (const a of m.anims) { if (a.url === m.url) continue; try { const g = await loadOnce(a.url); add(g.animations, g.animations.length > 1 ? null : a.kind, a.name); } catch { /* sem essa animação */ } }
      const model = cloneSkinned(gltf.scene);
      sanitizeSkins(model);
      model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      const box = restBox(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const scale = 1 / Math.max(0.05, size.y);
      model.position.set(-c.x, -box.min.y, -c.z);
      const orient = new THREE.Group(); orient.rotation.y = -facingYaw(model); orient.add(model);
      const holder = new THREE.Group(); holder.scale.setScalar(scale); holder.add(orient);
      const mixer = new THREE.AnimationMixer(model), actions = new Map<string, THREE.AnimationAction>();
      let walk = 0.7, run = 1.4;
      for (const k of ['idle', 'walk', 'run']) {
        const ref = parseAnimRef(info.slots?.[k]);
        const c2 = (ref && ref !== 'procedural' ? clips.find((x) => x.clip.name === ref.clip && (ref.file === '*' || x.src === ref.file)) : null) ?? clips.find((x) => x.kind === k);
        if (!c2) continue;
        actions.set(k, mixer.clipAction(c2.clip));
        if (k === 'walk') walk = Math.max(0.3, c2.stride * scale);
        if (k === 'run') run = Math.max(walk * 1.4, c2.stride * scale);
      }
      // sem "parado": o primeiro quadro do andar (em vez da pose de braços abertos)
      if (!actions.has('idle')) { const base = clips.find((x) => x.kind === 'walk') ?? clips.find((x) => x.kind === 'run'); if (base) { const a = mixer.clipAction(base.clip.clone()); a.timeScale = 0; actions.set('idle', a); } }
      if (alive) setBody({ model: holder, mixer, actions, walk, run });
    })().catch(() => { if (alive) setBody(null); });
    return () => { alive = false; };
  }, [modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const speech = useRemoteSpeech((s) => s[info.id]);
  const party = useSocial((s) => !!s.data?.party?.members.some((m) => m.id === info.id));
  const friend = useSocial((s) => !!s.data?.friends.some((m) => m.id === info.id));
  const st = useRef({ x: NaN, z: NaN, yaw: 0, speed: 0, act: '' });
  const orb = useMemo(() => new THREE.Color(info.color), [info.color]);
  useFrame((state, dtRaw) => {
    const r = root.current, p = remotePoses.get(info.id);
    if (!r || !p || !Number.isFinite(p.x)) return;
    const dt = Math.min(dtRaw, 0.1), s = st.current;
    if (!Number.isFinite(s.x)) { s.x = p.x; s.z = p.z; s.yaw = p.yaw; }
    // segue a última posição recebida (suave) e estima a velocidade para escolher a animação
    const k = Math.min(1, dt * 8), bx = s.x, bz = s.z;
    s.x += (p.x - s.x) * k; s.z += (p.z - s.z) * k;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 12) { s.x = p.x; s.z = p.z; } // teletransporte
    const v = Math.hypot(s.x - bx, s.z - bz) / Math.max(1e-3, dt);
    s.speed += (v - s.speed) * Math.min(1, dt * 6);
    let dy = p.yaw - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    s.yaw += dy * Math.min(1, dt * 8);
    r.position.set(s.x, world.heightAt(s.x, s.z), s.z);
    r.rotation.y = s.yaw;
    if (lie.current) lie.current.rotation.z += ((p.down ? Math.PI / 2.3 : 0) - lie.current.rotation.z) * Math.min(1, dt * 5);
    if (body) {
      const want = p.down ? 'idle' : s.speed > (body.walk + body.run) / 2 && body.actions.has('run') ? 'run' : s.speed > 0.15 && body.actions.has('walk') ? 'walk' : 'idle';
      if (want !== s.act) {
        const next = body.actions.get(want), prev = body.actions.get(s.act);
        if (next) { next.reset().fadeIn(0.2).play(); prev?.fadeOut(0.2); s.act = want; }
      }
      const a = body.actions.get(s.act);
      if (a && (s.act === 'walk' || s.act === 'run')) a.timeScale = Math.min(3, Math.max(0.5, s.speed / (s.act === 'run' ? body.run : body.walk)));
      body.mixer.update(dt);
    } else if (lie.current) {
      lie.current.position.y = 0.55 + Math.sin(state.clock.elapsedTime * 2 + info.id.length) * 0.06;
    }
  });
  return (
    <group ref={root}>
      <group ref={lie}>
        {body ? <primitive object={body.model} /> : (
          <mesh position={[0, 0, 0]}><sphereGeometry args={[0.28, 24, 16]} /><meshStandardMaterial color={orb} emissive={orb} emissiveIntensity={1.6} toneMapped={false} /></mesh>
        )}
      </group>
      <Html position={[0, 1.35, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="remote-stack">
          {speech && <div className="speech remote-speech" key={speech.id}>{speech.text}</div>}
          <div className={'remote-tag' + (party ? ' party' : friend ? ' friend' : '')} style={{ ['--c' as string]: info.color }}>{party ? '◆ ' : friend ? '♥ ' : ''}{info.name}</div>
        </div>
      </Html>
    </group>
  );
}
