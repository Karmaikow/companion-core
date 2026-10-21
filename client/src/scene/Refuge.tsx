/**
 * O Refúgio é uma clareira escondida, cercada de pedras e árvores (portada do lab "Clareira do Refúgio").
 * Nasce só com o altar e o círculo mágico; as peças surgem conforme o Companion cresce (refugeFeatures).
 * A passagem na muralha de pedra — a "janela para o mundo" — só abre depois do primeiro sonho.
 * Visual: fantasia clara, materiais originais dos modelos (sem o filtro anime), dia e noite pelo relógio do jogo.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, TiltShift2, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { gameTime, type IdentityContractV1, type RefugeFeatures } from '@rules';
import type { CompanionModelFiles } from '../backend/types';
import { ParticleCore } from './ParticleCore';
import { FirstForm } from './FirstForm';
import { CompanionModel } from './CompanionModel';
import { runeTexture } from './textures';
import { Grow, Crystals, Nest, Cauldron, ElementFeature, Shockwave, Plant, Lantern } from './pieces';
import { makeWorld, mulberry32, smooth, angDiff, withWind, windTime, CLEAR_R, RIM_R, type WorldShape } from './world';

export interface RefugeProps {
  color: string;
  glow: string;
  element?: string;
  energy: number; // 0..1, cresce com o vínculo
  pulseKey: number;
  /** Conquistas grandes: onda de luz saindo do altar. */
  burstKey?: number;
  features?: RefugeFeatures;
  contract: IdentityContractV1 | null;
  /** Arte aprovada na Fábrica (imagem de referência). */
  artUrl?: string;
  /** Modelo 3D aprovado na Fábrica, com as animações. */
  model?: CompanionModelFiles;
  /** Seed da clareira (cada Companion tem a sua). */
  seed: number;
  quality: 'high' | 'low';
}

const ASSETS = '/assets/refuge/';
const C = (h: string) => new THREE.Color(h);

// ---------------------------------------------------------------------------
// Chão, muralha de pedra e vegetação
// ---------------------------------------------------------------------------

