/**
 * Receitas de efeito por estilo de habilidade (impacto, chamas, gotas, folhas, pedras, gelo, raios, vento, luz, sombra,
 * faíscas). Cada receita monta camadas: clarão, explosão estrelada, onda de choque (no ar e no chão), faíscas e os
 * detritos do estilo (fumaça de fogo, cristais, folhas, gotas, raios…), no visual cartoon das referências.
 */
import * as THREE from 'three';
import { K, type Col, type Line, type Particle, type VfxStore } from './engine';

type V3 = THREE.Vector3;
const R = Math.random;
const rr = (a: number, b: number) => a + R() * (b - a);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Direção aleatória com viés para cima (up 0..1). */
function rndDir(up = 0.4): V3 {
  const a = R() * Math.PI * 2, y = rr(-0.2, 1) * up + (1 - up) * rr(-0.6, 0.6);
  return v3(Math.cos(a), y, Math.sin(a)).normalize();
}

export interface Palette { main: THREE.Color; light: THREE.Color; dark: THREE.Color; flash: THREE.Color; puff1: THREE.Color; puff2: THREE.Color; spark: THREE.Color }

export function palette(style: string, color: Col): Palette {
  const main = new THREE.Color(color);
  const light = main.clone().offsetHSL(0, -0.05, 0.22), dark = main.clone().offsetHSL(0, 0.05, -0.22);
  const p: Palette = { main, light, dark, flash: main.clone().lerp(new THREE.Color('#fff6d0'), 0.55), puff1: light.clone(), puff2: main.clone(), spark: main.clone() };
  const set = (o: Partial<Record<keyof Palette, string>>) => { for (const [k, v] of Object.entries(o)) p[k as keyof Palette] = new THREE.Color(v); };
  switch (style) {
    case 'chamas': set({ flash: '#fff1a8', puff1: '#ffd65a', puff2: '#f0712c', spark: '#ffcf6a' }); break;
    case 'gelo': set({ flash: '#ffffff', puff1: '#f2fbff', puff2: '#a8d8f5', spark: '#e8f8ff' }); break;
    case 'pedras': set({ flash: '#fff0d6', puff1: '#efe2c8', puff2: '#bba486', spark: '#f5e6c8' }); break;
    case 'folhas': set({ puff1: '#d7f5a0', puff2: '#86c95a', spark: '#eaffb0' }); break;
    case 'gotas': set({ flash: '#ffffff', puff1: '#ffffff', puff2: '#bfe6fb', spark: '#e6f7ff' }); break;
    case 'vento': set({ flash: '#ffffff', puff1: '#ffffff', puff2: '#cfe3ef', spark: '#ffffff' }); break;
    case 'luz': set({ flash: '#fffbe6', puff1: '#fff8d8', spark: '#fff6c0' }); break;
    case 'sombra': p.puff2 = main.clone().offsetHSL(0, 0, -0.28); p.puff1 = main.clone(); p.flash = main.clone().lerp(new THREE.Color('#f0d8ff'), 0.6); break;
    case 'raios': set({ flash: '#ffffff', spark: '#ffffff' }); break;
  }
  return p;
}

const SMOKE1 = '#a89ba3', SMOKE2 = '#74677a';

