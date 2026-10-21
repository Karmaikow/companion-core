/**
 * Cauda e asas desenhadas e animadas por código, presas a um Companion humanoide (o modelo 3D vem sem elas:
 * o rig humanoide não anima bem esses pedaços). A cauda é uma corrente com física de mola (balança, arrasta,
 * enrola a ponta e não atravessa o chão); as asas batem devagar parado e mais rápido andando.
 * Tudo em coordenadas do mundo, seguindo o osso do quadril e do peito (ou pontos fixos, se o rig não tiver).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TailKind, WingKind } from '@rules';

export interface AppendageSpec {
  tail: TailKind | null;
  wings: WingKind | null;
  palette: { primary: string; secondary: string; accent: string; glow: string };
}

/** Acha os ossos de quadril e peito pelo nome (Mixamo, Tripo e afins). */
export function findAnchors(model: THREE.Object3D) {
  let hips: THREE.Object3D | null = null, chest: THREE.Object3D | null = null, spine: THREE.Object3D | null = null;
  model.traverse((o) => {
    const n = o.name.toLowerCase();
    if (!(o as THREE.Bone).isBone && !/hip|pelvis|spine|chest/.test(n)) return;
    if (!hips && /(^|[^a-z])(hips?|pelvis)$|hips|pelvis/.test(n)) hips = o;
    if (/upper_?chest|chest|spine_?0?3|spine2/.test(n)) chest = chest ?? o;
    if (/spine/.test(n)) spine = o; // o último "spine" encontrado costuma ser o mais alto
  });
  return { hips: hips as THREE.Object3D | null, chest: (chest ?? spine) as THREE.Object3D | null };
}

const TAIL: Record<TailKind, { len: number; r0: number; profile: (u: number) => number; curl: number; stiff: number }> = {
  scaly: { len: 0.7, r0: 0.075, profile: (u) => 1 - u * 0.82, curl: 0.55, stiff: 7 },
  fluffy: { len: 0.5, r0: 0.07, profile: (u) => 0.75 + Math.sin(u * Math.PI) * 0.75 - u * 0.4, curl: 0.9, stiff: 9 },
  tuft: { len: 0.55, r0: 0.022, profile: (u) => 1 - u * 0.4, curl: 0.4, stiff: 6 },
  feather: { len: 0.28, r0: 0.05, profile: (u) => 0.6 + u * 1.2, curl: 0.2, stiff: 12 },
  wisp: { len: 0.6, r0: 0.06, profile: (u) => 1 - u * 0.95, curl: 0.7, stiff: 5 },
};
const SEG = 12, RAD = 10;

export function Appendages({ spec, anchors, root, heightAt }: { spec: AppendageSpec; anchors: { hips: THREE.Object3D | null; chest: THREE.Object3D | null }; root: React.RefObject<THREE.Group | null>; heightAt: (x: number, z: number) => number }) {
  return (
    <>
      {spec.tail && <Tail kind={spec.tail} palette={spec.palette} hips={anchors.hips} root={root} heightAt={heightAt} />}
      {spec.wings && <Wings kind={spec.wings} palette={spec.palette} chest={anchors.chest} root={root} />}
    </>
  );
}

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

/** Ponto de apoio no mundo: o osso (se houver) ou uma altura fixa no corpo; `back` empurra para as costas. */
function anchorWorld(bone: THREE.Object3D | null, root: THREE.Group, fallbackY: number, back: number, out: THREE.Vector3) {
  root.getWorldQuaternion(tmpQ);
  if (bone) bone.getWorldPosition(out); else out.set(0, fallbackY, 0).applyQuaternion(tmpQ).add(root.getWorldPosition(tmpV));
  return out.add(tmpV.set(0, 0, -back).applyQuaternion(tmpQ));
}

