/**
 * Efeito próprio de cada técnica de arma. Antes, toda técnica usava o efeito genérico do formato (corpo a corpo =
 * meia-lua, linha = feixe, área = explosão...), e Estocada, Perfurante e Flecha Perfurante pareciam a mesma coisa.
 * Aqui cada slug tem a sua coreografia — o desenho do golpe (a lâmina que gira, a lança que fura, o martelo que
 * racha o chão) — e a essência continua dando a cor e os detritos (chamas, gelo, folhas...) nos pontos de impacto.
 *
 * Só desenha: o dano, o alcance e o tempo do acerto continuam sendo os do Combat. Técnica sem entrada aqui (as da
 * Forja, por exemplo) segue com o efeito genérico do formato.
 */
import * as THREE from 'three';
import { K, type Col, type VfxStore } from './engine';
import { bolt, burst, missile, palette, type Palette } from './recipes';

type V3 = THREE.Vector3;
const R = Math.random;
const rr = (a: number, b: number) => a + R() * (b - a);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);

export interface TechCtx {
  /** pés e peito de quem golpeia; `target` é o ponto mirado no chão (área, salto) */
  feet: V3; chest: V3; target: V3; yaw: number;
  range: number; radius: number; angle: number;
  /** estilo da essência (chamas, gelo...) e a cor do golpe */
  style: string; color: Col;
  ground: (x: number, z: number) => number;
}
/** `hit`: quando o acerto entra (s); `generic`: o Combat ainda roda o efeito do formato (projéteis: o voo é dele). */
export interface TechFxResult { hit: number; generic?: boolean }
interface Kit { s: VfxStore; c: TechCtx; P: Palette; fw: V3; right: V3 }
type Fx = (k: Kit) => TechFxResult;

/* ------------------------------------------------------------------ peças ------------------------------------------------------------------ */

/** Fita de corte que varre um arco horizontal em volta de `c` (ângulos relativos à frente; `rise` sobe ao longo do arco). */
function arc(s: VfxStore, o: { c: V3; yaw: number; r: number; a0: number; a1: number; w: number; color: Col; life?: number; delay?: number; tilt?: number; rise?: number; n?: number }) {
  const life = o.life ?? 0.36, n = o.n ?? 32;
  const make = () => {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = o.yaw + o.a0 + (o.a1 - o.a0) * u;
      pts.push(v3(o.c.x + Math.sin(a) * o.r, o.c.y + Math.sin((u - 0.5) * Math.PI) * (o.tilt ?? 0) + (o.rise ?? 0) * u, o.c.z + Math.cos(a) * o.r));
    }
    s.line({
      color: o.color, w: o.w, mode: 2, life, pts, max: n + 2, profile: (u) => Math.pow(Math.sin(u * Math.PI), 0.6),
      alphaAt: (u, l) => { const head = Math.min(1, l.age / (life * 0.24)), tail = Math.max(0, (l.age - life * 0.14) / (life * 0.78)); return u > head || u < tail ? 0 : Math.min(1, (u - tail) / 0.25); },
    });
  };
  if (o.delay) s.after(o.delay, make); else make();
}

/** Lâmina completa: o arco largo na cor e um fio claro por dentro (o brilho do gume). */
function blade(k: Kit, o: { c?: V3; r: number; a0: number; a1: number; w: number; life?: number; delay?: number; tilt?: number; rise?: number }) {
  const c = o.c ?? k.c.chest;
  arc(k.s, { ...o, c, yaw: k.c.yaw, color: k.P.main });
  arc(k.s, { ...o, c, yaw: k.c.yaw, r: o.r * 0.76, w: o.w * 0.28, color: k.P.light, tilt: (o.tilt ?? 0) * 0.7 });
}

/** Arco no plano vertical que aponta para a frente: 0 = à frente, π/2 = para cima, negativo = para o chão. */
function varc(k: Kit, o: { c: V3; r: number; a0: number; a1: number; w: number; color?: Col; life?: number; delay?: number; side?: number }) {
  const life = o.life ?? 0.34, n = 26, s = k.s;
  const make = () => {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = o.a0 + (o.a1 - o.a0) * (i / n);
      pts.push(o.c.clone().addScaledVector(k.fw, Math.cos(a) * o.r).addScaledVector(UP, Math.sin(a) * o.r).addScaledVector(k.right, (o.side ?? 0) * (i / n - 0.5)));
    }
    s.line({
      color: o.color ?? k.P.main, w: o.w, mode: 2, life, pts, max: n + 2, profile: (u) => Math.pow(Math.sin(u * Math.PI), 0.55),
      alphaAt: (u, l) => { const head = Math.min(1, l.age / (life * 0.26)), tail = Math.max(0, (l.age - life * 0.16) / (life * 0.76)); return u > head || u < tail ? 0 : Math.min(1, (u - tail) / 0.25); },
    });
  };
  if (o.delay) s.after(o.delay, make); else make();
}

/** Estocada: uma agulha de luz de `a` até `b` que nasce na mão e some pela cauda. */
function lance(s: VfxStore, a: V3, b: V3, w: number, color: Col, life = 0.3, delay = 0) {
  const make = () => {
    const pts = Array.from({ length: 16 }, (_, i) => a.clone().lerp(b, i / 15));
    s.line({
      color, w, mode: 2, life, pts, max: 18, profile: (u) => 0.25 + 0.75 * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (0.45 + 0.55 * u),
      alphaAt: (u, l) => { const head = Math.min(1, l.age / (life * 0.2)), tail = Math.max(0, (l.age - life * 0.25) / (life * 0.7)); return u > head || u < tail ? 0 : Math.min(1, (u - tail) / 0.2); },
    });
  };
  if (delay) s.after(delay, make); else make();
}