/** Detritos característicos de cada estilo, saindo de `pos` (n peças, velocidade sp). */
function debris(s: VfxStore, style: string, P: Palette, pos: V3, n: number, sp: number, floor: number, scale = 1) {
  for (let i = 0; i < n; i++) {
    const d = rndDir(0.6), v = d.multiplyScalar(sp * rr(0.6, 1.2));
    switch (style) {
      case 'chamas':
        s.emit({ k: K.PUFF, pos, vel: v.multiplyScalar(0.7), g: -2.5, drag: 3, life: rr(0.45, 0.7), size: 0.45 * scale, size1: rr(0.9, 1.3) * scale, c1: P.puff1, c2: P.puff2 });
        if (i % 3 === 0) s.emit({ k: K.PUFF, pos, vel: v3(v.x * 0.4, rr(1, 2), v.z * 0.4), delay: 0.25, g: -1.2, drag: 2, life: rr(0.6, 0.85), size: 0.4 * scale, size1: 0.9 * scale, c1: SMOKE1, c2: SMOKE2, alpha: 0.85 });
        break;
      case 'gelo':
        s.emit({ k: K.SHARD, pos, vel: v, g: 9, drag: 1, floor, life: rr(0.6, 0.9), size: rr(0.22, 0.36) * scale, spin: rr(-8, 8), c1: '#f4fbff', c2: P.main });
        if (i % 2 === 0) s.emit({ k: K.PUFF, pos, vel: v.clone().multiplyScalar(0.35), drag: 3, g: -0.3, life: rr(0.5, 0.75), size: 0.4 * scale, size1: rr(0.8, 1.1) * scale, c1: P.puff1, c2: P.puff2 });
        if (i % 3 === 0) s.emit({ k: K.STAR, pos, vel: v.clone().multiplyScalar(0.5), drag: 3, life: rr(0.4, 0.7), size: 0.3 * scale, size1: 0.05, c1: '#dff4ff' });
        break;
      case 'pedras':
        s.emit({ k: K.SHARD, pos, vel: v.add(v3(0, 2, 0)), g: 14, floor, life: rr(0.7, 1), size: rr(0.2, 0.34) * scale, spin: rr(-10, 10), c1: '#a68a6c', c2: '#5e4a3a' });
        if (i % 2 === 0) s.emit({ k: K.PUFF, pos, vel: v.clone().multiplyScalar(0.4).setY(0.6), drag: 3, life: rr(0.6, 0.9), size: 0.4 * scale, size1: 1 * scale, c1: P.puff1, c2: P.puff2 });
        break;
      case 'folhas':
        if (i % 3 === 0) s.emit({ k: K.PUFF, pos, vel: v.clone().multiplyScalar(0.3), drag: 3, life: 0.5, size: 0.35 * scale, size1: 0.8 * scale, c1: P.puff1, c2: P.puff2 });
        s.emit({ k: K.LEAF, pos, vel: v, g: 1.2, drag: 2.2, floor, life: rr(0.8, 1.2), size: rr(0.3, 0.42) * scale, spin: rr(-9, 9), c1: '#9be06a', c2: '#3f8a34' });
        break;
      case 'gotas':
        s.emit({ k: K.DROP, pos, vel: v.add(v3(0, 2.5, 0)), g: 14, floor, life: rr(0.45, 0.7), size: rr(0.14, 0.22) * scale, stretch: 0.06, c1: '#eaf8ff', c2: P.main });
        if (i % 3 === 0) s.emit({ k: K.PUFF, pos, vel: v.clone().multiplyScalar(0.3), drag: 3, life: 0.5, size: 0.35 * scale, size1: 0.7 * scale, c1: P.puff1, c2: P.puff2 });
        break;
      case 'raios':
        s.emit({ k: K.STREAK, pos, vel: v.clone().multiplyScalar(1.6), drag: 3, life: rr(0.15, 0.3), size: 0.09 * scale, stretch: 0.12, c1: P.main });
        if (i % 2 === 0) s.emit({ k: K.PUFF, pos, vel: v.multiplyScalar(0.35), drag: 3, life: rr(0.35, 0.5), size: 0.35 * scale, size1: 0.8 * scale, c1: '#fffbe0', c2: P.main });
        if (i % 3 === 0) bolt(s, pos.clone(), pos.clone().add(rndDir(0.2).multiplyScalar(rr(0.6, 1.1) * scale)), P.light, 0.1 * scale, 0.2);
        break;
      case 'faiscas':
        s.emit({ k: K.STREAK, pos, vel: v.multiplyScalar(1.4), g: 9, drag: 1.5, floor, life: rr(0.3, 0.55), size: 0.06 * scale, stretch: 0.1, c1: P.spark });
        if (i % 2 === 0) s.emit({ k: K.STAR, pos, vel: v.clone().multiplyScalar(0.3), drag: 2, life: rr(0.3, 0.5), size: 0.35 * scale, size1: 0.05, spin: 4, c1: P.main });
        if (i % 3 === 0) s.emit({ k: K.PUFF, pos, vel: v.clone().multiplyScalar(0.25), drag: 3, life: 0.45, size: 0.3 * scale, size1: 0.7 * scale, c1: P.light, c2: P.main });
        break;
      case 'luz':
        s.emit({ k: K.STAR, pos, vel: v.multiplyScalar(0.8), drag: 2.5, g: -0.6, life: rr(0.5, 0.8), size: rr(0.3, 0.45) * scale, size1: 0.05, spin: rr(-3, 3), c1: P.light });
        if (i % 2 === 0) s.emit({ k: K.PUFF, pos, vel: v.clone().multiplyScalar(0.4), drag: 3, g: -0.8, life: rr(0.5, 0.7), size: 0.4 * scale, size1: 0.9 * scale, c1: P.puff1, c2: P.puff2 });
        break;
      default: // impacto, vento, sombra: fumaça cartoon na cor
        s.emit({ k: K.PUFF, pos, vel: v.multiplyScalar(0.7), drag: 3, g: style === 'sombra' ? -1 : -0.4, life: rr(0.5, 0.8), size: 0.45 * scale, size1: rr(0.9, 1.2) * scale, c1: P.puff1, c2: P.puff2 });
    }
  }
}