function Terrain({ world }: { world: WorldShape }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(64, 64, 128, 128).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, world.heightAt(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color(), t = new THREE.Color();
    const gLit = C('#8fcf60'), gDark = C('#5aa84c'), dirt = C('#d8b07a'), dirtDark = C('#b98c5c'), moss = C('#a8de7c'), cliff = C('#b4a9cf');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      c.copy(gDark).lerp(gLit, world.noise(x * 0.2 + 11, z * 0.2));
      if (r > RIM_R + 2) c.lerp(moss, 0.5);
      const d = world.dirtAt(x, z);
      if (d > 0) c.lerp(t.copy(dirtDark).lerp(dirt, world.noise(x * 0.5, z * 0.5)), d);
      c.lerp(cliff, smooth(0.86, 0.6, n.getY(i)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [world]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

/** Pedras facetadas da muralha (procedurais, leves) — o modelo de pedra do Tripo entra entre elas. */
function useRockGeos() {
  return useMemo(() => [0, 1, 2, 3].map((i) => {
    const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    const p = g.attributes.position, r = mulberry32(100 + i), map = new Map<string, number>();
    for (let k = 0; k < p.count; k++) {
      const key = Math.round(p.getX(k) * 1e3) + ',' + Math.round(p.getY(k) * 1e3) + ',' + Math.round(p.getZ(k) * 1e3);
      if (!map.has(key)) map.set(key, 0.78 + r() * 0.4);
      const s = map.get(key)!; let y = p.getY(k) * s; if (y < -0.35) y = -0.35;
      p.setXYZ(k, p.getX(k) * s, y, p.getZ(k) * s);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const top = C('#97d36a'), side = C('#b3a8d2'), bottom = C('#7a6e9c');
    for (let f = 0; f < p.count; f += 3) {
      const ny = (n.getY(f) + n.getY(f + 1) + n.getY(f + 2)) / 3, cy = ((p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3 + 0.35) / 1.55;
      c.copy(side).lerp(bottom, Math.pow(1 - cy, 1.8) * 0.7);
      if (ny > 0.5) c.lerp(top, smooth(0.5, 0.75, ny));
      c.multiplyScalar(0.93 + r() * 0.14);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }), []);
}

interface Spot { x: number; z: number; rot: number; s: number }

function Cliffs({ world, quality }: { world: WorldShape; quality: 'high' | 'low' }) {
  const geos = useRockGeos();
  const rocks = useMemo(() => {
    const rng = mulberry32(world.seed + 7), out: { g: number; p: [number, number, number]; s: [number, number, number]; r: number }[] = [];
    const N = 34;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.1;
      if (world.open && angDiff(a, world.gap) < 0.34) continue;
      const r = RIM_R + 1.6 + rng() * 1.4, s = 1.3 + rng() * 1.3, sy = s * (1 + rng() * 0.8);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      out.push({ g: i % 4, p: [x, world.heightAt(x, z) + sy * 0.15, z], s: [s, sy, s * (0.85 + rng() * 0.3)], r: rng() * 6.28 });
      if (rng() < 0.45) { const r2 = r - 1.3, s2 = 0.5 + rng() * 0.5, x2 = Math.cos(a + 0.05) * r2, z2 = Math.sin(a + 0.05) * r2; out.push({ g: (i + 1) % 4, p: [x2, world.heightAt(x2, z2) + s2 * 0.2, z2], s: [s2, s2 * 0.9, s2], r: rng() * 6.28 }); }
    }
    return out;
  }, [world]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), []);
  return (
    <group>
      {rocks.map((k, i) => <mesh key={i} geometry={geos[k.g]} material={mat} position={k.p} scale={k.s} rotation={[0, k.r, 0]} castShadow={quality === 'high'} receiveShadow />)}
    </group>
  );
}

/** Pontos de vegetação dentro e em volta da clareira (mesma seed, mesma distribuição). */
function useSpots(world: WorldShape, n: number, rMin: number, rMax: number, salt: number, minGap = 0, avoid?: (x: number, z: number) => boolean): Spot[] {
  return useMemo(() => {
    const rng = mulberry32(world.seed + salt), out: Spot[] = [];
    for (let t = 0; t < n * 30 && out.length < n; t++) {
      const a = rng() * Math.PI * 2, r = rMin + Math.sqrt(rng()) * (rMax - rMin), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (world.dirtAt(x, z) > 0.4 || (avoid && avoid(x, z))) continue;
      if (minGap && out.some((q) => Math.hypot(q.x - x, q.z - z) < minGap)) continue;
      out.push({ x, z, rot: rng() * 6.28, s: rng() });
    }
    return out;
  }, [world, n, rMin, rMax, salt, minGap, avoid]);
}

function GrassBlades({ world, count }: { world: WorldShape; count: number }) {
  const spots = useSpots(world, count, 1.6, 22, 11);
  const { geo, mat, tex } = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d')!, r = mulberry32(3);
    for (let i = 0; i < 11; i++) {
      const bx = 64 + (r() - 0.5) * 34, tip = (r() - 0.5) * 70, len = 128 * (0.55 + r() * 0.42), bw = 5 + r() * 5;
      const gr = g.createLinearGradient(0, 128, 0, 128 - len);
      gr.addColorStop(0, '#5aa548'); gr.addColorStop(0.55, '#8fd16a'); gr.addColorStop(1, '#e8f7a6');
      g.fillStyle = gr; g.beginPath(); g.moveTo(bx - bw, 128);
      g.quadraticCurveTo(bx - bw * 0.3, 128 - len * 0.6, bx + tip, 128 - len);
      g.quadraticCurveTo(bx + bw * 0.4, 128 - len * 0.55, bx + bw, 128); g.closePath(); g.fill();
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BufferGeometry(), bp: number[] = [], bu: number[] = [], bn: number[] = [], bi: number[] = [];
    [0, Math.PI / 2].forEach((ang, qi) => {
      const cx = Math.cos(ang) * 0.5, cz = Math.sin(ang) * 0.5, o = qi * 4;
      bp.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); bu.push(0, 0, 1, 0, 1, 1, 0, 1);
      for (let k = 0; k < 4; k++) bn.push(0, 1, 0);
      bi.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
    geo.setIndex(bi);
    // emissiveMap: o verso da lâmina (normal invertida) não fica preto
    const mat = withWind(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.32 }), { height: 1, amp: 1.2 });
    return { geo, mat, tex };
  }, []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); tex.dispose(); }, [geo, mat, tex]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current; if (!im) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    spots.forEach((t, i) => {
      const k = 0.3 + t.s * 0.38;
      im.setMatrixAt(i, m4.compose(v.set(t.x, world.heightAt(t.x, t.z) - 0.03, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.set(k * 1.5, k, k * 1.5)));
      im.setColorAt(i, c.setHSL(0.24 + t.s * 0.06, 0.45, 0.62 + t.s * 0.12));
    });
    im.count = spots.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [spots, world]);
  return <instancedMesh ref={ref} args={[geo, mat, count]} receiveShadow frustumCulled={false} />;
}

/** Converte atributos quantizados (meshopt) para float antes de "assar" a transformação na geometria. */
function bakeGeometry(src: THREE.BufferGeometry, m: THREE.Matrix4) {
  const g = src.clone();
  for (const name of ['position', 'normal'] as const) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
    g.setAttribute(name, new THREE.BufferAttribute(f, 3));
  }
  g.applyMatrix4(m);
  return g;
}

/**
 * Um .GLB espalhado em várias cópias numa malha instanciada (uma por parte do modelo).
 * `height` é a altura desejada em metros: os modelos do Tripo chegam com ~1 m.
 */
function GlbInstances({ url, spots, world, height, wind = 0, shadows = false, hideNearCamera = false }: { url: string; spots: Spot[]; world: WorldShape; height: [number, number]; wind?: number; shadows?: boolean; hideNearCamera?: boolean }) {
  const { scene } = useGLTF(url);
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const norm = new THREE.Matrix4().makeScale(1 / size.y, 1 / size.y, 1 / size.y).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.Material).clone();
      if (wind) withWind(mat, { height: 1, strength: wind, amp: 0.9 });
      out.push({ geo: bakeGeometry(mesh.geometry, norm.clone().multiply(mesh.matrixWorld)), mat });
    });
    return out;
  }, [scene, wind]);
  useEffect(() => () => parts.forEach((p) => { p.geo.dispose(); p.mat.dispose(); }), [parts]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const mats = useMemo(() => {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    return spots.map((t) => { const h = height[0] + t.s * (height[1] - height[0]); return { m: m4.compose(v.set(t.x, world.heightAt(t.x, t.z) - 0.05, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.set(h, h, h)).clone(), x: t.x, z: t.z, h }; });
  }, [spots, world, height]);
  useLayoutEffect(() => {
    refs.current.forEach((im) => { if (!im) return; mats.forEach((k, i) => im.setMatrixAt(i, k.m)); im.count = mats.length; im.instanceMatrix.needsUpdate = true; });
  }, [mats, parts]);
  // árvores altas entre a câmera e o centro saem da frente
  const hidden = useRef<boolean[]>([]);
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  useFrame(({ camera }) => {
    if (!hideNearCamera) return;
    const cx = camera.position.x, cz = camera.position.z, cl = Math.hypot(cx, cz) || 1;
    let changed = false;
    mats.forEach((k, i) => {
      const along = (k.x * cx + k.z * cz) / cl, lat = Math.abs((-k.x * cz + k.z * cx) / cl);
      const hide = along > 4 && lat < 6;
      if (hidden.current[i] !== hide) { hidden.current[i] = hide; changed = true; refs.current.forEach((im) => im?.setMatrixAt(i, hide ? zero : k.m)); }
    });
    if (changed) refs.current.forEach((im) => { if (im) im.instanceMatrix.needsUpdate = true; });
  });
  return (
    <group>
      {parts.map((p, i) => (
        <instancedMesh key={i} ref={(el) => { refs.current[i] = el; }} args={[p.geo, p.mat, Math.max(1, spots.length)]} castShadow={shadows} receiveShadow frustumCulled={false} />
      ))}
    </group>
  );
}
useGLTF.preload(ASSETS + 'arvore.glb');
useGLTF.preload(ASSETS + 'tufo_grama.glb');

function Vegetation({ world, quality }: { world: WorldShape; quality: 'high' | 'low' }) {
  const high = quality === 'high';
  const nearAltar = useMemo(() => (x: number, z: number) => Math.hypot(x, z) < 2.6, []);
  const trees1 = useSpots(world, high ? 14 : 8, RIM_R + 3.5, 26, 21, 3.4);
  const trees2 = useSpots(world, high ? 12 : 6, RIM_R + 3.5, 26, 22, 3.4);
  const tufts = useSpots(world, high ? 170 : 60, 2.4, CLEAR_R + 1, 31, 0, nearAltar);
  const tall = useSpots(world, high ? 80 : 30, CLEAR_R - 2.5, RIM_R + 4, 32);
  const stones = useSpots(world, 5, 4, CLEAR_R - 0.5, 41, 3, nearAltar);
  const bigStones = useSpots(world, 8, RIM_R + 0.6, RIM_R + 2.2, 42, 3);
  return (
    <group>
      <GlbInstances url={ASSETS + 'arvore.glb'} spots={trees1} world={world} height={[3.0, 4.4]} wind={0.35} shadows={high} hideNearCamera />
      <GlbInstances url={ASSETS + 'arvore_dois.glb'} spots={trees2} world={world} height={[2.6, 3.8]} wind={0.35} shadows={high} hideNearCamera />
      <GlbInstances url={ASSETS + 'tufo_grama.glb'} spots={tufts} world={world} height={[0.32, 0.5]} wind={1} />
      <GlbInstances url={ASSETS + 'tufo_grama_alta.glb'} spots={tall} world={world} height={[0.55, 0.9]} wind={1} />
      <GlbInstances url={ASSETS + 'pedra.glb'} spots={stones} world={world} height={[0.35, 0.7]} shadows={high} />
      <GlbInstances url={ASSETS + 'pedra.glb'} spots={bigStones} world={world} height={[1.2, 2.2]} shadows={high} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Altar, fogueira, lanternas
// ---------------------------------------------------------------------------

function Altar({ runeColor }: { runeColor: string }) {
  const runes = useMemo(runeTexture, []);
  const ring = useRef<THREE.Mesh>(null);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame((s, dt) => {
    if (!ring.current) return;
    ring.current.rotation.z += dt * 0.05;
    (ring.current.material as THREE.MeshBasicMaterial).color.lerp(tint.set(runeColor).multiplyScalar(1.5 + Math.sin(s.clock.elapsedTime * 1.5) * 0.3), Math.min(1, dt * 1.5));
  });
  return (
    <group>
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.9, 2.1, 0.16, 48]} />
        <meshLambertMaterial color="#d9cfe8" />
      </mesh>
      <mesh position={[0, 0.16, 0]} receiveShadow>
        <cylinderGeometry args={[1.75, 1.85, 0.06, 48]} />
        <meshLambertMaterial color="#c4b8da" />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <circleGeometry args={[1.7, 64]} />
        <meshBasicMaterial map={runes} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Campfire({ world, night }: { world: WorldShape; night: number }) {
  const pos: [number, number, number] = [3.4, world.heightAt(3.4, -2.2), -2.2];
  const flames = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const embers = useRef<THREE.Points>(null);
  const emberGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)); return g; }, []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    flames.current?.children.forEach((m, i) => { const k = 1 + Math.sin(t * 13 + i * 1.7) * 0.14; m.scale.set(0.22 * (2 - k), 0.55 * k, 0.22 * (2 - k)); });
    if (light.current) light.current.intensity = (1.6 + night * 2.2) * (0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.06);
    const p = emberGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const l = (t * 0.5 + i / p.count) % 1, a = i * 2.4 + t * 0.6; p.setXYZ(i, Math.cos(a) * (0.12 + l * 0.4), 0.3 + l * 2.2, Math.sin(a) * (0.12 + l * 0.4)); }
    p.needsUpdate = true;
  });
  return (
    <group position={pos}>
      {Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5]} scale={[0.17, 0.13, 0.17]} castShadow><dodecahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#b3a8d2" flatShading /></mesh>; })}
      {[0, 1, 2].map((i) => <mesh key={i} position={[Math.sin(i * 2.09) * -0.3, 0.1, Math.cos(i * 2.09) * -0.3]} rotation={[Math.PI / 2 - 0.35, i * 2.09, 0]}><cylinderGeometry args={[0.06, 0.08, 0.7, 6]} /><meshLambertMaterial color="#93653f" /></mesh>)}
      <group ref={flames} position={[0, 0.3, 0]}>
        {['#fff3c4', '#ffc35a', '#ff8a3d'].map((c, i) => <mesh key={i} position={[(i - 1) * 0.08, 0, 0]}><coneGeometry args={[1, 1, 8]} /><meshBasicMaterial color={c} transparent opacity={0.85 - i * 0.15} toneMapped={false} depthWrite={false} /></mesh>)}
      </group>
      <points ref={embers} geometry={emberGeo}><pointsMaterial size={0.06} color="#ffc070" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
      <pointLight ref={light} position={[0, 1.1, 0]} color="#ffa25a" distance={10} decay={1.6} />
    </group>
  );
}

