/**
 * Prévia de uma habilidade da Forja: o aviso no chão (telegráfico lavanda que enche), o efeito (partículas no estilo
 * da essência) e o acerto nos bonecos de treino com o dano esperado. Em loop, para ajustar números e ver na hora.
 * As peças (aviso, partículas, anel de impacto) servem depois para a batalha de verdade.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { softDot } from './textures';
import { ELEMENTS, STATUSES, expectedDamage, affinity, type SkillDef, type Element } from '@rules';

const TELE = '#c9b8ff';

export function skillColor(s: SkillDef, companion: string): string {
  if (s.vfx.color === 'companion') return companion;
  if (s.vfx.color === 'essence') return s.essence ? ELEMENTS[s.essence].glow : companion;
  return s.vfx.color;
}

/** Leque no chão a partir da origem, ângulo medido a partir de +Z. */
function fanGeo(r0: number, r1: number, a0: number, a1: number, segs = 40) {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs, s = Math.sin(a), c = Math.cos(a);
    pos.push(s * r0, 0, c * r0, s * r1, 0, c * r1);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

interface Layout { dummies: THREE.Vector3[]; target: THREE.Vector3 }
function layoutFor(s: SkillDef): Layout {
  const d = s.shape === 'aura' ? Math.max(1.1, s.radius * 0.7) : s.shape === 'melee' ? Math.min(s.range, 1.5) : Math.min(6, Math.max(1.6, s.range * 0.7));
  const dummies = [new THREE.Vector3(0, 0, d), new THREE.Vector3(-1.4, 0, d + 0.5), new THREE.Vector3(1.5, 0, d - 0.4)];
  const target = s.shape === 'circle' || s.shape === 'leap' ? new THREE.Vector3(0, 0, Math.min(s.range, d)) : dummies[0].clone();
  return { dummies, target };
}

function hits(s: SkillDef, L: Layout, p: THREE.Vector3): boolean {
  const R = 0.35; // raio do boneco
  const dist = Math.hypot(p.x, p.z), ang = Math.abs(Math.atan2(p.x, p.z)) * (180 / Math.PI);
  switch (s.shape) {
    case 'melee': return dist <= s.range + R && ang <= 70;
    case 'cone': return dist <= s.range + R && ang <= s.angle / 2 + 8;
    case 'line': case 'dash': return p.z >= 0 && p.z <= s.range + R && Math.abs(p.x) <= s.radius + R;
    case 'circle': case 'leap': return Math.hypot(p.x - L.target.x, p.z - L.target.z) <= s.radius + R;
    case 'aura': return dist <= s.radius + R;
    case 'projectile': return p === L.dummies[0];
  }
}

// gravidade e jeito de cada estilo
const STYLE: Record<string, { g: number; speed: number; size: number; swirl: number; jitter: number; second: string }> = {
  impacto: { g: 2, speed: 3, size: 0.12, swirl: 0, jitter: 0, second: '#ffffff' },
  chamas: { g: -3, speed: 2.2, size: 0.17, swirl: 0.4, jitter: 0.2, second: '#fff1a0' },
  gotas: { g: 9, speed: 3.6, size: 0.12, swirl: 0, jitter: 0, second: '#e6f7ff' },
  folhas: { g: 1.2, speed: 2.4, size: 0.15, swirl: 2, jitter: 0, second: '#d8ff9a' },
  pedras: { g: 12, speed: 4, size: 0.2, swirl: 0, jitter: 0, second: '#8a7a6a' },
  gelo: { g: 3, speed: 3, size: 0.13, swirl: 0.3, jitter: 0, second: '#ffffff' },
  raios: { g: 0, speed: 5, size: 0.1, swirl: 0, jitter: 3, second: '#ffffff' },
  vento: { g: -0.5, speed: 3.5, size: 0.11, swirl: 4, jitter: 0, second: '#ffffff' },
  luz: { g: -1, speed: 2.5, size: 0.14, swirl: 0.6, jitter: 0, second: '#fffbe0' },
  sombra: { g: -1.2, speed: 1.8, size: 0.18, swirl: 1, jitter: 0, second: '#2a1840' },
  faiscas: { g: 4, speed: 4.5, size: 0.09, swirl: 0, jitter: 1, second: '#ffffff' },
};

const N = 160;


const EFFECT = 0.9, REST = 0.9;

function Scene({ skill, color, onHit }: { skill: SkillDef; color: string; onHit: (n: number) => void }) {
  const L = useMemo(() => layoutFor(skill), [skill]);
  const st = STYLE[skill.vfx.style] ?? STYLE.impacto;
  const col = useMemo(() => new THREE.Color(color), [color]);
  const cycle = skill.windup + EFFECT + REST;
  const clock = useRef(0);
  const fired = useRef(false);
  const caster = useRef<THREE.Group>(null);
  const tele = useRef<THREE.Mesh>(null);
  const fill = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const orb = useRef<THREE.Mesh>(null);
  const flash = useRef<(THREE.Mesh | null)[]>([]);
  const hitT = useRef<number[]>([0, 0, 0]);

  // aviso no chão: geometria e posição pela forma
  const { geo, at } = useMemo(() => {
    const s = skill;
    if (s.shape === 'cone') return { geo: fanGeo(0, s.range, -(s.angle * Math.PI) / 360, (s.angle * Math.PI) / 360), at: new THREE.Vector3() };
    if (s.shape === 'melee') return { geo: fanGeo(0, s.range, -1.2, 1.2, 24), at: new THREE.Vector3() };
    if (s.shape === 'line' || s.shape === 'dash') { const g = new THREE.PlaneGeometry(s.radius * 2, s.range).rotateX(-Math.PI / 2).translate(0, 0, s.range / 2); return { geo: g, at: new THREE.Vector3() }; }
    if (s.shape === 'aura') return { geo: fanGeo(0, s.radius, 0, Math.PI * 2, 48), at: new THREE.Vector3() };
    if (s.shape === 'projectile') { const g = new THREE.PlaneGeometry(s.radius * 2, L.dummies[0].z).rotateX(-Math.PI / 2).translate(0, 0, L.dummies[0].z / 2); return { geo: g, at: new THREE.Vector3() }; }
    return { geo: fanGeo(0, s.radius, 0, Math.PI * 2, 48), at: L.target.clone() };
  }, [skill, L]);
  useEffect(() => () => geo.dispose(), [geo]);

  // partículas
  const parts = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return { g, p: new Float32Array(N * 3), v: new Float32Array(N * 3), life: new Float32Array(N) };
  }, []);
  useEffect(() => () => parts.g.dispose(), [parts]);

  const emit = () => {
    const s = skill, { p, v, life } = parts, c2 = new THREE.Color(st.second), cc = new THREE.Color();
    const colAttr = parts.g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      let x = 0, y = 0.6, z = 0, vx = 0, vy = 0, vz = 0;
      const r = Math.random, sp = st.speed * (0.6 + r() * 0.8);
      switch (s.shape) {
        case 'melee': { const a = (r() - 0.5) * 2.2; x = Math.sin(a) * s.range * 0.8; z = Math.cos(a) * s.range * 0.8; vx = Math.sin(a) * sp * 0.4; vz = Math.cos(a) * sp * 0.4; vy = r() * 2; break; }
        case 'cone': { const a = ((r() - 0.5) * s.angle * Math.PI) / 180; const k = sp * (s.range / 2.2); vx = Math.sin(a) * k; vz = Math.cos(a) * k; vy = (r() - 0.3) * 1.2; z = 0.4; break; }
        case 'line': case 'dash': case 'projectile': { z = r() * (s.shape === 'projectile' ? 0.3 : s.range); x = (r() - 0.5) * s.radius * 2; if (s.shape === 'projectile') { x = L.dummies[0].x + (r() - 0.5) * 0.3; z = L.dummies[0].z; } vy = r() * sp * 0.6; vx = (r() - 0.5) * sp * 0.5; vz = (r() - 0.5) * sp * 0.5; y = 0.3 + r() * 0.6; break; }
        case 'circle': case 'leap': { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s.radius; x = L.target.x + Math.cos(a) * d; z = L.target.z + Math.sin(a) * d; const falls = ['chamas', 'pedras', 'raios', 'gelo', 'gotas'].includes(s.vfx.style) && s.shape === 'circle'; y = falls ? 3 + r() * 2 : 0.1; vy = falls ? -sp * 1.4 : sp * (0.6 + r()); vx = Math.cos(a) * sp * 0.3; vz = Math.sin(a) * sp * 0.3; break; }
        case 'aura': { const a = r() * Math.PI * 2; x = Math.cos(a) * 0.4; z = Math.sin(a) * 0.4; y = 0.2 + r() * 0.8; vx = Math.cos(a) * sp * (s.radius / 2); vz = Math.sin(a) * sp * (s.radius / 2); vy = r() * 1.5; break; }
      }
      p.set([x, y, z], i * 3); v.set([vx, vy, vz], i * 3); life[i] = 0.5 + r() * 0.5;
      cc.copy(col).lerp(c2, r() * 0.6);
      colAttr.setXYZ(i, cc.r, cc.g, cc.b);
    }
    colAttr.needsUpdate = true;
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    let t = clock.current % cycle;
    if (clock.current >= cycle && t < dt) { fired.current = false; }
    const s = skill;
    const w = s.windup, inTele = t < w, e = (t - w) / EFFECT; // e: 0..1 durante o efeito
    // aviso enchendo
    if (tele.current && fill.current) {
      tele.current.visible = fill.current.visible = inTele && w > 0.01;
      const k = Math.min(1, t / Math.max(0.01, w));
      if (s.shape === 'line' || s.shape === 'dash' || s.shape === 'projectile') fill.current.scale.set(1, 1, k); else fill.current.scale.setScalar(k);
    }
    // disparo
    if (!inTele && !fired.current) {
      fired.current = true; emit();
      let n = 0;
      L.dummies.forEach((d, i) => { if (hits(s, L, d)) { hitT.current[i] = 0.001; n++; } });
      onHit(n);
    }
    const active = !inTele && e <= 1;
    // conjurador: investida e salto o movem
    if (caster.current) {
      const c = caster.current; c.position.set(0, 0, 0); c.scale.setScalar(1);
      if (inTele) { const q = Math.sin(t * 30) * 0.03 * Math.min(1, t / Math.max(0.01, w)); c.position.x = q; c.scale.set(1 + 0.08 * (t / Math.max(0.01, w)), 1 - 0.08 * (t / Math.max(0.01, w)), 1); }
      if (active && s.shape === 'dash') c.position.z = Math.min(1, e * 2.2) * s.range;
      if (active && s.shape === 'leap') { const k = Math.min(1, e * 2); c.position.z = k * L.target.z; c.position.y = Math.sin(k * Math.PI) * 1.6; }
      if (!inTele && e > 1 && (s.shape === 'dash' || s.shape === 'leap')) { const back = Math.min(1, (e - 1) * (EFFECT / REST) * 1.5); c.position.z = (1 - back) * (s.shape === 'dash' ? s.range : L.target.z); }
    }
    // projétil
    if (orb.current) {
      orb.current.visible = active && s.shape === 'projectile' && e < 0.4;
      const k = Math.min(1, e / 0.4); orb.current.position.set(L.dummies[0].x * k, 0.6, 0.5 + (L.dummies[0].z - 0.5) * k);
    }
    // feixe de linha
    if (beam.current) { beam.current.visible = active && s.shape === 'line' && e < 0.5; (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - e * 2); }
    // anel de impacto
    if (ring.current) {
      const show = active && ['circle', 'aura', 'leap', 'melee', 'projectile'].includes(s.shape);
      ring.current.visible = show;
      const base = s.shape === 'aura' ? new THREE.Vector3() : s.shape === 'melee' ? new THREE.Vector3(0, 0, s.range * 0.7) : s.shape === 'projectile' ? L.dummies[0] : L.target;
      ring.current.position.set(base.x, 0.05, base.z);
      const R = s.shape === 'melee' || s.shape === 'projectile' ? 0.9 : s.radius;
      ring.current.scale.setScalar(0.2 + e * R);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - e);
    }
    // partículas
    const { p, v, life } = parts, pos = parts.g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      if (!fired.current || e > 1.4 || inTele) { pos.setXYZ(i, 0, -50, 0); continue; }
      const k = i * 3;
      v[k + 1] -= st.g * dt;
      if (st.swirl) { const vx = v[k], vz = v[k + 2], a = st.swirl * dt; v[k] = vx * Math.cos(a) - vz * Math.sin(a); v[k + 2] = vx * Math.sin(a) + vz * Math.cos(a); }
      p[k] += v[k] * dt + (st.jitter ? (Math.random() - 0.5) * st.jitter * dt : 0); p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      if (p[k + 1] < 0.03) { p[k + 1] = 0.03; v[k + 1] *= -0.3; v[k] *= 0.7; v[k + 2] *= 0.7; }
      const alive = e < life[i] * 1.4;
      pos.setXYZ(i, p[k], alive ? p[k + 1] : -50, p[k + 2]);
    }
    pos.needsUpdate = true;
    // bonecos piscam ao serem acertados
    hitT.current.forEach((h, i) => {
      const m = flash.current[i]; if (!m) return;
      if (h > 0) hitT.current[i] = h + dt;
      const on = h > 0 && h < 0.5;
      (m.material as THREE.MeshLambertMaterial).emissive.set(on ? color : '#000000');
      (m.material as THREE.MeshLambertMaterial).emissiveIntensity = on ? 1.2 * (1 - h * 2) : 0;
      m.position.x = on ? Math.sin(h * 60) * 0.04 : 0;
      if (h > 1.2) hitT.current[i] = 0;
    });
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[11, 64]} /><meshLambertMaterial color="#8fcf60" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}><ringGeometry args={[10.6, 11, 64]} /><meshBasicMaterial color="#b3a8d2" /></mesh>
      {/* aviso */}
      <group position={[at.x, 0.02, at.z]}>
        <mesh ref={tele} geometry={geo}><meshBasicMaterial color={TELE} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        <mesh ref={fill} geometry={geo} position={[0, 0.005, 0]}><meshBasicMaterial color={TELE} transparent opacity={0.45} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      </group>
      {/* conjurador */}
      <group ref={caster}>
        <mesh position={[0, 0.5, 0]} castShadow><capsuleGeometry args={[0.32, 0.35, 6, 16]} /><meshLambertMaterial color={color} /></mesh>
        <mesh position={[-0.12, 0.72, 0.27]}><sphereGeometry args={[0.06, 12, 12]} /><meshBasicMaterial color="#1b1830" /></mesh>
        <mesh position={[0.12, 0.72, 0.27]}><sphereGeometry args={[0.06, 12, 12]} /><meshBasicMaterial color="#1b1830" /></mesh>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.42, 24]} /><meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} /></mesh>
      </group>
      {/* bonecos de treino */}
      {L.dummies.map((d, i) => (
        <group key={i} position={[d.x, 0, d.z]}>
          <mesh ref={(m) => { flash.current[i] = m; }} position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.28, 0.32, 1.1, 14]} /><meshLambertMaterial color="#c9a274" /></mesh>
          <mesh position={[0, 1.25, 0]} castShadow><sphereGeometry args={[0.22, 14, 14]} /><meshLambertMaterial color="#e2c497" /></mesh>
          <mesh position={[0, 0.7, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.05, 0.05, 1.1, 8]} /><meshLambertMaterial color="#8a6a4a" /></mesh>
        </group>
      ))}
      <mesh ref={orb}><sphereGeometry args={[Math.max(0.15, skill.radius * 0.6), 16, 16]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      <mesh ref={beam} position={[0, 0.6, skill.range / 2]}><boxGeometry args={[skill.radius * 1.4, 0.35, skill.range]} /><meshBasicMaterial color={color} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.85, 1, 48]} /><meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <points geometry={parts.g} frustumCulled={false}>
        <pointsMaterial map={softDot()} size={st.size * 4} vertexColors transparent alphaTest={0.02} depthWrite={false} />
      </points>
      <Html position={[L.dummies[0].x, 1.9, L.dummies[0].z]} center style={{ pointerEvents: 'none' }}><span className="fx-label">boneco · def 40</span></Html>
    </group>
  );
}

