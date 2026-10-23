/**
 * Relevo da clareira do Refúgio, gerado por seed (determinístico: mesma seed, mesma clareira).
 * Portado do lab "Clareira do Refúgio". O centro é plano para o altar e as peças que surgem com o Companion.
 */
import * as THREE from 'three';

export function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

export const CLEAR_R = 9.5;   // raio andável
export const RIM_R = 11;      // onde começam as pedras

export interface WorldShape { seed: number; gap: number; open: boolean; heightAt: (x: number, z: number) => number; dirtAt: (x: number, z: number) => number; noise: (x: number, z: number) => number }

/** `open`: a passagem na muralha (a "janela para o mundo") só abre depois do primeiro sonho. */
export function makeWorld(seed: number, open: boolean): WorldShape {
  const S = seed | 0;
  const hash2 = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(S, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi; xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  const fbm = (x: number, y: number) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { v += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; } return v / 0.9375; };
  const gap = mulberry32(S)() * Math.PI * 2;
  const heightAt = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const base = (fbm(x * 0.15, z * 0.15) - 0.5) * 0.5 * smooth(5, 9, r); // centro plano
    let rim = smooth(RIM_R - 0.6, RIM_R + 3.5, r);
    if (open) rim *= 1 - 0.9 * Math.exp(-Math.pow(angDiff(Math.atan2(z, x), gap) / 0.26, 2));
    return base + rim * (3.0 + (fbm(x * 0.22 + 7, z * 0.22) - 0.5) * 1.6);
  };
  const dirtAt = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r > 13) return 0;
    const patch = smooth(0.72, 0.8, fbm(x * 0.09 + 3, z * 0.09 - 5)) * (1 - smooth(8, 10, r));
    let path = 0;
    if (open) {
      const gx = Math.cos(gap), gz = Math.sin(gap), along = x * gx + z * gz, perp = Math.abs(-x * gz + z * gx);
      const wob = (noise(along * 0.3, 9) - 0.5) * 1.2;
      path = along > 2.4 ? 1 - smooth(0.7, 1.3, Math.abs(perp - wob)) : 0;
    }
    return Math.max(patch, path);
  };
  return { seed: S, gap, open, heightAt, dirtAt, noise: fbm };
}

