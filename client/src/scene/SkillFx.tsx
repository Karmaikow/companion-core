/**
 * Prévia de uma habilidade da Forja: o aviso no chão (telegráfico lavanda que enche), o efeito (partículas no estilo
 * da essência) e o acerto nos bonecos de treino com o dano esperado. Em loop, para ajustar números e ver na hora.
 * As peças (aviso, partículas, anel de impacto) servem depois para a batalha de verdade.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { TrainingModel, type Cue } from './TrainingModel';
import { AssetBoundary } from './Biome';
import * as THREE from 'three';
import { playVfxLayers } from './vfx/layers';
import { VfxStore } from './vfx/engine';
import { VfxLayer } from './vfx/VfxLayer';
import { area, aura, beam, burst, cone, missile, slash, Missile } from './vfx/recipes';
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

const EFFECT = 0.9, REST = 0.9;

/** Modelo de Companion no lugar do boneco de cápsula (campo de treino do Administrador) e a animação escolhida. */
export interface TrainingBody { url: string; anim: string | null; companionId?: string | null }

function Scene({ skill, color, onHit, body, timeScale, dark }: { skill: SkillDef; color: string; onHit: (n: number) => void; body?: TrainingBody | null; timeScale: number; dark: boolean }) {
  const L = useMemo(() => layoutFor(skill), [skill]);
  const style = skill.vfx.style;
  const store = useMemo(() => new VfxStore(), []);
  const dashFx = useRef<Missile | null>(null);
  const [cue, setCue] = useState<Cue | null>(null);
  const cueAt = useRef(-1);
  const cycle = Math.max(skill.windup + EFFECT + REST, ...(skill.vfx.layers ?? []).filter((l) => l.enabled).map((l) => (l.phase === 'prepare' ? 0 : skill.windup) + l.delay + l.duration + 0.45 + REST));
  const layerCycle = useRef(-1);
  useEffect(() => () => store.clear(), [store]);
  const clock = useRef(0);
  const fired = useRef(false);
  const caster = useRef<THREE.Group>(null);
  const tele = useRef<THREE.Mesh>(null);
  const fill = useRef<THREE.Mesh>(null);
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

  // efeitos: cada forma dispara a sua receita no fim do aviso
  const fire = (hitIdx: number[]) => {
    const s = skill, o = new THREE.Vector3(0, 0.6, 0), chest = (d: THREE.Vector3) => new THREE.Vector3(d.x, 0.7, d.z);
    const hitFx = (delay: number) => hitIdx.forEach((i) => store.after(delay, () => burst(store, style, chest(L.dummies[i]), color, 0.55, 0)));
    switch (s.shape) {
      case 'melee': slash(store, o, 0, s.range, color, s.power >= 40); hitFx(0.07); break;
      case 'cone': cone(store, style, o, 0, s.angle, s.range, color); hitFx(0.2); break;
      case 'line': beam(store, style, o, new THREE.Vector3(0, 0.6, s.range), s.radius, color); hitFx(0.05); break;
      case 'dash': dashFx.current = new Missile(store, style, color, 0.7); hitFx(0.2); break;
      case 'projectile': missile(store, { style, color, from: new THREE.Vector3(0, 0.7, 0.4), to: chest(L.dummies[0]), duration: 0.36, arc: 0.35, size: Math.max(0.65, s.radius * 1.4), onArrive: (at) => burst(store, style, at, color, 0.9, 0) }); break;
      case 'circle': {
        const falls = ['chamas', 'pedras', 'raios', 'gelo', 'gotas'].includes(style);
        const land = () => area(store, style, L.target, s.radius, color, 0);
        if (falls) missile(store, { style, color, from: new THREE.Vector3(L.target.x - 1.2, 6, L.target.z - 0.8), to: new THREE.Vector3(L.target.x, 0.3, L.target.z), duration: 0.3, size: 0.8, onArrive: land });
        else land();
        break;
      }
      case 'leap': store.after(EFFECT * 0.5, () => area(store, style, L.target, s.radius, color, 0)); break;
      case 'aura': aura(store, style, new THREE.Vector3(), s.radius, color, 0); break;
    }
  };

  useFrame((_, dtRaw) => {
    if (timeScale === 0) return;
    const dt = Math.min(dtRaw, 0.05) * timeScale;
    clock.current += dt;
    let t = clock.current % cycle;
    if (clock.current >= cycle && t < dt) { fired.current = false; }
    const s = skill;
    const w = s.windup, inTele = t < w, e = (t - w) / EFFECT; // e: 0..1 durante o efeito
    // modelo de treino: a animação começa junto com o aviso (a preparação)
    const cycleN = Math.floor(clock.current / cycle);
    if (layerCycle.current !== cycleN) {
      layerCycle.current = cycleN;
      playVfxLayers(store, skill, { origin: new THREE.Vector3(), target: L.target, yaw: 0, color });
    }
    if (body && cycleN !== cueAt.current) {
      cueAt.current = cycleN;
      const kinds = [body.anim, s.anim === 'attack' && s.shape !== 'melee' ? 'cast' : s.anim, 'attack', 'cast'].filter((k): k is string => !!k);
      setCue({ id: cycleN, kinds, speed: 1.4 });
    }
    // aviso enchendo
    if (tele.current && fill.current) {
      tele.current.visible = fill.current.visible = inTele && w > 0.01;
      const k = Math.min(1, t / Math.max(0.01, w));
      if (s.shape === 'line' || s.shape === 'dash' || s.shape === 'projectile') fill.current.scale.set(1, 1, k); else fill.current.scale.setScalar(k);
    }
    // disparo
    if (!inTele && !fired.current) {
      fired.current = true;
      const idx: number[] = [];
      L.dummies.forEach((d, i) => { if (hits(s, L, d)) { hitT.current[i] = 0.001; idx.push(i); } });
      fire(idx);
      onHit(idx.length);
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
    // investida: rastro do estilo seguindo o conjurador
    if (dashFx.current && caster.current) {
      if (active && e < 0.5) dashFx.current.update(caster.current.position.clone().setY(0.55), dt);
      else { dashFx.current.end(); dashFx.current = null; }
    }
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[11, 64]} /><meshLambertMaterial color={dark ? "#162538" : "#8fcf60"} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}><ringGeometry args={[10.6, 11, 64]} /><meshBasicMaterial color="#b3a8d2" /></mesh>
      {/* aviso */}
      <group position={[at.x, 0.02, at.z]}>
        <mesh ref={tele} geometry={geo}><meshBasicMaterial color={TELE} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        <mesh ref={fill} geometry={geo} position={[0, 0.005, 0]}><meshBasicMaterial color={TELE} transparent opacity={0.45} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      </group>
      {/* conjurador */}
      <group ref={caster}>
        {body ? (
          <AssetBoundary><Suspense fallback={null}><TrainingModel timeScale={timeScale} url={body.url} cue={cue} companionId={body.companionId} /></Suspense></AssetBoundary>
        ) : (
          <>
            <mesh position={[0, 0.5, 0]} castShadow><capsuleGeometry args={[0.32, 0.35, 6, 16]} /><meshLambertMaterial color={color} /></mesh>
            <mesh position={[-0.12, 0.72, 0.27]}><sphereGeometry args={[0.06, 12, 12]} /><meshBasicMaterial color="#1b1830" /></mesh>
            <mesh position={[0.12, 0.72, 0.27]}><sphereGeometry args={[0.06, 12, 12]} /><meshBasicMaterial color="#1b1830" /></mesh>
          </>
        )}
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
      <VfxLayer store={store} timeScale={timeScale} />
    </group>
  );
}