/** Recanto de leitura: um púlpito de pedra com um livro aberto que brilha e uma pilha de livros (ao ar livre, no lugar da estante). */
function ReadingNook({ seed, glow }: { seed: number; glow: string }) {
  const r = mulberry32(seed);
  const books = Array.from({ length: 4 }, (_, i) => ({ y: 0.06 + i * 0.09, rot: (r() - 0.5) * 0.5, c: `hsl(${Math.floor(r() * 360)}, 45%, ${42 + r() * 15}%)` }));
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow><cylinderGeometry args={[0.16, 0.26, 0.9, 6]} /><meshLambertMaterial color="#c4b8da" flatShading /></mesh>
      <mesh position={[0, 0.93, 0]} rotation={[-0.35, 0, 0]} castShadow><boxGeometry args={[0.62, 0.06, 0.44]} /><meshLambertMaterial color="#b3a8d2" flatShading /></mesh>
      {[-1, 1].map((sx) => <mesh key={sx} position={[sx * 0.14, 0.99, 0.02]} rotation={[-0.35, 0, sx * 0.12]}><boxGeometry args={[0.26, 0.02, 0.34]} /><meshLambertMaterial color="#f6eedc" emissive={glow} emissiveIntensity={0.25} /></mesh>)}
      {books.map((b, i) => <mesh key={i} position={[0.55, b.y, 0.15]} rotation={[0, b.rot, 0]} castShadow><boxGeometry args={[0.34, 0.08, 0.24]} /><meshLambertMaterial color={b.c} /></mesh>)}
      <pointLight position={[0, 1.25, 0.1]} color={glow} intensity={0.8} distance={3} />
    </group>
  );
}