/** Explosão/acerto: clarão, estrela, onda de choque no ar e no chão, faíscas e detritos do estilo. */
export function burst(s: VfxStore, style: string, pos: V3, color: Col, scale = 1, ground?: number) {
  const P = palette(style, color);
  const floor = ground ?? pos.y - 0.6;
  s.emit({ k: K.GLOW, pos, life: 0.16, size: 0.9 * scale, size1: 1.6 * scale, c1: P.flash, alpha: 0.45 });
  s.emit({ k: K.BURST, pos, life: 0.34, size: 0.5 * scale, size1: 1.9 * scale, c1: P.flash, c2: P.main });
  s.emit({ k: K.RING, pos, life: 0.3, size: 0.4 * scale, size1: 1.9 * scale, c1: P.light, alpha: 0.8 });
  if (ground !== undefined) s.emit({ k: K.RING, flat: true, pos: v3(pos.x, ground + 0.04, pos.z), life: 0.5, size: 0.5 * scale, size1: 3.4 * scale, c1: P.main, alpha: 0.85 });
  for (let i = 0; i < Math.round(10 * scale) + 4; i++) {
    const d = rndDir(0.5);
    s.emit({ k: K.STREAK, pos, vel: d.multiplyScalar(rr(4, 8) * scale), g: 8, drag: 2.5, floor, life: rr(0.22, 0.42), size: 0.08 * Math.sqrt(scale), stretch: 0.08, c1: P.spark });
  }
  if (style === 'raios') for (let i = 0; i < 4; i++) bolt(s, pos, pos.clone().add(rndDir(0.3).multiplyScalar(rr(0.8, 1.5) * scale)), P.light, 0.12 * scale, 0.25);
  debris(s, style, P, pos, Math.round(7 * scale) + 3, 3.2 * scale, floor, scale);
}

/** Raio recortado de a até b; tremula enquanto vive. */
export function bolt(s: VfxStore, a: V3, b: V3, color: Col, w: number, life: number): Line {
  const N = 12, l = s.line({ color, w, mode: 1, life, profile: (u) => 0.5 + 0.5 * Math.sin(u * Math.PI), alphaAt: () => 1 });
  const dir = b.clone().sub(a), len = dir.length(), side = new THREE.Vector3();
  const regen = () => {
    l.pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = a.clone().addScaledVector(dir, u);
      if (i > 0 && i < N) { side.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(len * 0.22 * Math.sin(u * Math.PI)); p.add(side); }
      l.pts.push(p);
    }
  };
  regen();
  let acc = 0;
  s.every((dt) => { acc += dt; if (acc > 0.05) { acc = 0; regen(); } return !l.done; });
  s.emit({ k: K.GLOW, pos: b, life, size: Math.min(1.2, w * 4), c1: color, alpha: 0.45 });
  return l;
}

