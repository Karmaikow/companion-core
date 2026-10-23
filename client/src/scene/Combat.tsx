/**
 * Ataque do Companion fora da batalha de verdade (treino e mundo): golpe corpo a corpo, magia e o tiro carregado do
 * arco. Estado global simples (como moveRequest): o botão/teclado escreve em `combatInput`; o Companion lê, anima e
 * dispara eventos em `fx`; `CombatFx` desenha os efeitos e confere acertos nos alvos registrados (`targets`:
 * bonecos de treino e criaturas). A batalha de verdade (simulação por ticks) vai usar as mesmas regras de arma.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { settings } from '../settings';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { gameVfx } from './vfx/engine';
import { VfxLayer } from './vfx/VfxLayer';
import { area, aura, beam, burst, Charge, cone, Missile, missile, slash } from './vfx/recipes';
import { K } from './vfx/engine';
import { healCompanion, hurtCompanion, vitals } from './vitals';
import type { HitInfo, SkillDef } from '@rules';
import { markCombat } from '../build/combatStats';
import { attackPick, companionFocus, type WorldShape } from './world';

/** Entrada: apertar começa (o arco carrega enquanto segura), soltar termina. */
export const combatInput = { holding: false, pressId: 0, releaseId: 0 };
export function pressAttack() { if (combatInput.holding) return; combatInput.holding = true; combatInput.pressId++; }
export function releaseAttack() { if (!combatInput.holding) return; combatInput.holding = false; combatInput.releaseId++; }

/** Números flutuantes vindos de fora (dano no Companion, itens que caíram). */
export const numQueue: { pos: THREE.Vector3; text: string; kind: 'hurt' | 'drop' | 'heal' | 'poison' | 'burn' }[] = [];

/** Pulo, sentar e defesa (teclado: Espaço, C, segurar E; celular: botões). */
export const moveInput = { jumpId: 0, sitId: 0, block: false };

/** Mira pelo mouse: vale quando a última interação foi com mouse (no celular, a mira é automática). */
export const aim = { mouse: false };
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => { aim.mouse = e.pointerType === 'mouse'; }, { passive: true });
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { aim.mouse = e.pointerType === 'mouse'; }, { passive: true });

/** Carga do arco agora (para o efeito e para a corda). */
/** Concentração de habilidade (Shift + 1–9): a barra escreve aqui, a cena mostra o brilho crescendo no Companion. */
export const skillChargeState = { active: false, charge: 0, perfect: false, color: '#ffd56b' };
export const chargeState = { active: false, charge: 0, perfect: false, pos: new THREE.Vector3(), yaw: 0, range: 0, color: '#ffd56b' };

export type FxEvent =
  | { kind: 'slash'; pos: THREE.Vector3; yaw: number; range: number; damage: number; color: string; heavy: boolean; info?: HitInfo }
  | { kind: 'magic'; pos: THREE.Vector3; yaw: number; range: number; damage: number; color: string; style?: string; info?: HitInfo }
  | { kind: 'arrow'; pos: THREE.Vector3; yaw: number; range: number; speed: number; damage: number; color: string; perfect: boolean; info?: HitInfo }
  | { kind: 'skill'; pos: THREE.Vector3; yaw: number; target: THREE.Vector3; skill: SkillDef; damage: number; heal: number; color: string; info?: HitInfo };
export const fxQueue: FxEvent[] = [];

/** Habilidade pedida pela barra de atalhos (1–9); o Companion lê, vira para o alvo, anima e dispara. */
export interface SkillCast { skill: SkillDef; level: number; color: string; /** custo, preparação e dano congelados no lançamento (Constelação Viva) */ frozen?: { cost: number; windup: number; damage: number; heal: number; info: HitInfo }; /** mira num ponto (a Companion lutando sozinha, ou mira no monstro mais perto) */ aimAt?: { x: number; z: number } }
export const skillInput = { id: 0, req: null as SkillCast | null, /** há um corpo 3D para lançar */ body: false };
export function requestSkill(c: SkillCast) { skillInput.req = c; skillInput.id++; }