function Tail({ kind, palette, hips, root, heightAt }: { kind: TailKind; palette: AppendageSpec['palette']; hips: THREE.Object3D | null; root: React.RefObject<THREE.Group | null>; heightAt: (x: number, z: number) => number }) {
  const def = TAIL[kind];
  const { geo, pts, prev } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = (SEG + 1) * RAD;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3), base = new THREE.Color(palette.primary), mid = new THREE.Color(palette.secondary), tip = new THREE.Color(kind === 'fluffy' ? '#ffffff' : kind === 'scaly' ? palette.accent : palette.secondary), c = new THREE.Color();
    for (let i = 0; i <= SEG; i++) for (let j = 0; j < RAD; j++) {
      const u = i / SEG;
      c.copy(base).lerp(mid, Math.min(1, u * 0.8) * 0.6).lerp(tip, Math.max(0, (u - 0.7) / 0.3));
      if (kind === 'scaly') { const under = Math.cos((j / RAD) * Math.PI * 2) < -0.5; if (under) c.lerp(new THREE.Color('#f3efd8'), 0.4); if (i % 2 === 0 && !under) c.multiplyScalar(0.88); }
      col.set([c.r, c.g, c.b], (i * RAD + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx: number[] = [];
    for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) { const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD), c2 = a + RAD, d = b + RAD; idx.push(a, c2, b, b, c2, d); }
    g.setIndex(idx);
    return { geo: g, pts: Array.from({ length: SEG + 1 }, () => new THREE.Vector3()), prev: Array.from({ length: SEG + 1 }, () => new THREE.Vector3()) };
  }, [kind, palette]);
  useEffect(() => () => geo.dispose(), [geo]);
  const fin = useRef<THREE.Group>(null);
  const tuft = useRef<THREE.Mesh>(null);
  const init = useRef(false);
  const a = useMemo(() => new THREE.Vector3(), []);
  const lastA = useMemo(() => new THREE.Vector3(), []);
  const rest = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dtRaw) => {
    const r = root.current; if (!r) return;
    const dt = Math.min(dtRaw, 1 / 30), t = s.clock.elapsedTime;
    anchorWorld(hips, r, 0.42, 0.07, a);
    r.getWorldQuaternion(tmpQ);
    const segLen = def.len / SEG;
    if (!init.current) {
      init.current = true; lastA.copy(a);
      for (let i = 0; i <= SEG; i++) { pts[i].copy(a).add(tmpV.set(0, -0.2 * i * segLen, -i * segLen).applyQuaternion(tmpQ)); prev[i].copy(pts[i]); }
    }
    // a cauda acompanha o corpo: o deslocamento do quadril é levado quase todo para a corrente (só o balanço fica na
    // física). Antes, correndo, os pontos ficavam para trás e a cauda boiava esticada no ar.
    if (init.current) {
      const dx = a.x - lastA.x, dy = a.y - lastA.y, dz = a.z - lastA.z;
      if (dx * dx + dy * dy + dz * dz < 4) for (let i = 1; i <= SEG; i++) { const k = 0.92 - (i / SEG) * 0.12; pts[i].x += dx * k; pts[i].y += dy * k; pts[i].z += dz * k; prev[i].x += dx * k; prev[i].y += dy * k; prev[i].z += dz * k; }
    }
    lastA.copy(a);
    // física: verlet + mola para a pose de descanso (para trás, caída, ponta enrolando para cima) + peso
    pts[0].copy(a); prev[0].copy(a);
    const pull = Math.min(0.5, def.stiff * dt * 1.4), grav = 3.5 * dt * dt;
    for (let i = 1; i <= SEG; i++) {
      const u = i / SEG, p = pts[i], q = prev[i];
      const sway = Math.sin(t * 2.2 - u * 3) * 0.1 * u;
      rest.set(sway, -0.38 * u + def.curl * u * u * 0.6, -u * def.len * 0.9).applyQuaternion(tmpQ).add(a);
      const vx = (p.x - q.x) * 0.82, vy = (p.y - q.y) * 0.82, vz = (p.z - q.z) * 0.82;
      q.copy(p);
      p.x += vx + (rest.x - p.x) * pull;
      p.y += vy + (rest.y - p.y) * pull - grav * u;
      p.z += vz + (rest.z - p.z) * pull;
    }
    for (let k = 0; k < 3; k++) for (let i = 1; i <= SEG; i++) {
      const p = pts[i], o = pts[i - 1];
      tmpV.subVectors(p, o); const d = tmpV.length() || 1e-4;
      p.copy(o).addScaledVector(tmpV, segLen / d);
      const g = heightAt(p.x, p.z) + 0.03;
      if (p.y < g) p.y = g;
    }
    // malha: anéis em volta da corrente
    const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      T.subVectors(pts[Math.min(SEG, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      N.crossVectors(T, up); if (N.lengthSq() < 1e-6) N.set(1, 0, 0); N.normalize(); B.crossVectors(N, T).normalize();
      const rad = def.r0 * Math.max(0.05, def.profile(u));
      for (let j = 0; j < RAD; j++) {
        const ang = (j / RAD) * Math.PI * 2, cx = Math.cos(ang), cy = Math.sin(ang);
        const nx = N.x * cx + B.x * cy, ny = N.y * cx + B.y * cy, nz = N.z * cx + B.z * cy;
        pos.setXYZ(i * RAD + j, pts[i].x + nx * rad, pts[i].y + ny * rad, pts[i].z + nz * rad);
        nor.setXYZ(i * RAD + j, nx, ny, nz);
      }
    }
    pos.needsUpdate = true; nor.needsUpdate = true; geo.computeBoundingSphere();
    const end = pts[SEG], before = pts[SEG - 2];
    if (fin.current) { fin.current.position.copy(end); fin.current.lookAt(tmpV.subVectors(end, before).add(end)); }
    if (tuft.current) tuft.current.position.copy(end);
  });
  return (
    <group>
      <mesh geometry={geo} castShadow frustumCulled={false}>
        {kind === 'wisp'
          ? <meshBasicMaterial vertexColors transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          : <meshStandardMaterial vertexColors roughness={kind === 'scaly' ? 0.35 : 0.85} metalness={0} />}
      </mesh>
      {kind === 'scaly' && (
        <group ref={fin}>
          {/* barbatana na ponta: um leque achatado na cor de destaque, com brilho, apontando para fora da cauda */}
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.06]} scale={[1, 1, 0.25]}>
            <coneGeometry args={[0.1, 0.22, 4, 1]} />
            <meshStandardMaterial color={palette.accent} emissive={palette.glow} emissiveIntensity={0.35} roughness={0.3} transparent opacity={0.9} />
          </mesh>
        </group>
      )}
      {kind === 'tuft' && <mesh ref={tuft} castShadow scale={[0.06, 0.08, 0.06]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={palette.secondary} roughness={0.9} /></mesh>}
    </group>
  );
}