/** Projétil: orbe com núcleo branco, auréola, rastro de energia e partículas do estilo pelo caminho. */
export class Missile {
  trail: Line; head: Particle; halo: Particle; P: Palette; acc = 0; last = new THREE.Vector3(); started = false;
  constructor(public s: VfxStore, public style: string, color: Col, public size = 0.6) {
    this.P = palette(style, color);
    this.trail = s.line({ color: this.P.main, w: size * 0.75, max: 22, mode: 0, profile: (u) => Math.pow(u, 0.8), alphaAt: (u) => Math.pow(u, 0.7) });
    this.head = s.emit({ k: K.ORB, pos: v3(0, -99, 0), life: 1e9, size, c1: this.P.main });
    this.halo = s.emit({ k: K.GLOW, pos: v3(0, -99, 0), life: 1e9, size: size * 2.2, c1: this.P.main, alpha: 0.4 });
  }
  update(pos: V3, dt: number) {
    const s = this.s, P = this.P, z = this.size;
    if (!this.started) { this.last.copy(pos); this.started = true; }
    const vel = pos.clone().sub(this.last).divideScalar(Math.max(dt, 1e-3));
    this.last.copy(pos);
    for (const p of [this.head, this.halo]) { p.x = pos.x; p.y = pos.y; p.z = pos.z; }
    this.halo.size = z * (2.1 + Math.sin(s.time * 30) * 0.2);
    s.push(this.trail, pos);
    this.acc += dt * 45;
    const back = vel.clone().multiplyScalar(-0.08);
    while (this.acc >= 1) {
      this.acc -= 1;
      const at = pos.clone().add(v3(rr(-0.08, 0.08), rr(-0.08, 0.08), rr(-0.08, 0.08)).multiplyScalar(z * 2));
      switch (this.style) {
        case 'chamas':
          s.emit({ k: K.PUFF, pos: at, vel: back.clone().add(v3(0, 0.6, 0)), drag: 3, g: -1.5, life: rr(0.3, 0.45), size: z * 0.9, size1: z * 0.5, c1: P.puff1, c2: P.puff2 });
          if (R() < 0.12) s.emit({ k: K.PUFF, pos: at, vel: v3(0, 0.8, 0), delay: 0.15, g: -1, life: 0.55, size: z * 0.45, size1: z * 0.8, c1: SMOKE1, c2: SMOKE2, alpha: 0.8 });
          break;
        case 'gelo':
          if (R() < 0.5) s.emit({ k: K.STAR, pos: at, vel: back, drag: 4, life: 0.4, size: z * 0.6, size1: 0.02, spin: 5, c1: '#e8f8ff' });
          else s.emit({ k: K.SHARD, pos: at, vel: back.clone().add(rndDir(0.2).multiplyScalar(0.5)), drag: 3, g: 2, life: 0.4, size: z * 0.35, spin: rr(-6, 6), c1: '#f4fbff', c2: P.main });
          break;
        case 'folhas':
          if (R() < 0.5) s.emit({ k: K.LEAF, pos: at, vel: back.clone().add(rndDir(0.3)), drag: 2, g: 1, life: 0.7, size: z * 0.45, spin: rr(-8, 8), c1: '#9be06a', c2: '#3f8a34' });
          else s.emit({ k: K.PUFF, pos: at, vel: back, drag: 3, life: 0.35, size: z * 0.7, size1: z * 0.35, c1: P.puff1, c2: P.puff2 });
          break;
        case 'gotas':
          if (R() < 0.4) s.emit({ k: K.DROP, pos: at, vel: back.clone().add(v3(0, 1, 0)), g: 9, life: 0.4, size: z * 0.3, stretch: 0.06, c1: '#eaf8ff', c2: P.main });
          else s.emit({ k: K.PUFF, pos: at, vel: back, drag: 3, life: 0.35, size: z * 0.75, size1: z * 0.35, c1: P.puff1, c2: P.puff2 });
          break;
        case 'pedras':
          s.emit({ k: K.PUFF, pos: at, vel: back.clone().add(v3(0, 0.3, 0)), drag: 3, life: 0.5, size: z * 0.8, size1: z * 0.5, c1: P.puff1, c2: P.puff2 });
          break;
        case 'raios':
          s.emit({ k: K.STREAK, pos: at, vel: rndDir(0).multiplyScalar(rr(2, 4)), drag: 4, life: 0.15, size: z * 0.12, stretch: 0.12, c1: P.light });
          if (R() < 0.08) bolt(s, pos.clone(), pos.clone().add(rndDir(0).multiplyScalar(z * 1.6)), P.light, z * 0.15, 0.12);
          break;
        case 'faiscas':
          s.emit({ k: K.STREAK, pos: at, vel: back.clone().add(rndDir(0.4).multiplyScalar(2)), g: 8, drag: 1, life: 0.35, size: z * 0.1, stretch: 0.1, c1: P.spark });
          break;
        case 'luz':
          if (R() < 0.35) s.emit({ k: K.STAR, pos: at, vel: back, drag: 3, life: 0.45, size: z * 0.7, size1: 0.02, spin: 4, c1: P.light });
          else s.emit({ k: K.PUFF, pos: at, vel: back, drag: 3, life: 0.4, size: z * 0.8, size1: z * 0.4, c1: P.puff1, c2: P.puff2 });
          break;
        default: // impacto, vento, sombra: trilha de fumaça cartoon
          s.emit({ k: K.PUFF, pos: at, vel: back, drag: 3, g: this.style === 'sombra' ? -0.6 : 0, life: rr(0.35, 0.5), size: z * 0.95, size1: z * 0.45, c1: P.puff1, c2: P.puff2 });
      }
    }
  }
  end() {
    this.head.life = this.head.age + 0.05; this.halo.life = this.halo.age + 0.08;
    this.s.release(this.trail);
  }
}