/** Faíscas numa direção (com abertura). */
function sparks(s: VfxStore, pos: V3, dir: V3, n: number, color: Col, speed = 5, spread = 0.5) {
  for (let i = 0; i < n; i++) {
    const d = dir.clone().add(v3(rr(-spread, spread), rr(-spread * 0.6, spread), rr(-spread, spread))).normalize();
    s.emit({ k: K.STREAK, pos, vel: d.multiplyScalar(speed * rr(0.6, 1.3)), g: 7, drag: 2.2, life: rr(0.2, 0.4), size: 0.065, stretch: 0.09, c1: color });
  }
}

/** Poeira baixa (o pé que firma, a arma que arrasta). */
function dust(k: Kit, pos: V3, n: number, push?: V3, scale = 1) {
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, v = v3(Math.cos(a) * rr(0.4, 1.2), rr(0.3, 0.8), Math.sin(a) * rr(0.4, 1.2));
    if (push) v.addScaledVector(push, rr(0.6, 1.6));
    k.s.emit({ k: K.PUFF, pos: pos.clone().setY(pos.y + 0.12), vel: v, drag: 3, g: -0.3, life: rr(0.45, 0.75), size: 0.3 * scale, size1: rr(0.7, 1.05) * scale, c1: k.P.puff1, c2: k.P.puff2, alpha: 0.8 });
  }
}

/** Anel deitado no chão. */
const ringFlat = (k: Kit, at: V3, size0: number, size1: number, color: Col, life = 0.5, delay = 0, alpha = 0.85) =>
  k.s.emit({ k: K.RING, flat: true, pos: v3(at.x, k.c.ground(at.x, at.z) + 0.05, at.z), delay, life, size: size0, size1, c1: color, alpha });
/** Anel em pé, de frente para a câmera (o ar que a ponta rasga). */
const ringAir = (k: Kit, at: V3, size0: number, size1: number, color: Col, life = 0.28, delay = 0) =>
  k.s.emit({ k: K.RING, pos: at, delay, life, size: size0, size1, c1: color, alpha: 0.8 });

/** Rachadura no chão, de `a` até `b`, com um zigue-zague de lado. */
function crack(k: Kit, a: V3, b: V3, w = 0.16, life = 0.6, delay = 0) {
  const make = () => {
    const dir = b.clone().sub(a), len = dir.length(), side = v3(dir.z, 0, -dir.x).normalize(), pts: V3[] = [];
    for (let i = 0; i <= 9; i++) {
      const u = i / 9, p = a.clone().addScaledVector(dir, u).addScaledVector(side, i === 0 || i === 9 ? 0 : rr(-1, 1) * len * 0.09);
      p.y = k.c.ground(p.x, p.z) + 0.06; pts.push(p);
    }
    k.s.line({ color: k.P.light, w, mode: 1, life, pts, max: 12, profile: (u) => 0.35 + 0.65 * (1 - u), alphaAt: () => 1 });
  };
  if (delay) k.s.after(delay, make); else make();
}

/** Flecha: risco fino e rápido de `a` até `b`, com a ponta acesa; `onLand` quando chega. */
function arrow(k: Kit, a: V3, b: V3, delay = 0, w = 0.14, onLand?: (at: V3) => void) {
  const dur = Math.max(0.1, a.distanceTo(b) / 30);
  k.s.after(delay, () => {
    lance(k.s, a, b, w, k.P.light, dur + 0.16);
    k.s.emit({ k: K.GLOW, pos: a, life: 0.12, size: 0.5, c1: k.P.flash, alpha: 0.5 });
    k.s.after(dur, () => { k.s.emit({ k: K.STAR, pos: b, life: 0.2, size: 0.55, size1: 0.08, spin: 6, c1: k.P.light }); onLand?.(b); });
  });
}

const fwd = (k: Kit, d: number, y = 0) => k.c.chest.clone().addScaledVector(k.fw, d).add(v3(0, y, 0));
const groundAt = (k: Kit, p: V3) => v3(p.x, k.c.ground(p.x, p.z), p.z);
/** O toque do elemento num ponto (clarão + detritos do estilo), pequeno para não cobrir o desenho do golpe. */
const element = (k: Kit, at: V3, scale = 0.45, delay = 0) => { const go = () => burst(k.s, k.c.style, at, k.c.color, scale, k.c.ground(at.x, at.z)); if (delay) k.s.after(delay, go); else go(); };

/* ---------------------------------------------------------------- técnicas ---------------------------------------------------------------- */