/** Alvos que podem ser acertados (bonecos, criaturas). */
/** `hit` devolve o dano que entrou (com a defesa), se o alvo tiver vida. */
export interface Target { x: number; z: number; r: number; hit: (damage: number, info?: HitInfo) => number | void; /** criatura do mundo (para a Companion escolher alvos) */ creature?: { slug: string; name: string; level: number; hostile: () => boolean; hp: () => number }; /** estado com dano por segundo (envenenado, queimando) */ afflict?: (key: string, seconds: number, dps: number) => void }
export const targets = new Map<string, Target>();

/** Acerta tudo no círculo; devolve o maior dano que entrou (-1 = ninguém). */
function hitAt(x: number, z: number, radius: number, damage: number, info?: HitInfo): number {
  let best = -1;
  targets.forEach((t) => { if (Math.hypot(t.x - x, t.z - z) <= t.r + radius) { const d = t.hit(damage, info); best = Math.max(best, typeof d === 'number' ? d : damage); } });
  if (best >= 0) markCombat();
  return best;
}

interface Live { id: number; ev: FxEvent; t: number; done: boolean; hit: boolean; at: THREE.Vector3; fx?: Missile }
interface Num { id: number; pos: THREE.Vector3; text: string; gold: boolean | 'heal' | 'hurt' | 'drop' | 'poison' | 'burn'; t: number }
let seq = 0;