/** Projétil automático de `from` até `to` (com arco), chama `onArrive` na chegada. */
export function missile(s: VfxStore, o: { style: string; color: Col; from: V3; to: V3; duration: number; arc?: number; size?: number; onArrive?: (at: V3) => void }) {
  const m = new Missile(s, o.style, o.color, o.size ?? 0.6);
  let t = 0;
  const at = new THREE.Vector3();
  s.every((dt) => {
    t += dt;
    const u = Math.min(1, t / o.duration);
    at.lerpVectors(o.from, o.to, u); at.y += Math.sin(u * Math.PI) * (o.arc ?? 0);
    m.update(at, dt);
    if (u >= 1) { m.end(); o.onArrive?.(at.clone()); return false; }
    return true;
  });
  return m;
}

/** Área no chão: onda de choque do tamanho do raio, explosão no centro e anel de detritos na borda. */
export function area(s: VfxStore, style: string, center: V3, radius: number, color: Col, ground: number) {
  const P = palette(style, color);
  const c = v3(center.x, ground + 0.5, center.z);
  burst(s, style, c, color, 0.7 + radius * 0.3, ground);
  s.emit({ k: K.RING, flat: true, pos: v3(center.x, ground + 0.05, center.z), life: 0.6, size: 0.4, size1: radius * 2.3, c1: P.light });
  s.emit({ k: K.RING, flat: true, pos: v3(center.x, ground + 0.06, center.z), delay: 0.1, life: 0.55, size: 0.3, size1: radius * 1.7, c1: P.main, alpha: 0.7 });
  const n = Math.round(8 + radius * 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr(-0.2, 0.2), p = v3(center.x + Math.cos(a) * radius * 0.85, ground + 0.25, center.z + Math.sin(a) * radius * 0.85);
    debris(s, style, P, p, 1, 1.6, ground, 0.8);
  }
  if (style === 'gelo') for (let i = 0; i < 7; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * radius * 0.8;
    s.emit({ k: K.SHARD, pos: v3(center.x + Math.cos(a) * d, ground + 0.2, center.z + Math.sin(a) * d), vel: v3(0, rr(3, 5), 0), g: 12, floor: ground + 0.2, life: 0.8, size: rr(0.4, 0.7), rot: rr(-0.3, 0.3), c1: '#f4fbff', c2: P.main });
  }
}

