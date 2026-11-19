import { describe, expect, it } from 'vitest';
import { groundDetailAt, groundDetailOn } from './groundDetail';

describe('chão detalhado', () => {
  it('emenda nas bordas: o lado esquerdo continua o direito, e o de cima o de baixo', () => {
    let worst = 0;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      worst = Math.max(worst, Math.abs(groundDetailAt(0, t) - groundDetailAt(1, t)), Math.abs(groundDetailAt(t, 0) - groundDetailAt(t, 1)));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('só clareia e escurece dentro de uma faixa estreita (não apaga a cor do bioma)', () => {
    let lo = 1, hi = 0, sum = 0, n = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const v = groundDetailAt((x + 0.5) / 128, (y + 0.5) / 128); lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; n++; }
    expect(lo).toBeGreaterThan(0.6);
    expect(hi).toBeLessThanOrEqual(1);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.8); expect(mean).toBeLessThan(0.95); // compensada pela cor do material
  });

  it('a URL vence o ajuste (para comparar lado a lado)', () => {
    expect(groundDetailOn(false)).toBe(false);
    expect(groundDetailOn(true)).toBe(true);
  });
});