const FX: Record<string, Fx> = {
  /* ---- espada ---- */
  // duas voltas completas da lâmina, uma mais alta, e a onda no chão
  'espada-corte-giratorio': (k) => {
    const r = k.c.radius * 0.9;
    blade(k, { r, a0: -Math.PI, a1: Math.PI, w: 0.75, life: 0.42 });
    blade(k, { c: k.c.chest.clone().setY(k.c.chest.y + 0.35), r: r * 0.8, a0: Math.PI, a1: -Math.PI, w: 0.5, life: 0.42, delay: 0.1 });
    ringFlat(k, k.c.feet, 0.5, k.c.radius * 2.2, k.P.main, 0.5);
    dust(k, k.c.feet, 6);
    return { hit: 0.1 };
  },
  // a agulha reta, três anéis de ar pelo caminho e o estalo na ponta
  'espada-estocada': (k) => {
    const a = fwd(k, 0.3), b = fwd(k, k.c.range);
    lance(k.s, a, b, 0.5, k.P.main, 0.3); lance(k.s, a, b, 0.16, k.P.light, 0.26);
    for (let i = 1; i <= 3; i++) ringAir(k, fwd(k, (k.c.range * i) / 3.4), 0.2, 0.75 + i * 0.12, k.P.light, 0.26, i * 0.03);
    k.s.after(0.05, () => { sparks(k.s, b, k.fw, 8, k.P.spark, 6); element(k, b, 0.4); });
    return { hit: 0.05 };
  },
  // meia-lua que sobe do chão, com faíscas arrancadas para cima
  'espada-golpe-ascendente': (k) => {
    const c = k.c.feet.clone().setY(k.c.feet.y + 0.2);
    varc(k, { c, r: k.c.range * 0.75, a0: -0.25, a1: 2.0, w: 0.8 });
    varc(k, { c, r: k.c.range * 0.56, a0: -0.25, a1: 2.0, w: 0.22, color: k.P.light });
    dust(k, fwd(k, 0.8, -0.6), 4, k.fw.clone().multiplyScalar(0.6));
    k.s.after(0.1, () => { const top = fwd(k, k.c.range * 0.45, 1.1); sparks(k.s, top, UP, 10, k.P.spark, 7, 0.35); k.s.emit({ k: K.STAR, pos: top, life: 0.28, size: 1, size1: 0.15, spin: 6, c1: k.P.light }); });
    return { hit: 0.07 };
  },
  // o risco da corrida rente ao chão e cortes alternados dos dois lados pelo caminho
  'espada-investida-da-lamina': (k) => {
    const a = fwd(k, 0.2, -0.25), b = fwd(k, k.c.range, -0.25);
    lance(k.s, a, b, 0.7, k.P.main, 0.42); lance(k.s, a, b, 0.2, k.P.light, 0.36);
    for (let i = 0; i < 4; i++) {
      const at = fwd(k, k.c.range * (0.2 + i * 0.22)), sgn = i % 2 ? 1 : -1;
      arc(k.s, { c: at, yaw: k.c.yaw, r: 0.9, a0: sgn * 0.3, a1: sgn * 2.2, w: 0.4, color: k.P.light, life: 0.26, delay: 0.04 + i * 0.05, tilt: 0.25 * sgn });
      k.s.after(0.04 + i * 0.05, () => dust(k, groundAt(k, at), 2, k.fw.clone().multiplyScalar(-0.8), 0.8));
    }
    element(k, b, 0.5, 0.22);
    return { hit: 0.2 };
  },

  /* ---- faca ---- */
  // duas picadas curtas e quase juntas
  'faca-golpe-rapido': (k) => {
    for (let i = 0; i < 2; i++) {
      const off = k.right.clone().multiplyScalar(i ? 0.14 : -0.14), a = fwd(k, 0.25).add(off), b = fwd(k, k.c.range).add(off).add(v3(0, i ? 0.1 : -0.08, 0));
      lance(k.s, a, b, 0.22, i ? k.P.light : k.P.main, 0.16, i * 0.06);
      k.s.after(i * 0.06 + 0.04, () => sparks(k.s, b, k.fw, 4, k.P.spark, 5, 0.4));
    }
    return { hit: 0.05 };
  },
  // dois cortes diagonais que se cruzam num X, com a estrela no meio
  'faca-corte-cruzado': (k) => {
    const r = k.c.range * 0.75;
    blade(k, { r, a0: -1.0, a1: 1.0, w: 0.5, tilt: 0.55, life: 0.28 });
    blade(k, { r, a0: 1.0, a1: -1.0, w: 0.5, tilt: 0.55, life: 0.28, delay: 0.09 });
    k.s.after(0.11, () => { const x = fwd(k, r); k.s.emit({ k: K.STAR, pos: x, life: 0.26, size: 1, size1: 0.12, spin: 8, c1: k.P.flash }); sparks(k.s, x, k.fw, 7, k.P.spark, 5, 0.8); });
    return { hit: 0.07 };
  },
  // some numa fumaça escura, deixa vultos pelo caminho e reaparece cortando por trás
  'faca-emboscada': (k) => {
    const end = fwd(k, k.c.range);
    for (let i = 0; i < 7; i++) k.s.emit({ k: K.PUFF, pos: k.c.chest.clone().add(v3(rr(-0.25, 0.25), rr(-0.3, 0.3), rr(-0.25, 0.25))), vel: v3(rr(-0.6, 0.6), rr(0.2, 0.9), rr(-0.6, 0.6)), drag: 3, life: rr(0.4, 0.6), size: 0.4, size1: 0.9, c1: '#3b2f52', c2: '#15101f', alpha: 0.85 });
    for (let i = 1; i <= 3; i++) k.s.emit({ k: K.GLOW, pos: fwd(k, (k.c.range * i) / 4), delay: i * 0.05, life: 0.22, size: 0.9, size1: 0.3, c1: k.P.main, alpha: 0.35 });
    arc(k.s, { c: end, yaw: k.c.yaw + Math.PI, r: 0.95, a0: -1.2, a1: 1.2, w: 0.55, color: k.P.main, life: 0.28, delay: 0.2 });
    arc(k.s, { c: end, yaw: k.c.yaw + Math.PI, r: 0.7, a0: -1.2, a1: 1.2, w: 0.16, color: k.P.light, life: 0.26, delay: 0.2 });
    k.s.after(0.24, () => { k.s.emit({ k: K.STAR, pos: end, life: 0.25, size: 1.1, size1: 0.1, spin: 7, c1: k.P.flash }); element(k, end, 0.4); });
    return { hit: 0.22 };
  },
  // três cortes curtos em ângulos diferentes, cada um com um brilho
  'faca-danca-das-laminas': (k) => {
    const base = R() * 6.28;
    for (let i = 0; i < 3; i++) {
      const a0 = base + i * 2.1;
      arc(k.s, { c: k.c.chest.clone().setY(k.c.chest.y + rr(-0.2, 0.3)), yaw: k.c.yaw, r: k.c.radius * rr(0.6, 0.9), a0, a1: a0 + 2.4, w: 0.42, color: i % 2 ? k.P.light : k.P.main, life: 0.2, tilt: rr(-0.4, 0.4) });
    }
    k.s.emit({ k: K.STAR, pos: k.c.chest.clone().add(v3(rr(-0.8, 0.8), rr(0, 0.5), rr(-0.8, 0.8))), life: 0.22, size: 0.6, size1: 0.05, spin: 9, c1: k.P.flash });
    return { hit: 0.08 };
  },

  /* ---- maça ---- */
  // o arco pesado de cima para baixo e o estalo onde bate
  'maca-pancada': (k) => {
    const c = k.c.chest.clone(), at = fwd(k, k.c.range * 0.75, -0.3);
    varc(k, { c, r: k.c.range * 0.8, a0: 2.1, a1: -0.35, w: 0.95, life: 0.3 });
    k.s.after(0.1, () => { k.s.emit({ k: K.BURST, pos: at, life: 0.3, size: 0.5, size1: 1.7, c1: k.P.flash, c2: k.P.main }); ringFlat(k, at, 0.3, 1.8, k.P.light, 0.4); dust(k, groundAt(k, at), 5); element(k, at, 0.4); });
    return { hit: 0.1 };
  },
  // a maça no chão: três ondas que se abrem e rachaduras em estrela
  'maca-golpe-terrestre': (k) => {
    const c = k.c.feet, at = groundAt(k, fwd(k, 0.5));
    varc(k, { c: k.c.chest.clone(), r: 0.9, a0: 1.9, a1: -0.9, w: 0.8, life: 0.24 });
    k.s.after(0.08, () => {
      for (let i = 0; i < 3; i++) ringFlat(k, c, 0.4, k.c.radius * (1.5 + i * 0.45), i === 1 ? k.P.light : k.P.main, 0.55, i * 0.09, 0.9 - i * 0.2);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28 + rr(-0.2, 0.2); crack(k, at, v3(c.x + Math.cos(a) * k.c.radius * rr(0.75, 1), 0, c.z + Math.sin(a) * k.c.radius * rr(0.75, 1)), 0.16, 0.7); }
      dust(k, c, 9, undefined, 1.2);
      for (let i = 0; i < 6; i++) k.s.emit({ k: K.SHARD, pos: at.clone().setY(at.y + 0.15), vel: v3(rr(-2, 2), rr(3, 5.5), rr(-2, 2)), g: 13, floor: at.y + 0.05, life: rr(0.6, 0.9), size: rr(0.16, 0.28), spin: rr(-9, 9), c1: '#a68a6c', c2: '#5e4a3a' });
    });
    return { hit: 0.1 };
  },
  // o golpe mais alto e mais largo, que afunda o chão: anel duplo e coluna de poeira
  'maca-esmagar': (k) => {
    const at = groundAt(k, fwd(k, k.c.range * 0.75));
    varc(k, { c: k.c.chest.clone().setY(k.c.chest.y + 0.3), r: k.c.range * 0.95, a0: 2.4, a1: -0.5, w: 1.15, life: 0.34 });
    varc(k, { c: k.c.chest.clone().setY(k.c.chest.y + 0.3), r: k.c.range * 0.72, a0: 2.4, a1: -0.5, w: 0.3, color: k.P.light, life: 0.32 });
    k.s.after(0.13, () => {
      ringFlat(k, at, 0.4, 2.6, k.P.light, 0.5); ringFlat(k, at, 0.3, 1.7, k.P.main, 0.45, 0.07);
      for (let i = 0; i < 4; i++) crack(k, at, v3(at.x + rr(-1.3, 1.3), 0, at.z + rr(-1.3, 1.3)), 0.14, 0.6);
      for (let i = 0; i < 6; i++) k.s.emit({ k: K.PUFF, pos: at.clone().setY(at.y + 0.2), vel: v3(rr(-0.4, 0.4), rr(1.6, 3.4), rr(-0.4, 0.4)), drag: 2.2, life: rr(0.5, 0.8), size: 0.4, size1: rr(0.9, 1.3), c1: k.P.puff1, c2: k.P.puff2 });
      k.s.emit({ k: K.BURST, pos: at.clone().setY(at.y + 0.3), life: 0.32, size: 0.6, size1: 2.1, c1: k.P.flash, c2: k.P.main });
      element(k, at.clone().setY(at.y + 0.3), 0.5);
    });
    return { hit: 0.13 };
  },
  // a corrida que levanta poeira e a queda da maça no fim
  'maca-investida-pesada': (k) => {
    const end = groundAt(k, fwd(k, k.c.range));
    for (let i = 0; i < 5; i++) { const at = groundAt(k, fwd(k, k.c.range * (i / 5))); k.s.after(i * 0.04, () => dust(k, at, 3, k.fw.clone().multiplyScalar(-1), 1.1)); }
    lance(k.s, fwd(k, 0.2, -0.3), fwd(k, k.c.range, -0.3), 0.55, k.P.main, 0.34);
    varc(k, { c: end.clone().setY(end.y + 0.7).addScaledVector(k.fw, -0.8), r: 1.1, a0: 2.2, a1: -0.4, w: 0.95, life: 0.26, delay: 0.16 });
    k.s.after(0.22, () => { ringFlat(k, end, 0.4, k.c.radius * 2.6, k.P.light, 0.5); dust(k, end, 7, undefined, 1.2); element(k, end.clone().setY(end.y + 0.3), 0.6); });
    return { hit: 0.2 };
  },

  /* ---- lança ---- */
  // a mais longa e mais fina: agulha, quatro anéis e a ponta em estrela
  'lanca-estocada-longa': (k) => {
    const a = fwd(k, 0.4), b = fwd(k, k.c.range);
    lance(k.s, a, b, 0.34, k.P.main, 0.32); lance(k.s, a, b, 0.11, k.P.light, 0.28);
    for (let i = 1; i <= 4; i++) ringAir(k, fwd(k, (k.c.range * i) / 4.3), 0.15, 0.5 + i * 0.1, k.P.light, 0.24, i * 0.025);
    k.s.after(0.05, () => { k.s.emit({ k: K.STAR, pos: b, life: 0.26, size: 0.9, size1: 0.1, spin: 5, c1: k.P.flash }); sparks(k.s, b, k.fw, 6, k.P.spark, 7, 0.25); });
    return { hit: 0.05 };
  },
  // o cabo varrendo baixo e largo, com a onda de poeira empurrada para fora
  'lanca-varredura': (k) => {
    const half = (k.c.angle * Math.PI) / 360 + 0.25, c = k.c.feet.clone().setY(k.c.feet.y + 0.3);
    arc(k.s, { c, yaw: k.c.yaw, r: k.c.range * 0.92, a0: -half, a1: half, w: 0.7, color: k.P.main, life: 0.34 });
    arc(k.s, { c, yaw: k.c.yaw, r: k.c.range * 0.7, a0: -half, a1: half, w: 0.2, color: k.P.light, life: 0.32 });
    for (let i = 0; i < 6; i++) { const a = k.c.yaw - half + (2 * half * i) / 5, d = v3(Math.sin(a), 0, Math.cos(a)), at = groundAt(k, k.c.feet.clone().addScaledVector(d, k.c.range * 0.8)); k.s.after(0.04 + i * 0.03, () => dust(k, at, 2, d, 0.9)); }
    return { hit: 0.2 };
  },
  // a broca: a agulha no meio e duas espirais em volta dela
  'lanca-perfurante': (k) => {
    const a = fwd(k, 0.35), b = fwd(k, k.c.range);
    lance(k.s, a, b, 0.42, k.P.main, 0.34); lance(k.s, a, b, 0.13, k.P.light, 0.3);
    for (let h = 0; h < 2; h++) {
      const pts: V3[] = [];
      for (let i = 0; i <= 26; i++) { const u = i / 26, t = u * 9 + h * Math.PI, rad = 0.28 * (1 - u * 0.6); pts.push(a.clone().lerp(b, u).addScaledVector(k.right, Math.cos(t) * rad).addScaledVector(UP, Math.sin(t) * rad)); }
      k.s.line({ color: h ? k.P.light : k.P.main, w: 0.12, mode: 0, life: 0.34, pts, max: 28, profile: () => 1, alphaAt: (u, l) => (u > Math.min(1, l.age / 0.08) ? 0 : 1) });
    }
    k.s.after(0.06, () => { ringAir(k, b, 0.3, 1.3, k.P.light, 0.3); sparks(k.s, b, k.fw, 10, k.P.spark, 8, 0.3); element(k, b, 0.4); });
    return { hit: 0.05 };
  },
  // sobe num risco, desce em coluna e crava: ondas e rachaduras no ponto da queda
  'lanca-ceu-e-terra': (k) => {
    const end = groundAt(k, fwd(k, k.c.range)), apex = k.c.chest.clone().lerp(end, 0.5).setY(k.c.chest.y + 3.2);
    lance(k.s, k.c.chest.clone(), apex, 0.4, k.P.main, 0.26);
    lance(k.s, apex, end.clone().setY(end.y + 0.1), 0.6, k.P.light, 0.24, 0.14);
    k.s.after(0.24, () => {
      lance(k.s, end.clone().setY(end.y + 3), end.clone().setY(end.y + 0.05), 0.9, k.P.main, 0.3);
      for (let i = 0; i < 3; i++) ringFlat(k, end, 0.4, k.c.radius * (1.4 + i * 0.5), i ? k.P.main : k.P.light, 0.55, i * 0.08, 0.9 - i * 0.2);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + rr(-0.25, 0.25); crack(k, end, v3(end.x + Math.cos(a) * k.c.radius * 0.9, 0, end.z + Math.sin(a) * k.c.radius * 0.9), 0.16, 0.7); }
      dust(k, end, 8, undefined, 1.2); element(k, end.clone().setY(end.y + 0.3), 0.6);
    });
    return { hit: 0.25 };
  },

  /* ---- arco (os projéteis: o voo e o acerto são do Combat; aqui vai o gesto do disparo) ---- */
  // a mira que fecha na ponta da flecha antes de soltar
  'arco-tiro-preciso': (k) => {
    const at = fwd(k, 0.5);
    ringAir(k, at, 1.3, 0.25, k.P.light, 0.22); ringAir(k, at, 0.9, 0.15, k.P.flash, 0.18, 0.05);
    k.s.emit({ k: K.STAR, pos: at, delay: 0.14, life: 0.2, size: 0.7, size1: 0.1, spin: 5, c1: k.P.flash });
    return { hit: 0, generic: true };
  },
  // um risco só, que atravessa tudo e deixa um anel em cada ponto furado
  'arco-flecha-perfurante': (k) => {
    const a = fwd(k, 0.4), b = fwd(k, k.c.range);
    arrow(k, a, b, 0, 0.26);
    lance(k.s, a, b, 0.5, k.P.main, 0.3);
    for (let i = 1; i <= 5; i++) ringAir(k, fwd(k, (k.c.range * i) / 5.2), 0.15, 0.6, k.P.light, 0.24, i * 0.02);
    k.s.after(0.08, () => element(k, b, 0.35));
    return { hit: 0.05 };
  },
  // cinco flechas abertas em leque
  'arco-leque-de-flechas': (k) => {
    const half = (k.c.angle * Math.PI) / 360, a = fwd(k, 0.4);
    for (let i = 0; i < 5; i++) {
      const ang = k.c.yaw - half + (2 * half * i) / 4, b = a.clone().add(v3(Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(k.c.range));
      arrow(k, a, b, Math.abs(i - 2) * 0.025, 0.15, (p) => sparks(k.s, p, v3(Math.sin(ang), 0.2, Math.cos(ang)), 3, k.P.spark, 4, 0.4));
    }
    ringAir(k, a, 0.2, 0.9, k.P.light, 0.2);
    return { hit: 0.2 };
  },
  // a salva para o alto e as flechas caindo uma a uma dentro do círculo
  'arco-chuva-de-flechas': (k) => { rain(k, k.c.target, k.c.radius, 14, v3(-0.6, 0, -0.4)); return { hit: 0.3 }; },

  /* ---- cajado ---- */
  // o círculo de runas que se fecha na ponta do cajado antes da seta sair
  'cajado-seta-arcana': (k) => {
    const at = fwd(k, 0.5, 0.2);
    ringAir(k, at, 0.3, 1.1, k.P.light, 0.3); ringAir(k, at, 1.1, 0.3, k.P.main, 0.26, 0.04);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; k.s.emit({ k: K.STAR, pos: at.clone().addScaledVector(k.right, Math.cos(a) * 0.5).addScaledVector(UP, Math.sin(a) * 0.5), life: 0.3, size: 0.22, size1: 0.04, spin: 6, c1: k.P.flash }); }
    return { hit: 0, generic: true };
  },
  // o selo desenhado no chão: anéis, seis pontas e a coluna que sobe quando explode
  'cajado-selo-runico': (k) => { seal(k, k.c.target, k.c.radius, false); return { hit: 0.3 }; },
  // o cajado bate no chão: raios de luz em estrela e a coluna no centro
  'cajado-explosao-arcana': (k) => {
    const c = k.c.feet;
    ringFlat(k, c, 0.4, k.c.radius * 2.3, k.P.light, 0.5); ringFlat(k, c, 0.3, k.c.radius * 1.6, k.P.main, 0.5, 0.08);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28, d = v3(Math.cos(a), 0.05, Math.sin(a)); lance(k.s, c.clone().setY(c.y + 0.3), c.clone().setY(c.y + 0.3).addScaledVector(d, k.c.radius), 0.24, i % 2 ? k.P.light : k.P.main, 0.3, 0.03); }
    lance(k.s, c.clone().setY(c.y + 0.05), c.clone().setY(c.y + 3), 0.8, k.P.flash, 0.34);
    k.s.emit({ k: K.GLOW, pos: c.clone().setY(c.y + 0.8), life: 0.3, size: 1.4, size1: 2.6, c1: k.P.flash, alpha: 0.5 });
    return { hit: 0.1 };
  },

  /* ---- varinha ---- */
  // um estalo de faíscas na ponta
  'varinha-disparo-magico': (k) => {
    const at = fwd(k, 0.45, 0.15);
    k.s.emit({ k: K.STAR, pos: at, life: 0.2, size: 0.8, size1: 0.1, spin: 8, c1: k.P.flash });
    sparks(k.s, at, k.fw, 6, k.P.spark, 4, 0.7);
    return { hit: 0, generic: true };
  },
  // o raio que salta em três pernas, com um clarão em cada nó
  'varinha-raio-encadeado': (k) => {
    const pts = [fwd(k, 0.4)];
    for (let i = 1; i <= 3; i++) pts.push(fwd(k, (k.c.range * i) / 3, rr(-0.25, 0.35)).addScaledVector(k.right, (i % 2 ? 1 : -1) * rr(0.35, 0.8)));
    for (let i = 0; i < 3; i++) k.s.after(i * 0.07, () => {
      bolt(k.s, pts[i], pts[i + 1], k.P.light, 0.2, 0.3); bolt(k.s, pts[i], pts[i + 1], k.P.main, 0.11, 0.24);
      k.s.emit({ k: K.BURST, pos: pts[i + 1], life: 0.22, size: 0.3, size1: 1, c1: '#ffffff', c2: k.P.main });
    });
    return { hit: 0.08 };
  },
  // a bolha que incha em volta, com bolhinhas subindo por dentro
  'varinha-bolha-protetora': (k) => {
    const c = k.c.chest.clone();
    k.s.emit({ k: K.RING, pos: c, life: 0.9, size: 0.6, size1: k.c.radius * 2, c1: k.P.light, alpha: 0.7 });
    k.s.emit({ k: K.GLOW, pos: c, life: 0.8, size: 1, size1: k.c.radius * 2.2, c1: k.P.main, alpha: 0.22 });
    ringFlat(k, k.c.feet, 0.5, k.c.radius * 2.1, k.P.main, 0.8, 0, 0.6);
    for (let i = 0; i < 12; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * k.c.radius * 0.8; k.s.emit({ k: K.RING, pos: v3(k.c.feet.x + Math.cos(a) * d, k.c.feet.y + rr(0.1, 0.4), k.c.feet.z + Math.sin(a) * d), vel: v3(0, rr(0.7, 1.5), 0), delay: rr(0, 0.5), life: rr(0.5, 0.8), size: rr(0.12, 0.24), size1: rr(0.2, 0.34), c1: k.P.light, alpha: 0.85 }); }
    return { hit: 0.1 };
  },
  // quatro estouros de elementos diferentes pipocando dentro do círculo
  'varinha-explosao-caotica': (k) => {
    const styles = ['chamas', 'gelo', 'raios', 'folhas', 'gotas', 'sombra'], cols = ['#ff7a3d', '#9fe4ff', '#ffe066', '#7fdc6a', '#3fb6ff', '#a07cff'];
    const t = k.c.target;
    ringFlat(k, t, 0.3, k.c.radius * 2.2, k.P.light, 0.6);
    for (let i = 0; i < 4; i++) {
      const n = Math.floor(R() * styles.length), a = R() * 6.28, d = Math.sqrt(R()) * k.c.radius * 0.7, at = v3(t.x + Math.cos(a) * d, 0, t.z + Math.sin(a) * d);
      at.y = k.c.ground(at.x, at.z) + 0.4;
      k.s.after(0.3 + i * 0.07, () => burst(k.s, styles[n], at, cols[n], 0.6, at.y - 0.4));
    }
    return { hit: 0.3 };
  },

  /* ---- finalizadores (só saem pelas Cadências mais longas): tudo maior e com assinatura ---- */
  'espada-corte-duplo': (k) => {
    const r = k.c.range * 0.8;
    blade(k, { r, a0: -1.25, a1: 1.25, w: 0.6, tilt: 0.85, life: 0.3 });
    blade(k, { r, a0: 1.25, a1: -1.25, w: 0.6, tilt: 0.85, life: 0.3, delay: 0.07 });
    k.s.after(0.1, () => { const x = fwd(k, r); k.s.emit({ k: K.STAR, pos: x, life: 0.3, size: 1.5, size1: 0.15, spin: 7, c1: k.P.flash }); sparks(k.s, x, k.fw, 12, k.P.spark, 6, 0.9); });
    return { hit: 0.07 };
  },
  // o ascendente maior, com a coluna de faíscas que joga o alvo para o alto
  'espada-lancador': (k) => {
    const c = k.c.feet.clone().setY(k.c.feet.y + 0.2), base = groundAt(k, fwd(k, k.c.range * 0.6));
    varc(k, { c, r: k.c.range * 0.95, a0: -0.3, a1: 2.3, w: 1.1, life: 0.38 });
    varc(k, { c, r: k.c.range * 0.72, a0: -0.3, a1: 2.3, w: 0.3, color: k.P.light, life: 0.36 });
    k.s.after(0.1, () => {
      lance(k.s, base.clone().setY(base.y + 0.1), base.clone().setY(base.y + 3.4), 0.7, k.P.light, 0.36);
      for (let i = 0; i < 14; i++) k.s.emit({ k: K.STREAK, pos: base.clone().add(v3(rr(-0.4, 0.4), rr(0.1, 0.6), rr(-0.4, 0.4))), vel: v3(rr(-0.6, 0.6), rr(6, 11), rr(-0.6, 0.6)), drag: 1.6, life: rr(0.3, 0.5), size: 0.07, stretch: 0.11, c1: k.P.spark });
      ringFlat(k, base, 0.3, 2.2, k.P.main, 0.45); element(k, base.clone().setY(base.y + 1.2), 0.55);
    });
    return { hit: 0.07 };
  },
  // três voltas empilhadas que sobem girando e a onda larga no chão
  'espada-redemoinho-aereo': (k) => {
    for (let i = 0; i < 3; i++) {
      const c = k.c.feet.clone().setY(k.c.feet.y + 0.5 + i * 0.75), r = k.c.radius * (0.95 - i * 0.18), sgn = i % 2 ? -1 : 1;
      arc(k.s, { c, yaw: k.c.yaw + i * 1.3, r, a0: -Math.PI * sgn, a1: Math.PI * sgn, w: 0.8 - i * 0.14, color: i === 1 ? k.P.light : k.P.main, life: 0.46, delay: i * 0.07, rise: 0.5 });
    }
    ringFlat(k, k.c.feet, 0.5, k.c.radius * 2.4, k.P.light, 0.55); ringFlat(k, k.c.feet, 0.4, k.c.radius * 1.7, k.P.main, 0.5, 0.1);
    for (let i = 0; i < 12; i++) { const a = R() * 6.28; k.s.emit({ k: K.STREAK, pos: v3(k.c.feet.x + Math.cos(a) * k.c.radius * 0.6, k.c.feet.y + 0.2, k.c.feet.z + Math.sin(a) * k.c.radius * 0.6), vel: v3(-Math.sin(a) * 4, rr(3, 6), Math.cos(a) * 4), drag: 1.8, life: rr(0.35, 0.55), size: 0.07, stretch: 0.1, c1: k.P.spark }); }
    dust(k, k.c.feet, 8, undefined, 1.2);
    return { hit: 0.1 };
  },
  // o piscar: a agulha inteira de uma vez, um raio por dentro e os vultos que ficam para trás
  'espada-estocada-relampago': (k) => {
    const a = fwd(k, 0.2), b = fwd(k, k.c.range);
    lance(k.s, a, b, 0.75, k.P.main, 0.34); lance(k.s, a, b, 0.22, '#ffffff', 0.3);
    bolt(k.s, a, b, k.P.light, 0.14, 0.26);
    for (let i = 1; i <= 4; i++) k.s.emit({ k: K.GLOW, pos: fwd(k, (k.c.range * i) / 5), delay: i * 0.02, life: 0.3, size: 1.1, size1: 0.4, c1: k.P.main, alpha: 0.4 });
    k.s.after(0.06, () => { k.s.emit({ k: K.BURST, pos: b, life: 0.3, size: 0.6, size1: 2, c1: '#ffffff', c2: k.P.main }); sparks(k.s, b, k.fw, 12, k.P.spark, 8, 0.5); element(k, b, 0.5); });
    return { hit: 0.2 };
  },
  // a segunda flecha colada na primeira (a primeira é o projétil do Combat)
  'arco-tiro-duplo': (k) => {
    const from = fwd(k, 0.4), to = fwd(k, k.c.range);
    ringAir(k, from, 1.2, 0.2, k.P.flash, 0.2);
    k.s.after(0.09, () => missile(k.s, { style: k.c.style, color: k.c.color, from: from.clone().addScaledVector(k.right, 0.18), to: to.clone().addScaledVector(k.right, 0.18), duration: Math.max(0.15, from.distanceTo(to) / 14), arc: 0.3, size: 0.5 }));
    return { hit: 0, generic: true };
  },
  // o selo que cai sobre o alvo e levanta as grades em volta
  'cajado-prisao-runica': (k) => { seal(k, k.c.target, k.c.radius, true); return { hit: 0.3 }; },
  // duas chuvas vindas de lados opostos, que se cruzam no meio
  'arco-chuva-cruzada': (k) => {
    rain(k, k.c.target, k.c.radius, 11, v3(-1.6, 0, -0.5));
    k.s.after(0.1, () => rain(k, k.c.target, k.c.radius, 11, v3(1.6, 0, 0.5)));
    return { hit: 0.3 };
  },
};