/** Sopro em cone (fogo, gelo, vento…). Dura ~0.3 s. */
export function cone(s: VfxStore, style: string, origin: V3, yaw: number, angleDeg: number, range: number, color: Col) {
  const P = palette(style, color);
  let t = 0, acc = 0;
  const half = (angleDeg * Math.PI) / 360;
  s.every((dt) => {
    t += dt; acc += dt * 110;
    while (acc >= 1) {
      acc -= 1;
      const a = yaw + rr(-half, half), dir = v3(Math.sin(a), rr(-0.05, 0.15), Math.cos(a)), sp = range * rr(1.8, 2.4);
      const at = origin.clone().addScaledVector(dir, 0.3);
      if (style === 'raios') { if (R() < 0.12) bolt(s, origin.clone(), origin.clone().addScaledVector(dir, range * rr(0.6, 1)), P.light, 0.12, 0.18); s.emit({ k: K.STREAK, pos: at, vel: dir.clone().multiplyScalar(sp), drag: 2, life: 0.35, size: 0.08, stretch: 0.06, c1: P.light }); continue; }
      if (R() < 0.3) s.emit({ k: K.STREAK, pos: at, vel: dir.clone().multiplyScalar(sp * 1.1), drag: 2, life: 0.4, size: 0.08, stretch: 0.06, c1: P.spark });
      if (style === 'gelo' && R() < 0.4) { s.emit({ k: K.SHARD, pos: at, vel: dir.clone().multiplyScalar(sp), drag: 2, life: 0.5, size: rr(0.15, 0.28), spin: rr(-8, 8), c1: '#f4fbff', c2: P.main }); continue; }
      if (style === 'folhas' && R() < 0.5) { s.emit({ k: K.LEAF, pos: at, vel: dir.clone().multiplyScalar(sp), drag: 2, life: 0.6, size: rr(0.18, 0.28), spin: rr(-9, 9), c1: '#9be06a', c2: '#3f8a34' }); continue; }
      if (style === 'gotas' && R() < 0.5) { s.emit({ k: K.DROP, pos: at, vel: dir.clone().multiplyScalar(sp).add(v3(0, 1, 0)), drag: 1.5, g: 6, life: 0.55, size: 0.16, stretch: 0.05, c1: '#eaf8ff', c2: P.main }); continue; }
      const fire = style === 'chamas';
      s.emit({ k: K.PUFF, pos: at, vel: dir.clone().multiplyScalar(sp), drag: 2, g: fire ? -1.5 : 0, life: rr(0.45, 0.65), size: 0.25, size1: rr(0.8, 1.2) * Math.min(1.5, range / 3), c1: P.puff1, c2: P.puff2 });
    }
    return t < 0.3;
  });
}