const LANTERN_SPOTS = [0.5, 2.1, 3.7, 5.3].map((a) => [Math.cos(a) * 3.1, Math.sin(a) * 3.1] as [number, number]);
function LanternPost({ world, at, seed }: { world: WorldShape; at: [number, number]; seed: number }) {
  const y = world.heightAt(at[0], at[1]);
  return (
    <group position={[at[0], y, at[1]]}>
      <mesh position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.04, 0.06, 1.6, 6]} /><meshLambertMaterial color="#6b4630" /></mesh>
      <mesh position={[0.18, 1.55, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.025, 0.025, 0.36, 5]} /><meshLambertMaterial color="#6b4630" /></mesh>
      <Lantern position={[0.34, 1.38, 0]} seed={seed} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Céu, partículas mágicas e câmera
// ---------------------------------------------------------------------------

function Sky({ daylight }: { daylight: number }) {
  const { scene } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const day = useMemo(() => ({ bg: C('#bfe6ff'), fog: C('#d4eefc'), sky: C('#eaf4ff'), ground: C('#6f8a4a'), sun: C('#fff0cf') }), []);
  const night = useMemo(() => ({ bg: C('#2c3270'), fog: C('#2c3270'), sky: C('#9aa3e0'), ground: C('#30484a'), sun: C('#b9c6ff') }), []);
  useEffect(() => {
    const k = daylight;
    const bg = night.bg.clone().lerp(day.bg, k), fog = night.fog.clone().lerp(day.fog, k);
    scene.background = bg; scene.fog = new THREE.Fog(fog, 30 + k * 8, 62 + k * 18);
    if (hemi.current) { hemi.current.color.copy(night.sky).lerp(day.sky, k); hemi.current.groundColor.copy(night.ground).lerp(day.ground, k); hemi.current.intensity = 1.1 + k * 0.6; }
    if (sun.current) { sun.current.color.copy(night.sun).lerp(day.sun, k); sun.current.intensity = 0.7 + k * 1.5; }
  }, [daylight, scene, day, night]);
  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={sun} position={[9, 16, 5]} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0008} shadow-normalBias={0.03}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-near={1} shadow-camera-far={60} />
    </>
  );
}

