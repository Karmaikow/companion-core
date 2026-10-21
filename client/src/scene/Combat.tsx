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
import { gameVfx } from './vfx/engine';
import { VfxLayer } from './vfx/VfxLayer';
import { burst, Charge, Missile, slash } from './vfx/recipes';
import type { WorldShape } from './world';

/** Entrada: apertar começa (o arco carrega enquanto segura), soltar termina. */
export const combatInput = { holding: false, pressId: 0, releaseId: 0 };
export function pressAttack() { if (combatInput.holding) return; combatInput.holding = true; combatInput.pressId++; }
export function releaseAttack() { if (!combatInput.holding) return; combatInput.holding = false; combatInput.releaseId++; }

/** Carga do arco agora (para o efeito e para a corda). */
export const chargeState = { active: false, charge: 0, perfect: false, pos: new THREE.Vector3(), yaw: 0, range: 0, color: '#ffd56b' };

export type FxEvent =
  | { kind: 'slash'; pos: THREE.Vector3; yaw: number; range: number; damage: number; color: string; heavy: boolean }
  | { kind: 'magic'; pos: THREE.Vector3; yaw: number; range: number; damage: number; color: string; style?: string }
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

interface Live { id: number; ev: FxEvent; t: number; done: boolean; hit: boolean; at: THREE.Vector3; fx?: Missile }
interface Num { id: number; pos: THREE.Vector3; text: string; gold: boolean; t: number }
let seq = 0;

export function CombatFx({ world }: { world: WorldShape }) {
  const live = useRef<Live[]>([]);
  const [nums, setNums] = useState<Num[]>([]);
  const [, force] = useState(0);
  const ring = useRef<THREE.Mesh>(null);
  const line = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Mesh>(null);
  const charger = useMemo(() => new Charge(gameVfx), []);
  const pop = (pos: THREE.Vector3, text: string, gold: boolean) => setNums((n) => [...n.slice(-8), { id: ++seq, pos: pos.clone(), text, gold, t: performance.now() }]);

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), t = s.clock.elapsedTime;
    // novos eventos
    while (fxQueue.length) {
      const ev = fxQueue.shift()!, L: Live = { id: ++seq, ev, t: 0, done: false, hit: false, at: ev.pos.clone() };
      if (ev.kind === 'slash') slash(gameVfx, ev.pos.clone().setY(world.heightAt(ev.pos.x, ev.pos.z) + 0.65), ev.yaw, ev.range, ev.color, ev.heavy);
      else L.fx = ev.kind === 'magic' ? new Missile(gameVfx, ev.style ?? 'luz', ev.color, 0.55) : new Missile(gameVfx, ev.perfect ? 'luz' : 'faiscas', ev.color, ev.perfect ? 0.32 : 0.16);
      live.current.push(L); force((x) => x + 1);
    }
    // carga do arco: faíscas girando para a ponta da flecha, traço no chão até onde vai, anel que cresce
    const c = chargeState;
    const fw = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    if (ring.current && line.current && tip.current) {
      const on = c.active;
      ring.current.visible = line.current.visible = tip.current.visible = on;
      if (!on) charger.stop();
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
        const hand = c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)).addScaledVector(fw, 0.4);
        charger.update(hand, c.color, c.charge, c.perfect, dt);
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
        if (L.fx && !L.hit) L.fx.update(L.at, dt);
        const gy = world.heightAt(L.at.x, L.at.z);
        if (!L.hit && hitAt(L.at.x, L.at.z, 0.35, ev.damage)) {
          L.hit = true; pop(L.at, String(ev.damage), ev.kind === 'arrow' && ev.perfect); L.t = Math.max(L.t, ev.range / speed);
          L.fx?.end(); burst(gameVfx, ev.kind === 'magic' ? ev.style ?? 'luz' : 'faiscas', L.at.clone(), ev.color, ev.kind === 'arrow' && !ev.perfect ? 0.45 : 0.75, gy);
        }
        if (!L.hit && dist >= ev.range) { L.hit = true; L.fx?.end(); burst(gameVfx, ev.kind === 'magic' ? ev.style ?? 'luz' : 'impacto', L.at.clone(), ev.color, 0.35, gy); }
        if (dist >= ev.range && L.t > ev.range / speed + 0.5) { L.done = true; changed = true; }
      } else {
        if (!L.hit && L.t > 0.12) {
          L.hit = true;
          const f = new THREE.Vector3(Math.sin(ev.yaw), 0, Math.cos(ev.yaw)), p = ev.pos.clone().addScaledVector(f, ev.range * 0.7);
          if (hitAt(p.x, p.z, ev.range * 0.55, ev.damage)) {
            const gy = world.heightAt(p.x, p.z);
            burst(gameVfx, 'impacto', p.clone().setY(gy + 0.7), ev.color, ev.heavy ? 0.8 : 0.55, gy);
            pop(p.setY(gy + 1), String(ev.damage), ev.heavy);
          }
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
      <VfxLayer store={gameVfx} />
      {live.current.map((L) => <FxView key={L.id} L={L} />)}
      {nums.map((n) => (
        <Html key={n.id} position={n.pos} center style={{ pointerEvents: 'none' }}>
          <div className={'dmg' + (n.gold ? ' gold' : '')}>{n.text}</div>
        </Html>
      ))}
    </group>
  );
}

/** Haste da flecha (o rastro e o brilho vêm do motor de efeitos). */
function FxView({ L }: { L: Live }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => { const grp = g.current; if (!grp) return; grp.position.copy(L.at); grp.rotation.set(0, L.ev.yaw, 0); grp.visible = !L.hit; });
  const ev = L.ev;
  if (ev.kind !== 'arrow') return null;
  return (
    <group ref={g}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.014, 0.014, 0.6, 6]} /><meshBasicMaterial color={ev.perfect ? '#ffe68a' : '#f3efe0'} /></mesh>
      <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.04, 0.12, 6]} /><meshBasicMaterial color={ev.color} toneMapped={false} /></mesh>
      <mesh position={[0, 0, -0.27]}><boxGeometry args={[0.1, 0.01, 0.1]} /><meshBasicMaterial color={ev.color} /></mesh>
    </group>
  );
}

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __combat: unknown }).__combat = { combatInput, chargeState, targets, fxQueue, vfx: gameVfx };