export function CombatFx({ world }: { world: WorldShape }) {
  const live = useRef<Live[]>([]);
  const [nums, setNums] = useState<Num[]>([]);
  const [, force] = useState(0);
  const ring = useRef<THREE.Mesh>(null);
  const line = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Mesh>(null);
  const charger = useMemo(() => new Charge(gameVfx), []);
  const skillCharger = useMemo(() => new Charge(gameVfx), []);
  const skillRing = useRef<THREE.Mesh>(null);
  // Ajustes: clique esquerdo ataca (segurar carrega o arco); o direito anda e não abre o menu do navegador
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => { if (e.button === 0 && e.pointerType === 'mouse' && settings().click === 'atacar') pressAttack(); };
    const up = (e: PointerEvent) => { if (e.button === 0) releaseAttack(); };
    const menu = (e: MouseEvent) => { if (settings().click === 'atacar') e.preventDefault(); };
    el.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); el.addEventListener('contextmenu', menu);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); el.removeEventListener('contextmenu', menu); };
  }, [gl]);
  const pop = (pos: THREE.Vector3, text: string, gold: Num['gold']) => (gold === 'drop' || gold === 'heal' || settings().damageNumbers) && setNums((n) => [...n.slice(-8), { id: ++seq, pos: pos.clone(), text, gold, t: performance.now() }]);

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), t = s.clock.elapsedTime;
    // novos eventos
    while (fxQueue.length) {
      const ev = fxQueue.shift()!;
      if (import.meta.env.DEV) devLog.push({ kind: ev.kind, yaw: ev.yaw, x: ev.pos.x, z: ev.pos.z, t: performance.now() });
      const L: Live = { id: ++seq, ev, t: 0, done: false, hit: false, at: ev.pos.clone() };
      if (ev.kind === 'skill') { runSkill(ev, world, pop); continue; }
      if (ev.kind === 'slash') slash(gameVfx, ev.pos.clone().setY(world.heightAt(ev.pos.x, ev.pos.z) + 0.65), ev.yaw, ev.range, ev.color, ev.heavy);
      else L.fx = ev.kind === 'magic' ? new Missile(gameVfx, ev.style ?? 'luz', ev.color, 0.55) : new Missile(gameVfx, ev.perfect ? 'luz' : 'faiscas', ev.color, ev.perfect ? 0.32 : 0.16);
      live.current.push(L); force((x) => x + 1);
    }
    while (numQueue.length) { const n = numQueue.shift()!; pop(n.pos, n.text, n.kind); }
    // concentração de habilidade: brilho no peito do Companion e anel no chão que crescem até 2,5 s
    {
      const sc = skillChargeState, ringM = skillRing.current;
      if (sc.active) {
        const at = new THREE.Vector3(companionFocus.x, companionFocus.y + 0.9, companionFocus.z);
        skillCharger.update(at, sc.color, sc.charge, sc.perfect, dt);
        if (ringM) { ringM.visible = true; ringM.position.set(companionFocus.x, world.heightAt(companionFocus.x, companionFocus.z) + 0.05, companionFocus.z); ringM.scale.setScalar(0.5 + sc.charge * 1.1 + (sc.perfect ? Math.sin(t * 22) * 0.06 : 0)); (ringM.material as THREE.MeshBasicMaterial).color.set(sc.perfect ? '#ffffff' : sc.color); (ringM.material as THREE.MeshBasicMaterial).opacity = 0.35 + sc.charge * 0.5; }
      } else { skillCharger.stop(); if (ringM) ringM.visible = false; }
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
      if (ev.kind === 'skill') continue;
      if (ev.kind === 'arrow' || ev.kind === 'magic') {
        const speed = ev.kind === 'arrow' ? ev.speed : 12, dist = Math.min(ev.range, L.t * speed);
        const f = new THREE.Vector3(Math.sin(ev.yaw), 0, Math.cos(ev.yaw));
        L.at.copy(ev.pos).addScaledVector(f, dist);
        const u = dist / Math.max(0.1, ev.range);
        L.at.y = world.heightAt(L.at.x, L.at.z) + 0.6 + (ev.kind === 'arrow' ? Math.sin(u * Math.PI) * ev.range * 0.08 : 0.1);
        if (L.fx && !L.hit) L.fx.update(L.at, dt);
        const gy = world.heightAt(L.at.x, L.at.z);
        const dealt = L.hit ? -1 : hitAt(L.at.x, L.at.z, 0.35, ev.damage, ev.info);
        if (dealt >= 0) {
          L.hit = true; pop(L.at, String(dealt), ev.kind === 'arrow' && ev.perfect); L.t = Math.max(L.t, ev.range / speed);
          L.fx?.end(); burst(gameVfx, ev.kind === 'magic' ? ev.style ?? 'luz' : 'faiscas', L.at.clone(), ev.color, ev.kind === 'arrow' && !ev.perfect ? 0.45 : 0.75, gy);
        }
        if (!L.hit && dist >= ev.range) { L.hit = true; L.fx?.end(); burst(gameVfx, ev.kind === 'magic' ? ev.style ?? 'luz' : 'impacto', L.at.clone(), ev.color, 0.35, gy); }
        if (dist >= ev.range && L.t > ev.range / speed + 0.5) { L.done = true; changed = true; }
      } else {
        if (!L.hit && L.t > 0.12) {
          L.hit = true;
          const f = new THREE.Vector3(Math.sin(ev.yaw), 0, Math.cos(ev.yaw)), p = ev.pos.clone().addScaledVector(f, ev.range * 0.7);
          const dealt = hitAt(p.x, p.z, ev.range * 0.55, ev.damage, ev.info);
          if (dealt >= 0) {
            const gy = world.heightAt(p.x, p.z);
            burst(gameVfx, 'impacto', p.clone().setY(gy + 0.7), ev.color, ev.heavy ? 0.8 : 0.55, gy);
            pop(p.setY(gy + 1), String(dealt), ev.heavy);
          }
        }
        if (L.t > 0.5) { L.done = true; changed = true; }
      }
    }
    if (changed) { live.current = live.current.filter((x) => !x.done); force((x) => x + 1); }
    if (nums.length && performance.now() - nums[0].t > 1400) setNums((n) => n.slice(1));
  });

  return (
    <group>
      <mesh ref={skillRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.7, 0.82, 48]} /><meshBasicMaterial transparent opacity={0.6} depthWrite={false} toneMapped={false} /></mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.85, 1, 40]} /><meshBasicMaterial transparent opacity={0.7} depthWrite={false} toneMapped={false} /></mesh>
      <mesh ref={line} visible={false}><planeGeometry args={[0.12, 1]} /><meshBasicMaterial transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh ref={tip} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.6, 1, 24]} /><meshBasicMaterial transparent opacity={0.8} depthWrite={false} toneMapped={false} /></mesh>
      <AttackReticle world={world} />
      <VfxLayer store={gameVfx} />
      {live.current.map((L) => <FxView key={L.id} L={L} />)}
      {nums.map((n) => (
        <Html key={n.id} position={n.pos} center style={{ pointerEvents: 'none' }}>
          <div className={'dmg' + (typeof n.gold === 'string' ? ' ' + n.gold : n.gold ? ' gold' : '')}>{n.text}</div>
        </Html>
      ))}
    </group>
  );
}

