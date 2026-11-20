import { describe, expect, it } from 'vitest';
import { resolutionLimits } from './AdaptiveResolution';

describe('resolutionLimits', () => {
  it('no computador (modo alto) nunca desenha abaixo de 1 pixel por pixel da tela', () => {
    expect(resolutionLimits(true, 1.25, false)).toEqual({ max: 1.25, min: 1 });
    expect(resolutionLimits(true, 1, false)).toEqual({ max: 1, min: 1 });
    expect(resolutionLimits(true, 3, false)).toEqual({ max: 1.75, min: 1 });
  });
  it('no celular aceita perder nitidez para segurar os quadros', () => {
    expect(resolutionLimits(true, 3, true)).toEqual({ max: 1.75, min: 0.75 });
  });
  it('modo baixo continua como antes', () => {
    expect(resolutionLimits(false, 2, true)).toEqual({ max: 1, min: 0.6 });
    expect(resolutionLimits(false, 1, false)).toEqual({ max: 1, min: 0.6 });
  });
});