/** Chuva de flechas: `n` riscos caindo inclinados dentro do círculo, um de cada vez, cada um com o seu pequeno impacto. */
function rain(k: Kit, center: V3, radius: number, n: number, lean: V3) {
  ringFlat(k, center, radius * 2, radius * 2.05, k.P.light, 0.5, 0, 0.55);
  lance(k.s, fwd(k, 0.4), fwd(k, 0.4).add(v3(0, 4, 0)), 0.3, k.P.light, 0.22);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * radius * 0.9, x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
    const to = v3(x, k.c.ground(x, z) + 0.05, z), from = to.clone().add(v3(lean.x, 5.5, lean.z));
    arrow(k, from, to, 0.24 + i * 0.03, 0.13, (p) => {
      ringFlat(k, p, 0.1, 0.7, k.P.main, 0.3, 0, 0.7);
      for (let j = 0; j < 2; j++) k.s.emit({ k: K.STREAK, pos: p, vel: v3(rr(-1.5, 1.5), rr(2, 4), rr(-1.5, 1.5)), g: 9, drag: 2, life: 0.25, size: 0.05, stretch: 0.08, c1: k.P.spark });
    });
  }
  element(k, v3(center.x, k.c.ground(center.x, center.z) + 0.4, center.z), 0.5, 0.42);
}

