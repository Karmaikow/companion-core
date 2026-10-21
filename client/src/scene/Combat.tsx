/**
 * Ataque do Companion fora da batalha de verdade (treino e mundo): golpe corpo a corpo, magia e o tiro carregado do
 * arco. Estado global simples (como moveRequest): o botão/teclado escreve em `combatInput`; o Companion lê, anima e
 * dispara eventos em `fx`; `CombatFx` desenha os efeitos e confere acertos nos alvos registrados (`targets`:
 * bonecos de treino e criaturas). A batalha de verdade (simulação por ticks) vai usar as mesmas regras de arma.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { softDot } from './textures';
import type { WorldShape } from './world';

/** Entrada: apertar começa (o arco carrega enquanto segura), soltar termina. */
export const combatInput = { holding: false, pressId: 0, releaseId: 0 };
export function pressAttack() { if (combatInput.holding) return; combatInput.holding = true; combatInput.pressId++; }
export function releaseAttack() { if (!combatInput.holding) return; combatInput.holding = false; combatInput.releaseId++; }

/** Carga do arco agora (para o efeito e para a corda). */
export const chargeState = { active: false, charge: 0, perfect: false, pos: new THREE.Vector3(), yaw: 0, range: 0, color: '#ffd56b' };

export type FxEvent =
  | { kind: 'slash'; pos: THREE.Vector3; yaw: number; range: number; damage: number; color: string; heavy: boolean }
  | { kind: 'magic'; pos: THREE.Vector3; yaw: number; range: number; damage: number; color: string }
  | { kind: 'arrow'; pos: THREE.Vector3; yaw: number; range: number; speed: number; damage: number; color: string; perfect: boolean };
export const fxQueue: FxEvent[] = [];

/** Alvos que podem ser acertados (bonecos, criaturas). */
export interface Target { x: number; z: number; r: number; hit: (damage: number) => void }
export const targets = new Map<string, Target>();

function hitAt(x: number, z: number, radius: number, damage: number): boolean {
  let any = false;
  targets.forEach((t) => { if (Math.hypot(t.x - x, t.z - z) <= t.r + radius) { t.hit(damage); any = true; } });
  return any;
}

interface Live { id: number; ev: FxEvent; t: number; done: boolean; hit: boolean; at: THREE.Vector3 }
interface Num { id: number; pos: THREE.Vector3; text: string; gold: boolean; t: number }
let seq = 0;

export function CombatFx({ world }: { world: WorldShape }) {
  const live = useRef<Live[]>([]);
  const [nums, setNums] = useState<Num[]>([]);
  const [, force] = useState(0);
  const ring = useRef<THREE.Mesh>(null);
  const line = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Mesh>(null);
  const charge = useRef<THREE.Points>(null);
  const chargeGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3)); return g; }, []);
  const pop = (pos: THREE.Vector3, text: string, gold: boolean) => setNums((n) => [...n.slice(-8), { id: ++seq, pos: pos.clone(), text, gold, t: performance.now() }]);

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), t = s.clock.elapsedTime;
    // novos eventos
    while (fxQueue.length) { const ev = fxQueue.shift()!; live.current.push({ id: ++seq, ev, t: 0, done: false, hit: false, at: ev.pos.clone() }); force((x) => x + 1); }
    // carga do arco: faíscas girando para a ponta da flecha, traço no chão até onde vai, anel que cresce
    const c = chargeState;
    const fw = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    if (ring.current && line.current && tip.current && charge.current) {
      const on = c.active;
      ring.current.visible = line.current.visible = tip.current.visible = charge.current.visible = on;
      if (on) {
        const col = c.perfect ? '#ffffff' : c.color;
        ring.current.position.set(c.pos.x, world.heightAt(c.pos.x, c.pos.z) + 0.04, c.pos.z);
        ring.current.scale.setScalar(0.4 + c.charge * 0.5 + (c.perfect ? Math.sin(t * 20) * 0.05 : 0));
        (ring.current.material as THREE.MeshBasicMaterial).color.set(col);
        // traço no chão: do Companion até o alcance atual
        const L = Math.max(0.5, c.range), mid = c.pos.clone().addScaledVector(fw, L / 2);
        line.current.position.set(mid.x, world.heightAt(mid.x, mid.z) + 0.05, mid.z);
        line.current.rotation.set(-Math.PI / 2, 0, -c.yaw);
        line.current.scale.set(1, L, 1);
        (line.current.material as THREE.MeshBasicMaterial).color.set(col);
        (line.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + c.charge * 0.35;
        const end = c.pos.clone().addScaledVector(fw, L);
        tip.current.position.set(end.x, world.heightAt(end.x, end.z) + 0.06, end.z);
        tip.current.scale.setScalar(0.25 + c.charge * 0.35);
        (tip.current.material as THREE.MeshBasicMaterial).color.set(col);
        const p = chargeGeo.attributes.position as THREE.BufferAttribute, hand = c.pos.clone().add(new THREE.Vector3(0, 0.55, 0)).addScaledVector(fw, 0.35);
        for (let i = 0; i < 48; i++) {
          const ph = (t * (1.5 + c.charge * 3) + i / 48) % 1, a = i * 2.4 + t * (3 + c.charge * 6), r = (1 - ph) * (0.5 - c.charge * 0.2);
          p.setXYZ(i, hand.x + Math.cos(a) * r, hand.y + Math.sin(a * 1.3) * r * 0.6, hand.z + Math.sin(a) * r);
        }
        p.needsUpdate = true;
        (charge.current.material as THREE.PointsMaterial).color.set(col);
        (charge.current.material as THREE.PointsMaterial).size = 0.07 + c.charge * 0.06;
      }
    }
    // eventos vivos
    let changed = false;
    for (const L of live.current) {
      const ev = L.ev; L.t += dt;
      if (ev.kind === 'arrow' || ev.kind === 'magic') {
        const speed = ev.kind === 'arrow' ? ev.speed : 12, dist = Math.min(ev.range, L.t * speed);
        const f = new THREE.Vector3(Math.sin(ev.yaw), 0, Math.cos(ev.yaw));
        L.at.copy(ev.pos).addScaledVector(f, dist);
        const u = dist / Math.max(0.1, ev.range);
        L.at.y = world.heightAt(L.at.x, L.at.z) + 0.6 + (ev.kind === 'arrow' ? Math.sin(u * Math.PI) * ev.range * 0.08 : 0.1);
        if (!L.hit && hitAt(L.at.x, L.at.z, 0.35, ev.damage)) { L.hit = true; pop(L.at, String(ev.damage), ev.kind === 'arrow' && ev.perfect); L.t = Math.max(L.t, ev.range / speed); }
        if (dist >= ev.range && L.t > ev.range / speed + 0.5) { L.done = true; changed = true; }
      } else {
        if (!L.hit && L.t > 0.12) {
          L.hit = true;
          const f = new THREE.Vector3(Math.sin(ev.yaw), 0, Math.cos(ev.yaw)), p = ev.pos.clone().addScaledVector(f, ev.range * 0.7);
          if (hitAt(p.x, p.z, ev.range * 0.55, ev.damage)) pop(p.setY(world.heightAt(p.x, p.z) + 1), String(ev.damage), ev.heavy);
        }
        if (L.t > 0.5) { L.done = true; changed = true; }
      }
    }
    if (changed) { live.current = live.current.filter((x) => !x.done); force((x) => x + 1); }
    if (nums.length && performance.now() - nums[0].t > 1200) setNums((n) => n.slice(1));
  });

  return (
    <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.85, 1, 40]} /><meshBasicMaterial transparent opacity={0.7} depthWrite={false} toneMapped={false} /></mesh>
      <mesh ref={line} visible={false}><planeGeometry args={[0.12, 1]} /><meshBasicMaterial transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh ref={tip} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.6, 1, 24]} /><meshBasicMaterial transparent opacity={0.8} depthWrite={false} toneMapped={false} /></mesh>
      <points ref={charge} geometry={chargeGeo} visible={false} frustumCulled={false}><pointsMaterial map={softDot()} size={0.08} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
      {live.current.map((L) => <FxView key={L.id} L={L} />)}
      {nums.map((n) => (
        <Html key={n.id} position={n.pos} center style={{ pointerEvents: 'none' }}>
          <div className={'dmg' + (n.gold ? ' gold' : '')}>{n.text}</div>
        </Html>
      ))}
    </group>
  );
}