export function SkillPreview({ skill, companionColor, defenderEssence }: { skill: SkillDef; companionColor: string; defenderEssence: Element | null }) {
  const color = skillColor(skill, companionColor);
  const [last, setLast] = useState<{ n: number; id: number }>({ n: 0, id: 0 });
  const mult = affinity(skill.essence, defenderEssence);
  const dmg = expectedDamage(skill, 60, 40, mult);
  const far = Math.max(8, skill.range + 4);
  return (
    <div className="skill-preview">
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [far * 0.55, far * 0.75, -far * 0.45], fov: 40 }} onCreated={({ camera }) => camera.lookAt(0, 0, Math.min(3, skill.range / 2))}>
        <color attach="background" args={['#bfe6ff']} />
        <hemisphereLight args={['#ffffff', '#5aa84c', 1.4]} />
        <directionalLight position={[5, 10, -4]} intensity={1.6} castShadow />
        <Scene key={skill.slug + skill.shape + skill.windup + skill.range + skill.radius + skill.angle + skill.vfx.style} skill={skill} color={color} onHit={(n) => setLast((l) => ({ n, id: l.id + 1 }))} />
      </Canvas>
      <div className="fx-hud">
        {skill.power > 0 && <span>dano esperado <b>{dmg}</b>{mult !== 1 && <em className={mult > 1 ? 'up' : 'down'}> ×{mult}</em>} (atk 60 × def 40)</span>}
        {skill.heal > 0 && <span>cura <b>{skill.heal}</b></span>}
        {skill.status && <span>{STATUSES[skill.status.key].label} {Math.round(skill.status.chance * 100)}% · {skill.status.seconds}s</span>}
        <span key={last.id} className="fx-hits">{last.id ? `acertou ${last.n} de 3` : 'preparando…'}</span>
      </div>
    </div>
  );
}