/** Último ponto do mouse na tela (para o cursor de ataque). */
export const mousePx = { x: -1, y: -1, inside: false };
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mousePx.x = e.clientX; mousePx.y = e.clientY; mousePx.inside = true; } }, { passive: true });
  document.addEventListener('mouseleave', () => { mousePx.inside = false; });
}

/**
 * Clique no monstro para atacar: descobre qual alvo está sob o cursor (pela posição na tela, então vale para o corpo
 * todo e não só para o pé), troca o cursor por uma espadinha e desenha um alvo animado no chão do monstro: dourado
 * quando o mouse passa por cima, vermelho girando quando é o alvo travado. Depois de levantar de um desmaio, um anel
 * dourado pulsa em volta do Companion enquanto ele está invencível.
 */
function AttackReticle({ world }: { world: WorldShape }) {
  const { camera, gl } = useThree();
  const hoverG = useRef<THREE.Group>(null), focusG = useRef<THREE.Group>(null), guard = useRef<THREE.Mesh>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const pick = useMemo(() => (cx: number, cy: number): string | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const fov = ((camera as THREE.PerspectiveCamera).fov ?? 40) * Math.PI / 180;
    let best: string | null = null, bestScore = 1;
    targets.forEach((t, key) => {
      if (t.r < 0 || (t.creature && t.creature.hp() <= 0)) return;
      const gy = world.heightAt(t.x, t.z);
      v.set(t.x, gy + 0.55, t.z);
      const dist = camera.position.distanceTo(v);
      v.project(camera);
      if (v.z > 1) return;
      const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width, sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
      const px = rect.height / (2 * Math.tan(fov / 2) * Math.max(0.5, dist)); // pixels por metro
      const rx = (t.r + 0.35) * px + 10, ry = rx * 1.5;
      const score = Math.hypot((cx - sx) / rx, (cy - sy) / ry);
      if (score < bestScore) { bestScore = score; best = key; }
    });
    return best;
  }, [camera, gl, world, v]);
  useEffect(() => { attackPick.pick = pick; return () => { if (attackPick.pick === pick) attackPick.pick = null; attackPick.hover = null; gl.domElement.classList.remove('cursor-attack'); }; }, [pick, gl]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    // o que está sob o mouse (só com mouse e quando o clique esquerdo anda; no modo "atacar" o cursor já é de ataque)
    const hov = mousePx.inside && aim.mouse && skillInput.body && settings().click !== 'atacar' ? pick(mousePx.x, mousePx.y) : null;
    if (hov !== attackPick.hover) { attackPick.hover = hov; gl.domElement.classList.toggle('cursor-attack', !!hov); }
    const place = (g: THREE.Group | null, key: string | null, spin: number, pulse: number) => {
      if (!g) return;
      const tg = key ? targets.get(key) : undefined;
      g.visible = !!tg;
      if (!tg) return;
      g.position.set(tg.x, world.heightAt(tg.x, tg.z) + 0.06, tg.z);
      g.rotation.y = t * spin;
      g.scale.setScalar((tg.r * 2.2 + 0.55) * pulse); // o raio de colisão é menor que o corpo visível
    };
    const focus = attackPick.focus;
    place(hoverG.current, hov && hov !== focus ? hov : null, 1.2, 1.15 - 0.12 * Math.abs(Math.sin(t * 5)));
    place(focusG.current, focus, -2.2, 1 + 0.06 * Math.sin(t * 9));
    const g = guard.current;
    if (g) {
      const left = vitals.invulnUntil - performance.now();
      g.visible = left > 0 && vitals.down <= 0;
      if (g.visible) {
        g.position.set(companionFocus.x, world.heightAt(companionFocus.x, companionFocus.z) + 0.05, companionFocus.z);
        g.scale.setScalar(0.9 + 0.12 * Math.sin(t * 6));
        (g.material as THREE.MeshBasicMaterial).opacity = (left < 2500 ? 0.25 + 0.35 * Math.abs(Math.sin(t * 12)) : 0.55);
      }
    }
  });
  const arcs = (color: string, opacity: number) => [0, 1, 2, 3].map((i) => (
    <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.82, 1, 18, 1, i * Math.PI / 2 + 0.22, Math.PI / 2 - 0.44]} /><meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh>
  ));
  const ticks = (color: string) => [0, 1, 2, 3].map((i) => (
    <mesh key={'t' + i} rotation={[-Math.PI / 2, 0, i * Math.PI / 2]} position={[Math.sin(i * Math.PI / 2) * 1.12, 0, Math.cos(i * Math.PI / 2) * 1.12]}>
      <circleGeometry args={[0.13, 3, Math.PI / 2]} /><meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  ));
  return (
    <>
      <group ref={hoverG} visible={false}>
        {arcs('#ffd77a', 0.85)}
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.3, 0.38, 32]} /><meshBasicMaterial color="#fff2c4" transparent opacity={0.7} depthWrite={false} toneMapped={false} /></mesh>
      </group>
      <group ref={focusG} visible={false}>
        {arcs('#ff5a5a', 0.9)}
        {ticks('#ffb04a')}
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.25, 0.32, 32]} /><meshBasicMaterial color="#ff8a6a" transparent opacity={0.75} depthWrite={false} toneMapped={false} /></mesh>
      </group>
      <mesh ref={guard} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.62, 0.78, 48]} /><meshBasicMaterial color="#ffd98a" transparent opacity={0.5} depthWrite={false} toneMapped={false} /></mesh>
    </>
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

