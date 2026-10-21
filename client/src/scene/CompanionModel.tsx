/**
 * Companion em 3D: o modelo aprovado na Fábrica + animações vindas de outros .GLB do mesmo rig.
 * Ela passeia pela clareira: anda até um ponto, para, respira, às vezes dorme à noite ou comemora conquistas.
 * A velocidade de andar vem do próprio passo da animação (deslocamento da raiz ÷ duração), para as patas não patinarem.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { animKind, strideSpeed, gameTime, type AnimKind } from '@rules';
import type { CompanionModelFiles } from '../backend/types';
import { CLEAR_R, type WorldShape } from './world';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = (url: string) => new Promise<GLTF>((ok, bad) => loader.load(url, ok, undefined, bad));

interface Loaded { gltf: GLTF; clips: { clip: THREE.AnimationClip; kind: AnimKind | string; stride: number }[] }

/** Tira o deslocamento horizontal da raiz (quem move é o jogo) e devolve quanto ela andava por ciclo. */
function inPlace(clip: THREE.AnimationClip): number {
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
function sanitizeSkins(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const idx = m.geometry.getAttribute('skinIndex') as THREE.BufferAttribute, w = m.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
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

/** Caixa do modelo pela geometria em pose de descanso (sem consultar ossos — mais robusto com rigs gerados). */
function restBox(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
  });
  return box;
}

/** Para onde o modelo olha: pelo osso/objeto da cabeça; sem cabeça, pelo comprimento do corpo. O jogo anda com a frente em +Z. */
function facingYaw(root: THREE.Object3D): number {
  const box = restBox(root), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  let head: THREE.Object3D | null = null;
  root.traverse((o) => { if (!head && o.name && /head|cabe[cç]a/i.test(o.name)) head = o; });
  if (head) {
    const p = (head as THREE.Object3D).getWorldPosition(new THREE.Vector3()).sub(c);
    if (Math.hypot(p.x, p.z) > 0.08 * Math.max(size.x, size.z)) return Math.atan2(p.x, p.z);
  }
  return size.x > size.z * 1.3 ? Math.PI / 2 : 0;
}

const ONCE = new Set(['happy', 'jump', 'attack', 'hurt', 'eat']);

export function CompanionModel({ files, world, burstKey, onFail }: { files: CompanionModelFiles; world: WorldShape; burstKey: number; onFail: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const gltf = await load(files.url);
      const clips: Loaded['clips'] = [];
      const add = (list: THREE.AnimationClip[], kindHint: string | null, name: string) =>
        list.forEach((clip) => clips.push({ clip, kind: kindHint ?? animKind(name, clip.name) ?? 'special', stride: inPlace(clip) / Math.max(0.01, clip.duration) }));
      add(gltf.animations, animKind(files.url.split('?')[0]), 'corpo');
      for (const a of files.anims) {
        if (a.url === files.url) continue;
        try { const g = await load(a.url); add(g.animations, a.kind, a.name); } catch { /* animação que falhou só fica de fora */ }
      }
      if (alive) setLoaded({ gltf, clips });
    })().catch(() => alive && onFail());
    return () => { alive = false; };
  }, [files, onFail]);
  if (!loaded) return null;
  return <Walker loaded={loaded} world={world} burstKey={burstKey} />;
}

function Walker({ loaded, world, burstKey }: { loaded: Loaded; world: WorldShape; burstKey: number }) {
  const root = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const { model, scale, mixer, actions, walkSpeed } = useMemo(() => {
    // cópia com esqueleto próprio: o React pode repetir este cálculo, e o original não pode ser movido entre grupos
    const model = cloneSkinned(loaded.gltf.scene);
    sanitizeSkins(model);
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const box = restBox(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const scale = 1.0 / Math.max(0.05, size.y); // todo Companion fica com ~1 m na primeira forma
    model.position.set(-c.x, -box.min.y, -c.z);
    const orient = new THREE.Group(); orient.rotation.y = -facingYaw(model); orient.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    let stride = 0;
    for (const c2 of loaded.clips) {
      if (actions.has(c2.kind)) continue;
      const a = mixer.clipAction(c2.clip);
      if (ONCE.has(c2.kind)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
      actions.set(c2.kind, a);
      if (c2.kind === 'walk') stride = c2.stride * scale;
    }
    const walkSpeed = actions.has('walk') ? strideSpeed(stride, 1, 0.7) : 0.7;
    return { model: orient, scale, mixer, actions, walkSpeed };
  }, [loaded]);

  const st = useRef({ target: new THREE.Vector3(1.6, 0, 1.4), wait: 2, act: '' as string, yaw: 0, burst: burstKey, once: 0 });
  const play = (kind: string, fade = 0.3) => {
    const s = st.current;
    if (s.act === kind) return;
    const next = actions.get(kind), prev = actions.get(s.act);
    if (next) next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    s.act = kind;
  };
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

  useFrame((state, dt) => {
    const s = st.current, r = root.current, p = pose.current;
    if (!r || !p) return;
    const t = state.clock.elapsedTime;
    // conquista: comemora (se tiver a animação) e para um pouco
    if (s.burst !== burstKey) { s.burst = burstKey; if (actions.has('happy')) { play('happy', 0.15); s.once = actions.get('happy')!.getClip().duration; } s.wait = 2.5; s.target.copy(r.position); }
    if (s.once > 0) { s.once -= dt; mixer.update(dt); return; }

    const to = new THREE.Vector3(s.target.x - r.position.x, 0, s.target.z - r.position.z);
    const d = to.length();
    if (d > 0.08) {
      to.normalize();
      const step = Math.min(d, walkSpeed * dt);
      r.position.x += to.x * step; r.position.z += to.z * step;
      const want = Math.atan2(to.x, to.z); let dy = want - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      s.yaw += dy * Math.min(1, dt * 5);
      play(actions.has('walk') ? 'walk' : 'idle');
    } else {
      s.wait -= dt;
      const night = gameTime(Date.now()).phase === 'madrugada';
      play(night && actions.has('sleep') ? 'sleep' : 'idle');
      if (s.wait <= 0 && !(night && actions.has('sleep'))) {
        // próximo passeio: um ponto da clareira, longe do altar
        const a = Math.random() * Math.PI * 2, rr = 2.3 + Math.random() * (CLEAR_R - 4);
        s.target.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        s.wait = 3 + Math.random() * 6;
      }
    }
    r.position.y = world.heightAt(r.position.x, r.position.z);
    r.rotation.y = s.yaw;
    // sem animação de andar: um quique leve por procedimento; parada, respira
    const moving = d > 0.08;
    p.position.y = moving && !actions.has('walk') ? Math.abs(Math.sin(t * 9)) * 0.06 : 0;
    const br = !moving && !actions.has('idle') ? Math.sin(t * 2.2) * 0.02 : 0;
    p.scale.set(scale * (1 - br * 0.5), scale * (1 + br), scale * (1 - br * 0.5));
    mixer.update(dt);
  });

  return (
    <group ref={root} position={[1.6, 0, 1.4]}>
      <group ref={pose} scale={scale}>
        <primitive object={model} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.45, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}