function Motes({ world, night, amount }: { world: WorldShape; night: number; amount: number }) {
  const N = 90;
  const ref = useRef<THREE.Points>(null);
  const { geo, seeds } = useMemo(() => {
    const r = mulberry32(world.seed + 5), seeds = Array.from({ length: N }, () => { const a = r() * 6.28, rr = 2 + r() * 8; return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph: r() * 6.28, sp: 0.3 + r() * 0.5 }; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return { geo: g, seeds };
  }, [world]);
  useFrame((s) => {
    const t = s.clock.elapsedTime, p = geo.attributes.position as THREE.BufferAttribute;
    seeds.forEach((q, i) => p.setXYZ(i, q.x + Math.sin(t * q.sp + q.ph) * 1.2, world.heightAt(q.x, q.z) + 0.6 + Math.sin(t * q.sp * 1.7 + q.ph) * 0.5, q.z + Math.cos(t * q.sp * 0.8 + q.ph) * 1.2));
    p.needsUpdate = true;
    if (ref.current) (ref.current.material as THREE.PointsMaterial).opacity = (0.35 + night * 0.6) * amount;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.09 + night * 0.05} color={night > 0.5 ? '#d8ff8a' : '#fff1b8'} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/** Câmera em perspectiva olhando o altar; arrastar gira em volta, a roda/pinça aproxima. */
function CameraRig() {
  const { camera, size, gl } = useThree();
  const st = useRef({ az: 0.35, dist: 0, drag: null as null | { x: number }, pinch: 0, d0: 0 });
  const portrait = size.height > size.width;
  useEffect(() => {
    const el = gl.domElement, s = st.current, ptrs = new Map<number, number[]>();
    const down = (e: PointerEvent) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 1) s.drag = { x: e.clientX }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; s.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); s.d0 = s.dist; s.drag = null; } };
    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2 && s.pinch) { const [a, b] = [...ptrs.values()]; s.dist = Math.min(8, Math.max(-6, s.d0 + (s.pinch - Math.hypot(a[0] - b[0], a[1] - b[1])) * 0.03)); return; }
      if (s.drag) { s.az -= (e.clientX - s.drag.x) * 0.006; s.drag.x = e.clientX; }
    };
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (!ptrs.size) { s.drag = null; s.pinch = 0; } };
    const wheel = (e: WheelEvent) => { s.dist = Math.min(8, Math.max(-6, s.dist + Math.sign(e.deltaY) * 0.8)); };
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); el.addEventListener('wheel', wheel, { passive: true });
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.removeEventListener('wheel', wheel); };
  }, [gl]);
  const want = useMemo(() => new THREE.Vector3(), []);
  useFrame((s) => {
    const k = st.current, t = s.clock.elapsedTime;
    const dist = (portrait ? 21 : 15) + k.dist, polar = 0.92, az = k.az + Math.sin(t * 0.05) * 0.08;
    want.set(Math.sin(polar) * Math.sin(az) * dist, Math.cos(polar) * dist + 0.8, Math.sin(polar) * Math.cos(az) * dist);
    camera.position.lerp(want, 0.06);
    camera.lookAt(0, portrait ? 0.2 : 0.9, 0);
  });
  return null;
}