/** Selo rúnico: anéis que se desenham, seis pontas girando e a coluna na explosão; `cage` levanta as grades (Prisão Rúnica). */
function seal(k: Kit, center: V3, radius: number, cage: boolean) {
  const c = v3(center.x, k.c.ground(center.x, center.z), center.z);
  ringFlat(k, c, radius * 2, radius * 2.02, k.P.light, 0.6, 0, 0.9);
  ringFlat(k, c, radius * 0.2, radius * 1.3, k.P.main, 0.5, 0.05, 0.8);
  ringFlat(k, c, radius * 1.1, radius * 0.5, k.P.light, 0.45, 0.1, 0.7);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28, p = v3(c.x + Math.cos(a) * radius * 0.82, c.y + 0.12, c.z + Math.sin(a) * radius * 0.82);
    k.s.emit({ k: K.STAR, pos: p, delay: i * 0.03, life: 0.5, size: 0.42, size1: 0.2, spin: 4, c1: k.P.flash });
    // as linhas do desenho: cada ponta ligada à segunda seguinte (a estrela de seis pontas)
    const b = (((i + 2) % 6) / 6) * 6.28, q = v3(c.x + Math.cos(b) * radius * 0.82, c.y + 0.07, c.z + Math.sin(b) * radius * 0.82);
    k.s.line({ color: k.P.main, w: 0.09, mode: 1, life: 0.5, pts: [p.clone().setY(c.y + 0.07), p.clone().setY(c.y + 0.07).lerp(q, 0.5), q], max: 4, profile: () => 1, alphaAt: (u, l) => (u > Math.min(1, l.age / 0.2) ? 0 : 1) });
    if (cage) lance(k.s, p.clone().setY(c.y + 0.05), p.clone().setY(c.y + 2.6), 0.26, k.P.light, 0.7, 0.3 + i * 0.02);
  }
  k.s.after(0.3, () => {
    lance(k.s, c.clone().setY(c.y + 0.05), c.clone().setY(c.y + 3.2), cage ? 0.6 : 1, k.P.flash, 0.34);
    k.s.emit({ k: K.BURST, pos: c.clone().setY(c.y + 0.5), life: 0.32, size: 0.6, size1: radius * 1.6, c1: k.P.flash, c2: k.P.main });
    if (cage) ringFlat(k, c, radius * 2.1, radius * 1.9, k.P.flash, 0.7, 0, 0.9);
    element(k, c.clone().setY(c.y + 0.5), 0.55);
  });
}

/** Slugs com efeito próprio (a prévia da Forja e os testes usam). */
export const TECHNIQUE_FX_SLUGS = Object.keys(FX);

/**
 * Toca o efeito próprio da técnica. Devolve null se o slug não tem um (o Combat usa o genérico do formato), ou o
 * tempo do acerto; com `generic`, o Combat ainda roda o efeito do formato (projéteis).
 */
export function techniqueFx(s: VfxStore, slug: string, c: TechCtx): TechFxResult | null {
  const fx = FX[slug];
  if (!fx) return null;
  const fw = v3(Math.sin(c.yaw), 0, Math.cos(c.yaw)), right = v3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
  return fx({ s, c, P: palette(c.style, c.color), fw, right });
}
