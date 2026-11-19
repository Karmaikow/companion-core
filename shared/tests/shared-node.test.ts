import { describe, it, expect } from 'vitest';
import { newerNode, readSharedNode } from '../rules/index';

const NOW = 1_800_000_000_000;

describe('um recurso para todos', () => {
  it('aviso válido passa como veio', () => {
    expect(readSharedNode({ id: 'arvore@12,-4', amount: 2.5, at: NOW - 1000 }, NOW)).toEqual({ id: 'arvore@12,-4', amount: 2.5, at: NOW - 1000 });
  });

  it('os números ficam em faixa, e um relógio adiantado não congela o recurso no futuro', () => {
    expect(readSharedNode({ id: 'n', amount: -3, at: NOW }, NOW)?.amount).toBe(0);
    expect(readSharedNode({ id: 'n', amount: 1e9, at: NOW }, NOW)?.amount).toBe(10_000);
    expect(readSharedNode({ id: 'n', amount: 1, at: NOW + 86_400_000 }, NOW)?.at).toBe(NOW);
  });

  it('aviso inválido é descartado', () => {
    for (const bad of [null, 'x', 3, {}, { id: '', amount: 1, at: NOW }, { id: 5, amount: 1, at: NOW }, { id: 'x'.repeat(81), amount: 1, at: NOW },
      { id: 'n', amount: 'muito', at: NOW }, { id: 'n', amount: NaN, at: NOW }, { id: 'n', amount: 1, at: 'agora' }])
      expect(readSharedNode(bad, NOW), JSON.stringify(bad)).toBe(null);
  });

  it('fica com o aviso mais novo (podem chegar fora de ordem)', () => {
    const next = { id: 'n', amount: 0, at: NOW };
    expect(newerNode(null, next)).toBe(true);
    expect(newerNode(undefined, next)).toBe(true);
    expect(newerNode({ at: NOW - 1 }, next)).toBe(true);
    expect(newerNode({ at: NOW + 1 }, next)).toBe(false);
  });
});