function WindClock() { useFrame((s) => { windTime.value = s.clock.elapsedTime; }); return null; }

// ---------------------------------------------------------------------------

const BARE: RefugeFeatures = { lanterns: 0, crystals: false, shelves: 0, element: null, nest: false, window: false, plants: 0, cauldron: false, walls: 0.25 };
const SHELVES: { p: [number, number]; r: number; seed: number }[] = [{ p: [-1.2, -6.4], r: 0.2, seed: 21 }, { p: [5.6, -4.2], r: -0.95, seed: 8 }];
const PLANTS: { p: [number, number]; s: number; seed: number }[] = [
  { p: [2.4, -5.4], s: 1.6, seed: 5 }, { p: [-1.6, -4.9], s: 1.3, seed: 1 }, { p: [5.4, -1.5], s: 1.8, seed: 13 }, { p: [-5.6, 0.3], s: 1.4, seed: 9 }, { p: [3.2, 2.6], s: 1, seed: 17 },
];

export function Refuge(props: RefugeProps) {
  const high = props.quality === 'high';
  const f = props.features ?? BARE;
  const world = useMemo(() => makeWorld(props.seed, f.window), [props.seed, f.window]);
  const [daylight, setDaylight] = useState(() => gameTime(Date.now()).daylight);
  useEffect(() => { const t = setInterval(() => setDaylight(gameTime(Date.now()).daylight), 60_000); return () => clearInterval(t); }, []);
  const night = 1 - daylight;
  const [modelFailed, setModelFailed] = useState(false);
  const onFail = useMemo(() => () => setModelFailed(true), []);
  const at = (x: number, z: number): [number, number, number] => [x, world.heightAt(x, z), z];
  return (
    <Canvas
      shadows={high}
      dpr={high ? [1, 1.75] : [0.75, 1]}
      camera={{ position: [0, 9, 13], fov: 34, near: 0.3, far: 140 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}
    >
      <Sky daylight={daylight} />
      <WindClock />
      <CameraRig />
      <Terrain world={world} />
      <Cliffs world={world} quality={props.quality} />
      <GrassBlades world={world} count={high ? 2200 : 900} />
      <Suspense fallback={null}><Vegetation world={world} quality={props.quality} /></Suspense>
      <Altar runeColor={props.color} />
      {f.crystals && <Grow><Crystals color={props.color} /></Grow>}
      {f.lanterns > 0 && <Grow position={[0, 0, 0]}><Campfire world={world} night={night} /></Grow>}
      {LANTERN_SPOTS.slice(0, f.lanterns).map((p, i) => <Grow key={i}><LanternPost world={world} at={p} seed={i + 1} /></Grow>)}
      {SHELVES.slice(0, f.shelves).map((b) => <Grow key={b.seed} position={at(b.p[0], b.p[1])} rotation={b.r}><ReadingNook seed={b.seed} glow={props.glow} /></Grow>)}
      {PLANTS.slice(0, f.plants).map((pl) => <Grow key={pl.seed} position={at(pl.p[0], pl.p[1])} scale={pl.s}><Plant position={[0, 0, 0]} seed={pl.seed} /></Grow>)}
      {f.element && <Grow key={f.element}><ElementFeature element={f.element} /></Grow>}
      {f.nest && <Grow><Nest /></Grow>}
      {f.cauldron && <Grow><Cauldron /></Grow>}
      <Motes world={world} night={night} amount={0.4 + f.walls * 0.6} />
      <Shockwave burstKey={props.burstKey ?? 0} color={props.glow} />
      {props.model && !modelFailed ? (
        <Suspense fallback={null}><CompanionModel files={props.model} world={world} burstKey={props.burstKey ?? 0} onFail={onFail} /></Suspense>
      ) : props.contract ? (
        <FirstForm contract={props.contract} pulseKey={props.pulseKey} artUrl={props.artUrl} />
      ) : (
        <ParticleCore color={props.color} glow={props.glow} element={props.element} energy={props.energy} pulseKey={props.pulseKey} count={high ? 1600 : 800} />
      )}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={0.55 + night * 0.45} luminanceThreshold={0.78 - night * 0.12} luminanceSmoothing={0.2} />
        <TiltShift2 blur={high ? 0.12 : 0.06} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} />
        <Vignette offset={0.3} darkness={0.35} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