/** Lança uma habilidade no mundo: aviso no chão, efeito do formato e do estilo, e o dano nos alvos dentro da área. */
function runSkill(ev: Extract<FxEvent, { kind: 'skill' }>, world: WorldShape, pop: (p: THREE.Vector3, t: string, g: boolean | 'heal' | 'hurt' | 'drop' | 'poison' | 'burn') => void) {
  const s = ev.skill, st = s.vfx.style, col = ev.color, yaw = ev.yaw, V = gameVfx;
  const fw = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const gy = (x: number, z: number) => world.heightAt(x, z);
  const feet = ev.pos.clone().setY(gy(ev.pos.x, ev.pos.z)), chest = feet.clone().add(new THREE.Vector3(0, 0.6, 0));
  const tp = ev.target.clone().setY(gy(ev.target.x, ev.target.z));
  const at = (t: Target) => new THREE.Vector3(t.x, gy(t.x, t.z) + 0.7, t.z);
  const inShape = (t: Target) => {
    const dx = t.x - feet.x, dz = t.z - feet.z, f = dx * fw.x + dz * fw.z, l = Math.abs(dx * fw.z - dz * fw.x), dist = Math.hypot(dx, dz);
    const ang = (Math.atan2(l, f) * 180) / Math.PI;
    switch (s.shape) {
      case 'melee': return dist <= s.range + t.r && ang <= 70;
      case 'cone': return dist <= s.range + t.r && ang <= s.angle / 2 + 8;
      case 'line': case 'dash': return f >= 0 && f <= s.range + t.r && l <= s.radius + t.r;
      case 'circle': case 'leap': return Math.hypot(t.x - tp.x, t.z - tp.z) <= s.radius + t.r;
      case 'aura': return dist <= s.radius + t.r;
      case 'projectile': return false;
    }
  };
  const strike = (list: Target[], delay: number) => V.after(delay, () => {
    const dot = s.status && (s.status.key === 'envenenado' || s.status.key === 'queimando') ? s.status : null;
    for (const t of list) { if (dot && Math.random() < dot.chance) t.afflict?.(dot.key, dot.seconds, Math.max(2, Math.round(ev.damage * 0.15))); if (ev.damage > 0) { markCombat(); const d = t.hit(ev.damage, ev.info); pop(at(t).setY(at(t).y + 0.4), String(typeof d === 'number' ? d : ev.damage), false); } burst(V, st, at(t), col, 0.5, gy(t.x, t.z)); }
  });
  const inside = () => { const l: Target[] = []; targets.forEach((t) => { if (inShape(t)) l.push(t); }); return l; };
  // aviso: onde vai cair (área, salto, aura)
  if (s.windup > 0.05 && (s.shape === 'circle' || s.shape === 'leap' || s.shape === 'aura')) {
    const c = s.shape === 'aura' ? feet : tp;
    V.emit({ k: K.RING, flat: true, pos: { x: c.x, y: c.y + 0.05, z: c.z }, life: s.windup, size: s.radius * 2.1, c1: '#c9b8ff', alpha: 0.7 });
    V.emit({ k: K.RING, flat: true, pos: { x: c.x, y: c.y + 0.06, z: c.z }, life: s.windup, size: 0.2, size1: s.radius * 2.1, c1: '#c9b8ff', alpha: 0.5 });
  }
  V.after(s.windup, () => {
    switch (s.shape) {
      case 'melee': slash(V, chest, yaw, s.range, col, s.power >= 40); strike(inside(), 0.07); break;
      case 'cone': cone(V, st, chest.clone().addScaledVector(fw, 0.3), yaw, s.angle, s.range, col); strike(inside(), 0.2); break;
      case 'line': beam(V, st, chest, chest.clone().addScaledVector(fw, s.range), s.radius, col); strike(inside(), 0.05); break;
      case 'dash': missile(V, { style: st, color: col, from: chest, to: chest.clone().addScaledVector(fw, s.range), duration: 0.3, size: 0.6 }); strike(inside(), 0.2); break;
      case 'projectile': {
        let best: Target | null = null, bf = s.range + 0.5;
        targets.forEach((t) => { const dx = t.x - feet.x, dz = t.z - feet.z, f = dx * fw.x + dz * fw.z, l = Math.abs(dx * fw.z - dz * fw.x); if (f > 0 && f < bf && l <= s.radius + t.r + 0.2) { bf = f; best = t; } });
        const hit = best as Target | null, to = hit ? at(hit) : chest.clone().addScaledVector(fw, s.range);
        missile(V, { style: st, color: col, from: chest.clone().addScaledVector(fw, 0.4), to, duration: Math.max(0.15, chest.distanceTo(to) / 14), arc: 0.3, size: Math.max(0.55, s.radius * 1.3), onArrive: (p) => {
          burst(V, st, p, col, 0.85, gy(p.x, p.z));
          if (hit && s.status && (s.status.key === 'envenenado' || s.status.key === 'queimando') && Math.random() < s.status.chance) hit.afflict?.(s.status.key, s.status.seconds, Math.max(2, Math.round(ev.damage * 0.15)));
          if (hit && ev.damage > 0) { markCombat(); const d = hit.hit(ev.damage, ev.info); pop(p.clone().setY(p.y + 0.4), String(typeof d === 'number' ? d : ev.damage), false); }
        } });
        break;
      }
      case 'circle': {
        const land = () => { area(V, st, tp, s.radius, col, tp.y); strike(inside(), 0); };
        if (['chamas', 'pedras', 'raios', 'gelo', 'gotas'].includes(st)) missile(V, { style: st, color: col, from: tp.clone().add(new THREE.Vector3(-1.2, 6, -0.8)), to: tp.clone().setY(tp.y + 0.3), duration: 0.3, size: 0.8, onArrive: land });
        else land();
        break;
      }
      case 'leap': V.after(0.4, () => { area(V, st, tp, s.radius, col, tp.y); strike(inside(), 0); }); break;
      case 'aura': aura(V, st, feet, s.radius, col, feet.y); strike(inside(), 0.1); break;
    }
    // cura: soma no HP do Companion (antes só mostrava o número verde)
    if (ev.heal > 0) V.after(0.15, () => { healCompanion(ev.heal); pop(chest.clone().setY(chest.y + 0.7), '+' + ev.heal, 'heal'); });
  });
}

const devLog: { kind: string; yaw: number; x: number; z: number; t: number }[] = [];
// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __combat: unknown }).__combat = { combatInput, chargeState, targets, fxQueue, vfx: gameVfx, skillInput, requestSkill, aim, devLog, hurt: hurtCompanion, vitals, attackPick };
