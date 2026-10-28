/**
 * Motor de efeitos (VFX) estilizados: em vez de bolinhas de textura, cada partícula é um quadrado desenhado por shader
 * com uma forma de desenho animado — fumaça em camadas que se desfaz pelas bordas, brilho com núcleo branco, faísca
 * esticada pela velocidade, estrela, onda de choque, explosão estrelada, cristal, folha, gota e orbe de energia.
 * Rastros e raios são fitas (tiras viradas para a câmera) com núcleo branco e borda colorida.
 *
 * Cada cena tem a sua `VfxStore` (o jogo usa `gameVfx`; a prévia da Forja cria a dela) e um `<VfxLayer>` que desenha.
 * As receitas (explosão, rastro, área, cone, golpe…) ficam em recipes.ts.
 */
import * as THREE from 'three';

export const K = { GLOW: 0, PUFF: 1, STREAK: 2, STAR: 3, RING: 4, BURST: 5, SHARD: 6, LEAF: 7, DROP: 8, ORB: 9 } as const;
const ADDITIVE = new Set<number>([K.GLOW, K.RING]);

type V3 = { x: number; y: number; z: number };
export type Col = THREE.ColorRepresentation;

export interface PSpec {
  k: number;
  pos: V3;
  vel?: V3;
  life: number;
  delay?: number;
  /** diâmetro inicial e final (cresce com ease-out) */
  size: number;
  size1?: number;
  rot?: number;
  spin?: number;
  c1: Col;
  c2?: Col;
  alpha?: number;
  /** gravidade (negativa sobe) e arrasto */
  g?: number;
  drag?: number;
  /** deitada no chão (ondas de choque) */
  flat?: boolean;
  /** estica na direção da velocidade (faíscas, gotas) */
  stretch?: number;
  /** quica neste y */
  floor?: number;
  add?: boolean;
}

export interface Particle {
  k: number; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; delay: number; s0: number; s1: number; rot: number; spin: number;
  c1: THREE.Color; c2: THREE.Color; a: number; g: number; drag: number; flat: boolean; stretch: number;
  floor: number; add: boolean; seed: number; size: number; alphaNow: number; fadeStart: number;
}

/** Fita: rastro de projétil, feixe, raio, corte de lâmina. Pontos da cauda (0) para a cabeça (fim). */
export interface Line {
  pts: THREE.Vector3[];
  w: number;
  color: THREE.Color;
  /** 0 rastro de energia (ondulado) · 1 raio · 2 corte */
  mode: number;
  age: number;
  life: number;
  max: number;
  released: boolean;
  fade: number;
  relAge: number;
  profile: (u: number) => number;
  alphaAt: (u: number, l: Line) => number;
  done: boolean;
}

const tmpC = new THREE.Color();
function col(c: Col | undefined, fallback: THREE.Color): THREE.Color {
  return c === undefined ? fallback.clone() : c instanceof THREE.Color ? c.clone() : tmpC.set(c).clone();
}

export interface Crystal { at: THREE.Vector3; color: THREE.Color; size: number; life: number; age: number; yaw: number }
export class VfxStore {
  crystals: Crystal[] = [];
  crystal(at: THREE.Vector3, color: Col, size: number, life: number, yaw: number) {
    if (this.crystals.length >= 192) this.crystals.shift();
    this.crystals.push({ at: at.clone(), color: new THREE.Color(color), size, life, age: 0, yaw });
  }
  parts: Particle[] = [];
  lines: Line[] = [];
  time = 0;
  private timers: { t: number; fn: () => void }[] = [];
  private tickers: ((dt: number) => boolean)[] = [];
  static CAP = 1800;