export function stableSeed(text: string) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Vento no vertex shader: base presa, topo solto. Funciona com malha instanciada (fase por cópia). */
export const windTime = { value: 0 };
export function withWind<T extends THREE.Material>(m: T, opts: { height: number; strength?: number; amp?: number }): T {
  const u = { uWind: { value: opts.strength ?? 1 }, uHeight: { value: Math.max(0.05, opts.height) }, uAmp: { value: opts.amp ?? Math.pow(Math.max(0.05, opts.height), 0.6) } };
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = windTime; Object.assign(s.uniforms, u);
    s.vertexShader = 'uniform float uTime; uniform float uWind; uniform float uHeight; uniform float uAmp;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float hN = clamp(transformed.y / uHeight, 0.0, 1.0);
      #ifdef USE_INSTANCING
        mat3 wm = mat3(modelMatrix * instanceMatrix);
        float ph = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.23;
      #else
        mat3 wm = mat3(modelMatrix);
        float ph = modelMatrix[3][0] * 0.31 + modelMatrix[3][2] * 0.23;
      #endif
        float sw = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.3 + ph * 2.9) * 0.25;
        transformed += inverse(wm) * (vec3(0.16, 0.0, 0.07) * sw * hN * hN * uWind * uAmp);
      }`);
  };
  m.customProgramCacheKey = () => 'wind';
  return m;
}

/** Onde está o Companion (a câmera segue). Quem anda escreve aqui; sem corpo, fica no altar. */
export const companionFocus = new THREE.Vector3();
/** Para onde o Companion olha e se está caído (a presença manda isso para os outros jogadores). */
export const companionPose = { yaw: 0, down: false };

/** Pedido de "anda até aqui" (clique/toque no chão). O id muda a cada clique. */
export const moveRequest = { id: 0, point: new THREE.Vector3() };
/**
 * Clique/toque no chão para andar, com troca de destino no meio do caminho:
 * - clique curto (sem arrastar): anda até o ponto; um clique novo antes de chegar troca o destino na hora;
 * - segurar (sem arrastar) por ~0,3 s: o Companion segue o cursor/dedo até soltar;
 * - arrastar de lado continua girando a câmera (aí não anda).
 * Os handlers ficam no chão (onPointerDown/onPointerMove do R3F) e o soltar é ouvido na janela, então o clique vale
 * mesmo que o pedaço de chão embaixo do cursor mude enquanto a câmera segue o Companion.
 */
export const groundPointer = { down: null as null | { x: number; y: number; id: number; at: THREE.Vector3; timer: number; attack?: string }, hold: false, point: new THREE.Vector3(), last: 0 };
/**
 * Clique no monstro = ataque básico: o Companion vai até ele e golpeia até ele cair (ou até a pessoa mandar andar).
 * `pick` (preenchido pela cena de combate) diz qual alvo está sob o cursor/dedo; `hover` é o alvo sob o mouse agora
 * (cursor de ataque e mira no chão); `focus` é o alvo travado.
 */
export const attackPick = { pick: null as null | ((clientX: number, clientY: number) => string | null), hover: null as string | null, focus: null as string | null };
export const attackRequest = { id: 0, key: '' };
export function requestAttackOn(key: string) { attackRequest.key = key; attackRequest.id++; attackPick.focus = key; }
const DRAG_PX = 8, HOLD_MS = 300;
export function requestMove(p: THREE.Vector3) { moveRequest.point.set(p.x, 0, p.z); moveRequest.id++; attackPick.focus = null; }
function endGround(e: PointerEvent) {
  const d = groundPointer.down;
  if (!d || e.pointerId !== d.id) return;
  clearTimeout(d.timer);
  if (!groundPointer.hold && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= DRAG_PX) { if (d.attack) requestAttackOn(d.attack); else requestMove(d.at); }
  groundPointer.down = null; groundPointer.hold = false;
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerup', endGround);
  window.addEventListener('pointercancel', (e) => { if (groundPointer.down?.id === e.pointerId) { clearTimeout(groundPointer.down.timer); groundPointer.down = null; groundPointer.hold = false; } });
  window.addEventListener('pointermove', (e) => {
    const d = groundPointer.down;
    if (d && !groundPointer.hold && e.pointerId === d.id && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) { clearTimeout(d.timer); groundPointer.down = null; } // virou arrasto de câmera
  }, { passive: true });
}
/** Botão que anda: o esquerdo (padrão) ou o direito quando o esquerdo ataca (Ajustes). */
export function groundDown(e: { point: THREE.Vector3; nativeEvent: PointerEvent }, walkButton: number) {
  const ne = e.nativeEvent;
  if (ne.button !== walkButton || groundPointer.down) return;
  const at = e.point.clone();
  groundPointer.point.copy(at);
  // em cima de um monstro (com o botão que anda): vira ordem de ataque, não de andar
  const attack = walkButton === 0 ? attackPick.pick?.(ne.clientX, ne.clientY) ?? undefined : undefined;
  const timer = attack ? 0 : window.setTimeout(() => { if (groundPointer.down?.id === ne.pointerId) { groundPointer.hold = true; requestMove(groundPointer.point); } }, HOLD_MS);
  groundPointer.down = { x: ne.clientX, y: ne.clientY, id: ne.pointerId, at, timer, attack };
}
export function groundMove(e: { point: THREE.Vector3 }) {
  groundPointer.point.copy(e.point);
  const now = performance.now();
  if (groundPointer.hold && now - groundPointer.last > 90) { groundPointer.last = now; requestMove(e.point); }
}

/** Teletransporte (testes no dev e, no futuro, viagem rápida). O id muda a cada pedido. */
export const teleport = { id: 0, point: new THREE.Vector3() };

/**
 * Colisão simples no chão (círculos): cada camada do cenário registra os seus obstáculos.
 * O Companion é um círculo de raio BODY_R que desliza em volta deles. Coisas baixas (grama, plantas, objetos
 * com menos de ~45 cm) não entram aqui: dá para passar por cima. Plataformas (o altar) levantam o Companion.
 */
export interface Circle { x: number; z: number; r: number }
export const colliders = new Map<string, Circle[]>();
export const platforms: { x: number; z: number; r: number; top: number }[] = [{ x: 0, z: 0, r: 2.0, top: 0.19 }];
export const BODY_R = 0.32;

/** Empurra (x, z) para fora dos obstáculos; devolve true se encostou em algum. `body`: raio de quem anda. */
export function resolveCollisions(p: { x: number; z: number }, body = BODY_R): boolean {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    colliders.forEach((list) => {
      for (const c of list) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + body;
        if (d >= min) continue;
        hit = true;
        if (d < 1e-4) { p.x += min; continue; }
        p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min;
      }
    });
  }
  return hit;
}

/** Altura extra de plataformas em que dá para subir (o altar). */
export function platformHeight(x: number, z: number): number {
  let h = 0;
  for (const pl of platforms) if (Math.hypot(x - pl.x, z - pl.z) < pl.r) h = Math.max(h, pl.top);
  return h;
}

// testes no navegador (só no dev): window.__cc.go(x, z) manda o Companion andar até um ponto
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cc: unknown }).__cc = { go: (x: number, z: number) => { moveRequest.point.set(x, 0, z); moveRequest.id++; }, tp: (x: number, z: number) => { teleport.point.set(x, 0, z); teleport.id++; }, focus: companionFocus, colliders };
}