/** Feixe reto de a até b (linha): fita larga com núcleo branco, faíscas ao longo e acerto na ponta. */
export function beam(s: VfxStore, style: string, a: V3, b: V3, width: number, color: Col) {
  const P = palette(style, color);
  if (style === 'raios') { bolt(s, a, b, P.light, Math.max(0.25, width), 0.4); bolt(s, a, b, P.main, Math.max(0.15, width * 0.6), 0.3); }
  else {
    const pts = Array.from({ length: 18 }, (_, i) => a.clone().lerp(b, i / 17));
    const l = s.line({ color: P.main, w: Math.max(0.35, width * 1.4), mode: 0, life: 0.45, pts, profile: (u) => 0.55 + 0.45 * Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5), alphaAt: () => 1 });
    let t = 0; s.every((dt) => { t += dt; l.w = Math.max(0.35, width * 1.4) * (1 + Math.sin(t * 50) * 0.08) * (1 - t * 1.2); return !l.done; });
  }
  for (let i = 0; i < 14; i++) {
    const p = a.clone().lerp(b, R());
    debris(s, style, P, p, 1, 1.2, a.y - 0.6, 0.6);
  }
  burst(s, style, b, color, 0.6);
}

/** Corte de lâmina: meia-lua que varre da esquerda para a direita com núcleo branco e faíscas na ponta. */
export function slash(s: VfxStore, center: V3, yaw: number, range: number, color: Col, heavy: boolean) {
  const P = palette('impacto', color);
  const r = range * 0.7, span = heavy ? 1.35 : 1.1;
  const mk = (rad: number, w: number, c: THREE.Color, tilt: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 36; i++) {
      const a = yaw - span + (2 * span * i) / 36;
      pts.push(v3(center.x + Math.sin(a) * rad, center.y + Math.sin((i / 36 - 0.5) * Math.PI) * tilt, center.z + Math.cos(a) * rad));
    }
    return s.line({
      color: c, w, mode: 2, life: 0.36, pts, profile: (u) => Math.pow(Math.sin(u * Math.PI), 0.6),
      alphaAt: (u, l) => { const head = Math.min(1, l.age / 0.08), tail = Math.max(0, (l.age - 0.05) / 0.28); return u > head || u < tail ? 0 : Math.min(1, (u - tail) / 0.25); },
    });
  };
  const k = Math.max(1, range / 1.6);
  mk(r, (heavy ? 0.85 : 0.6) * k, P.main, 0.18);
  mk(r * 0.74, (heavy ? 0.22 : 0.15) * k, P.light, 0.12);
  s.after(0.06, () => {
    const tipA = yaw + span * 0.6, tip = v3(center.x + Math.sin(tipA) * r, center.y, center.z + Math.cos(tipA) * r);
    const tang = v3(Math.cos(tipA), 0, -Math.sin(tipA));
    for (let i = 0; i < (heavy ? 10 : 6); i++) s.emit({ k: K.STREAK, pos: tip, vel: tang.clone().multiplyScalar(rr(3, 6)).add(rndDir(0.5).multiplyScalar(2)), g: 6, drag: 2, life: rr(0.2, 0.35), size: 0.06, stretch: 0.09, c1: P.spark });
    if (heavy) s.emit({ k: K.STAR, pos: tip, life: 0.25, size: 0.9, size1: 0.2, spin: 6, c1: P.light });
  });
}

/** Aura em volta do conjurador: duas ondas no chão, clarão e detritos subindo pela borda. */
export function aura(s: VfxStore, style: string, center: V3, radius: number, color: Col, ground: number) {
  const P = palette(style, color);
  s.emit({ k: K.GLOW, pos: v3(center.x, ground + 0.6, center.z), life: 0.35, size: 1.2, size1: 2, c1: P.flash, alpha: 0.45 });
  for (let k = 0; k < 2; k++) s.emit({ k: K.RING, flat: true, pos: v3(center.x, ground + 0.05 + k * 0.01, center.z), delay: k * 0.14, life: 0.6, size: 0.6, size1: radius * 2.3, c1: k ? P.main : P.light });
  const n = Math.round(10 + radius * 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, d = radius * rr(0.3, 0.95), p = v3(center.x + Math.cos(a) * d, ground + 0.15, center.z + Math.sin(a) * d);
    debris(s, style, P, p, 1, 1.4, ground, 0.75);
  }
}