  emit(s: PSpec): Particle {
    const c1 = col(s.c1, new THREE.Color('#ffffff'));
    const k = s.k, add = s.add ?? ADDITIVE.has(k);
    const p: Particle = {
      k, x: s.pos.x, y: s.pos.y, z: s.pos.z, vx: s.vel?.x ?? 0, vy: s.vel?.y ?? 0, vz: s.vel?.z ?? 0,
      age: 0, life: s.life, delay: s.delay ?? 0, s0: s.size, s1: s.size1 ?? s.size, rot: s.rot ?? Math.random() * 6.28, spin: s.spin ?? 0,
      c1, c2: col(s.c2, c1.clone().multiplyScalar(0.55)), a: s.alpha ?? 1, g: s.g ?? 0, drag: s.drag ?? 0, flat: !!s.flat,
      stretch: s.stretch ?? 0, floor: s.floor ?? -1e9, add, seed: Math.random(), size: s.size, alphaNow: 0,
      fadeStart: k === K.PUFF || k === K.BURST ? 0.88 : add ? 0.5 : 0.7,
    };
    if (this.parts.length >= VfxStore.CAP) this.parts.shift();
    this.parts.push(p);
    return p;
  }

  line(o: { color: Col; w: number; mode?: number; life?: number; max?: number; pts?: THREE.Vector3[]; profile?: (u: number) => number; alphaAt?: (u: number, l: Line) => number; fade?: number }): Line {
    const l: Line = {
      pts: o.pts ?? [], w: o.w, color: col(o.color, new THREE.Color('#fff')), mode: o.mode ?? 0, age: 0, life: o.life ?? Infinity,
      max: o.max ?? 28, released: false, fade: o.fade ?? 0.25, relAge: 0, done: false,
      profile: o.profile ?? ((u) => Math.pow(u, 0.6)), alphaAt: o.alphaAt ?? ((u) => u),
    };
    this.lines.push(l);
    return l;
  }

  /** Acrescenta um ponto na cabeça do rastro (descarta a cauda além de `max`). */
  push(l: Line, p: V3) {
    const last = l.pts[l.pts.length - 1];
    if (last && (last.x - p.x) ** 2 + (last.y - p.y) ** 2 + (last.z - p.z) ** 2 < 0.0004) { last.set(p.x, p.y, p.z); return; }
    l.pts.push(new THREE.Vector3(p.x, p.y, p.z));
    while (l.pts.length > l.max) l.pts.shift();
  }

  release(l: Line) { l.released = true; }

  after(delay: number, fn: () => void) { this.timers.push({ t: delay, fn }); }
  /** Roda a cada quadro até devolver false. */
  every(fn: (dt: number) => boolean) { this.tickers.push(fn); }

  clear() { this.time = 0; this.crystals.length = 0; this.parts.length = 0; this.lines.length = 0; this.timers.length = 0; this.tickers.length = 0; }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      this.crystals[i].age += dt;
      if (this.crystals[i].age >= this.crystals[i].life) this.crystals.splice(i, 1);
    }
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    for (let i = this.tickers.length - 1; i >= 0; i--) if (!this.tickers[i](dt)) this.tickers.splice(i, 1);
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      if (p.delay > 0) { p.delay -= dt; p.alphaNow = 0; continue; }
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vy -= p.g * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
      p.rot += p.spin * dt;
      const e = 1 - (1 - Math.min(1, t)) ** 3;
      p.size = p.s0 + (p.s1 - p.s0) * e;
      const fin = Math.min(1, p.age / 0.035);
      const fout = t < p.fadeStart ? 1 : 1 - (t - p.fadeStart) / (1 - p.fadeStart);
      p.alphaNow = p.a * fin * fout;
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.age += dt;
      if (l.released) { l.relAge += dt; if (l.relAge > l.fade) l.done = true; else if (l.pts.length > 2 && Math.random() < 0.6) l.pts.shift(); }
      if (l.age > l.life) l.done = true;
      if (l.done) { this.lines[i] = this.lines[this.lines.length - 1]; this.lines.pop(); }
    }
  }
}

/** Alpha geral da fita agora (some ao ser solta ou no fim da vida). */
export function lineAlpha(l: Line): number {
  let a = 1;
  if (l.released) a *= 1 - l.relAge / l.fade;
  if (Number.isFinite(l.life)) a *= Math.min(1, (l.life - l.age) / Math.min(0.2, l.life * 0.5));
  return Math.max(0, a);
}

/** Efeitos do jogo (Refúgio e mundo). */
export const gameVfx = new VfxStore();