function FxView({ L }: { L: Live }) {
  const g = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Points>(null);
  const trailGeo = useMemo(() => { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)); return gg; }, []);
  const hist = useRef<THREE.Vector3[]>([]);
  useFrame(() => {
    const ev = L.ev, grp = g.current; if (!grp) return;
    if (ev.kind === 'arrow' || ev.kind === 'magic') {
      grp.position.copy(L.at); grp.rotation.set(0, ev.yaw, 0);
      hist.current.unshift(L.at.clone()); hist.current.length = Math.min(hist.current.length, 30);
      const p = trailGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 30; i++) { const h = hist.current[Math.min(i, hist.current.length - 1)]; p.setXYZ(i, h.x, h.y, h.z); }
      p.needsUpdate = true;
    } else {
      grp.position.copy(ev.pos).add(new THREE.Vector3(0, 0.6, 0)); grp.rotation.set(0, ev.yaw, 0);
      const k = Math.min(1, L.t / 0.3);
      grp.scale.setScalar(0.6 + k * 0.6);
      grp.children.forEach((m) => { const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (mat) mat.opacity = Math.max(0, 1 - L.t / 0.45); });
    }
  });
  const ev = L.ev;
  if (ev.kind === 'arrow') return (
    <>
      <group ref={g}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.012, 0.012, 0.6, 6]} /><meshBasicMaterial color={ev.perfect ? '#ffe68a' : '#f3efe0'} /></mesh>
        <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.035, 0.1, 6]} /><meshBasicMaterial color={ev.color} toneMapped={false} /></mesh>
      </group>
      <points geometry={trailGeo} frustumCulled={false}><pointsMaterial map={softDot()} color={ev.perfect ? '#ffe68a' : ev.color} size={ev.perfect ? 0.16 : 0.09} transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
    </>
  );
  if (ev.kind === 'magic') return (
    <>
      <group ref={g}><mesh><sphereGeometry args={[0.13, 16, 12]} /><meshBasicMaterial color={ev.color} toneMapped={false} /></mesh></group>
      <points geometry={trailGeo} frustumCulled={false}><pointsMaterial map={softDot()} color={ev.color} size={0.14} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
    </>
  );
  // golpe: arco de luz na frente (pesado = mais largo e grosso)
  return (
    <group ref={g}>
      <mesh rotation={[-Math.PI / 2 + 0.2, 0, -Math.PI / 2]} position={[0, 0, ev.range * 0.35]}>
        <ringGeometry args={[ev.range * 0.55, ev.range * (ev.heavy ? 0.85 : 0.72), 32, 1, -1.1, 2.2]} />
        <meshBasicMaterial color={ev.color} transparent opacity={1} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __combat: unknown }).__combat = { combatInput, chargeState, targets };