// ---------------------------------------------------------------------------

function wingShape(kind: WingKind): THREE.Shape {
  const s = new THREE.Shape();
  if (kind === 'feather') {
    s.moveTo(0, 0); s.bezierCurveTo(0.1, 0.25, 0.35, 0.32, 0.55, 0.22);
    // ponta das penas (bordas onduladas)
    const tips = [[0.55, 0.22], [0.5, 0.08], [0.42, 0.0], [0.33, -0.08], [0.22, -0.12], [0.1, -0.1]];
    for (let i = 1; i < tips.length; i++) { const [x0, y0] = tips[i - 1], [x1, y1] = tips[i]; s.quadraticCurveTo((x0 + x1) / 2 + 0.03, (y0 + y1) / 2 - 0.05, x1, y1); }
    s.quadraticCurveTo(0.03, -0.05, 0, 0);
  } else if (kind === 'dragon') {
    s.moveTo(0, 0); s.lineTo(0.18, 0.2); s.lineTo(0.5, 0.26);
    s.quadraticCurveTo(0.44, 0.1, 0.48, -0.02); s.quadraticCurveTo(0.36, 0.02, 0.32, -0.1); s.quadraticCurveTo(0.22, -0.04, 0.16, -0.14); s.quadraticCurveTo(0.08, -0.04, 0, 0);
  } else {
    s.moveTo(0, 0); s.bezierCurveTo(0.08, 0.35, 0.42, 0.42, 0.4, 0.18); s.bezierCurveTo(0.38, 0.06, 0.18, 0.02, 0.05, 0.0);
    s.bezierCurveTo(0.2, -0.04, 0.32, -0.14, 0.26, -0.24); s.bezierCurveTo(0.18, -0.32, 0.04, -0.18, 0, 0);
  }
  return s;
}

function Wings({ kind, palette, chest, root }: { kind: WingKind; palette: AppendageSpec['palette']; chest: THREE.Object3D | null; root: React.RefObject<THREE.Group | null> }) {
  const geo = useMemo(() => {
    const g = new THREE.ShapeGeometry(wingShape(kind), 16);
    // cor: base escura → borda clara
    const p = g.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color(kind === 'fairy' ? palette.glow : kind === 'dragon' ? palette.primary : palette.secondary), b = new THREE.Color(kind === 'dragon' ? palette.accent : '#ffffff'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const d = Math.min(1, Math.hypot(p.getX(i), p.getY(i)) / 0.5); c.copy(a).lerp(b, Math.pow(d, kind === 'dragon' ? 1.6 : 1) * (kind === 'dragon' ? 0.9 : 0.75)); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [kind, palette]);
  useEffect(() => () => geo.dispose(), [geo]);
  const g = useRef<THREE.Group>(null);
  const L = useRef<THREE.Group>(null), R = useRef<THREE.Group>(null);
  const last = useRef(new THREE.Vector3());
  const speed = useRef(0);
  useFrame((s, dt) => {
    const r = root.current, grp = g.current; if (!r || !grp) return;
    anchorWorld(chest, r, 0.66, 0.1, grp.position);
    r.getWorldQuaternion(grp.quaternion);
    const v = grp.position.distanceTo(last.current) / Math.max(dt, 1e-3); last.current.copy(grp.position);
    speed.current += (Math.min(3, v) - speed.current) * Math.min(1, dt * 4);
    const t = s.clock.elapsedTime, moving = speed.current > 0.3;
    const freq = kind === 'fairy' ? 9 : moving ? 4 : 1.3, amp = kind === 'fairy' ? 0.35 : moving ? 0.55 : 0.18;
    const flap = Math.sin(t * freq) * amp, spread = kind === 'fairy' ? 0.85 : moving ? 0.95 : 0.4;
    // spread 0 = recolhida para trás; maior = aberta para o lado. Parada fica meio recolhida; andando abre e bate.
    if (L.current) L.current.rotation.set(0.12, Math.PI / 2 - spread, 0.3 + flap);
    if (R.current) R.current.rotation.set(0.12, -(Math.PI / 2 - spread), -(0.3 + flap));
  });
  const mat = kind === 'fairy'
    ? <meshBasicMaterial vertexColors transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    : <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={kind === 'dragon' ? 0.5 : 0.85} transparent={kind === 'dragon'} opacity={kind === 'dragon' ? 0.92 : 1} />;
  return (
    <group ref={g}>
      <group ref={L} position={[0.05, 0, 0]}><mesh geometry={geo} castShadow>{mat}</mesh></group>
      <group ref={R} position={[-0.05, 0, 0]}><mesh geometry={geo} scale={[-1, 1, 1]} castShadow>{mat}</mesh></group>
    </group>
  );
}