/** Carga (arco ou magia): faíscas convergindo, brilho que cresce; estrela quando a carga está perfeita. */
export class Charge {
  glow: Particle | null = null; star: Particle | null = null; acc = 0;
  constructor(public s: VfxStore) {}
  update(pos: V3, color: Col, k: number, perfect: boolean, dt: number) {
    const s = this.s;
    if (!this.glow) this.glow = s.emit({ k: K.GLOW, pos, life: 1e9, size: 0.3, c1: color, alpha: 0.9 });
    const g = this.glow;
    g.x = pos.x; g.y = pos.y; g.z = pos.z; g.size = 0.25 + k * 0.55 + (perfect ? Math.sin(s.time * 25) * 0.08 : 0); g.c1.set(perfect ? '#ffffff' : color);
    if (perfect && !this.star) this.star = s.emit({ k: K.STAR, pos, life: 1e9, size: 1, spin: 3, c1: '#fff3b0' });
    if (this.star) { this.star.x = pos.x; this.star.y = pos.y; this.star.z = pos.z; this.star.size = 0.9 + Math.sin(s.time * 18) * 0.15; }
    this.acc += dt * (25 + k * 70);
    while (this.acc >= 1) {
      this.acc -= 1;
      const d = rndDir(0).multiplyScalar(rr(0.45, 0.8) * (1 - k * 0.3)), from = pos.clone().add(d);
      s.emit({ k: K.STREAK, pos: from, vel: d.multiplyScalar(-rr(2.6, 3.4)), life: 0.28, size: 0.05 + k * 0.03, stretch: 0.1, c1: perfect ? '#fff3b0' : color });
    }
  }
  stop() {
    if (this.glow) { this.glow.life = this.glow.age + 0.08; this.glow = null; }
    if (this.star) { this.star.life = this.star.age + 0.08; this.star = null; }
  }
}

/** Escudo da defesa: anel de luz em pé na frente do Companion, com brilho e faíscas leves enquanto segura. */
export class Shield {
  ring: Particle | null = null; glow: Particle | null = null; ground: Particle | null = null; acc = 0;
  constructor(public s: VfxStore) {}
  update(pos: V3, yaw: number, color: Col, dt: number) {
    const s = this.s, f = v3(Math.sin(yaw), 0, Math.cos(yaw)), at = pos.clone().add(v3(0, 0.62, 0)).addScaledVector(f, 0.45);
    if (!this.ring) {
      this.ring = s.emit({ k: K.RING, pos: at, life: 1e9, size: 1.1, c1: color, alpha: 0.85 });
      this.glow = s.emit({ k: K.GLOW, pos: at, life: 1e9, size: 1.2, c1: color, alpha: 0.35 });
      this.ground = s.emit({ k: K.RING, flat: true, pos: pos.clone().setY(pos.y + 0.04), life: 1e9, size: 1.5, c1: color, alpha: 0.5 });
    }
    const pulse = 1 + Math.sin(s.time * 9) * 0.04;
    for (const p of [this.ring, this.glow]) if (p) { p.x = at.x; p.y = at.y; p.z = at.z; p.age = 0.2 * p.life; }
    this.ring!.size = 1.1 * pulse; this.glow!.size = 1.25 * pulse;
    if (this.ground) { this.ground.x = pos.x; this.ground.y = pos.y + 0.04; this.ground.z = pos.z; this.ground.age = 0.3 * this.ground.life; }
    this.acc += dt * 10;
    while (this.acc >= 1) { this.acc -= 1; const a = R() * 6.28; s.emit({ k: K.STAR, pos: at.clone().add(v3(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0).applyAxisAngle(v3(0, 1, 0), yaw)), life: 0.35, size: 0.18, size1: 0.02, c1: color }); }
  }
  stop() {
    for (const p of [this.ring, this.glow, this.ground]) if (p) p.life = p.age + 0.12;
    this.ring = this.glow = this.ground = null;
  }
}
