import { describe, it, expect } from 'vitest';
import { chestTierFor, rollCrystals, resolveAster, DEFAULT_ASTER, rebuildFits, rebuildDone, rebuildRatio, cleanProgress, batchKey, DISTORCIDOS } from '../rules/index';

describe('baús de drop', () => {
  it('o tipo do baú vem do estágio da família', () => {
    expect(chestTierFor(null)).toBe('comum');
    const by = (slug: string) => DISTORCIDOS.creatures.find((c) => c.slug === slug)!;
    expect(chestTierFor(by('lasquinha'))).toBe('comum');
    expect(chestTierFor(by('sentinela-facetada'))).toBe('raro');
    expect(chestTierFor(by('coracao-rachado'))).toBe('lendario');
  });

  it('cristais pela chance do Admin', () => {
    expect(rollCrystals('lendario', DEFAULT_ASTER, () => 0.99)).toBe(3);
    expect(rollCrystals('comum', DEFAULT_ASTER, () => 0.5)).toBe(0);
    expect(rollCrystals('comum', DEFAULT_ASTER, () => 0.01)).toBe(1);
  });
});

describe('reconstrução de Áster', () => {
  it('saneia a configuração do Admin', () => {
    const c = resolveAster({ crystals: { comum: { chance: 5, qty: 0 } }, rebuild: { crystals: -3, lumes: 'x', materials: [{ label: '', material: 'tabua-nobre', qty: 2 }, { material: 'lava' }] } });
    expect(c.crystals.comum).toEqual({ chance: 1, qty: 1 });
    expect(c.rebuild).toMatchObject({ crystals: 0, lumes: DEFAULT_ASTER.rebuild.lumes, materials: [{ label: 'Material', material: 'tabua-nobre', qty: 2 }] });
    expect(resolveAster(undefined)).toEqual(DEFAULT_ASTER);
  });

  it('confere materiais e a meta', () => {
    const need = { label: 'Madeira boa', category: 'madeira' as const, prop: 'resistencia' as const, min: 'alta' as const, qty: 3 };
    expect(rebuildFits(need, batchKey('tabua-nobre', { flexibilidade: 'baixa', resistencia: 'alta' }))).toBe(true);
    expect(rebuildFits(need, batchKey('madeira-salgueiro', { flexibilidade: 'alta', resistencia: 'media' }))).toBe(false);
    const g = DEFAULT_ASTER.rebuild;
    const half = cleanProgress({ crystals: g.crystals, lumes: g.lumes / 2, materials: g.materials.map((m) => m.qty) });
    expect(rebuildDone(g, half)).toBe(false);
    expect(rebuildRatio(g, half)).toBeGreaterThan(0.8);
    expect(rebuildDone(g, { ...half, lumes: g.lumes })).toBe(true);
  });
});
