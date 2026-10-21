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