export function SkillPreview({ skill, companionColor, defenderEssence, body, paused = false, speed = 1, restart = 0, dark = false }: { skill: SkillDef; companionColor: string; defenderEssence: Element | null; body?: TrainingBody | null; paused?: boolean; speed?: number; restart?: number; dark?: boolean }) {
  const color = skillColor(skill, companionColor);
  const [last, setLast] = useState<{ n: number; id: number }>({ n: 0, id: 0 });
  const mult = affinity(skill.essence, defenderEssence);
  const dmg = expectedDamage(skill, 60, 40, mult);
  const far = Math.max(8, skill.range + 4);
  return (
    <div className="skill-preview">
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [far * 0.55, far * 0.75, -far * 0.45], fov: 40 }} onCreated={({ camera }) => camera.lookAt(0, 0, Math.min(3, skill.range / 2))}>
        <color attach="background" args={[dark ? '#080e1b' : '#bfe6ff']} />
        <hemisphereLight args={['#ffffff', '#5aa84c', 1.4]} />
        <directionalLight position={[5, 10, -4]} intensity={1.6} castShadow />
        {/* arraste para girar, roda/pinça para aproximar — para conferir os ângulos */}
        <OrbitControls makeDefault target={[0, 0.5, Math.min(3, skill.range / 2)]} enablePan={false} enableDamping dampingFactor={0.12} minDistance={2} maxDistance={Math.max(14, far * 1.8)} maxPolarAngle={Math.PI * 0.49} />
        <Scene key={(body?.url ?? '') + skill.slug + skill.shape + skill.windup + skill.range + skill.radius + skill.angle + skill.vfx.style + JSON.stringify(skill.vfx) + restart} timeScale={paused ? 0 : speed} dark={dark} skill={skill} color={color} body={body} onHit={(n) => setLast((l) => ({ n, id: l.id + 1 }))} />
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
