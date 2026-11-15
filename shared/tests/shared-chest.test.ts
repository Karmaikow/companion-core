import { describe, it, expect } from 'vitest';
import { CHEST_TTL_MS, killLoot, readChestOpened, readSharedChest } from '../rules/index';

const ID = '3f2b8c1e-9a4d-4e7b-8f10-2c5d6e7f8a9b', NOW = 1_800_000_000_000;

describe('um baú para todos', () => {
  it('quem pede o quê quando o monstro cai', () => {
    expect(killLoot(true, true)).toBe('own');   // simulava e bateu (ou está sozinho): conta e deixa o baú
    expect(killLoot(true, false)).toBe('only'); // simulava mas não bateu: só deixa o baú
    expect(killLoot(false, true)).toBe('none'); // ajudou: conta a derrota, o baú é do outro jogo
    expect(killLoot(false, false)).toBe(null);  // só assistiu: nada
  });

  it('de qualquer combinação de jogadores sai exatamente um baú', () => {
    // um jogo simula o monstro (owner) e os outros não; cada um bateu ou não
    for (const ownerHit of [true, false]) for (const helpers of [[], [true], [true, false], [false, false]]) {
      const asks = [killLoot(true, ownerHit), ...helpers.map((h) => killLoot(false, h))];
      expect(asks.filter((a) => a === 'own' || a === 'only').length).toBe(1);
    }
  });

  it('aviso de baú novo: forma conferida e prazo limitado', () => {
    const ok = { id: ID, tier: 'raro', x: 12.5, z: -40, expiresAt: NOW + 60_000, crystals: 1 };
    expect(readSharedChest(ok, NOW)).toEqual({ id: ID, tier: 'raro', x: 12.5, z: -40, expiresAt: NOW + 60_000, crystals: 1, state: 'fechado', drops: [] });
    // o prazo nunca passa do tempo de um baú fechado, e os cristais ficam em faixa
    expect(readSharedChest({ ...ok, expiresAt: NOW + 9e12, crystals: 9999 }, NOW)).toMatchObject({ expiresAt: NOW + CHEST_TTL_MS, crystals: 20 });
    // nada do que vem no aviso entra como conteúdo: o baú chega sempre fechado e sem itens
    expect(readSharedChest({ ...ok, state: 'aberto', drops: [{ key: 'espada-lendaria', qty: 99 }] }, NOW)).toMatchObject({ state: 'fechado', drops: [] });
  });

  it('aviso inválido é descartado', () => {
    const ok = { id: ID, tier: 'comum', x: 0, z: 0, expiresAt: NOW + 1000, crystals: 0 };
    for (const bad of [null, 'x', 5, {}, { ...ok, id: 'nao-e-uuid' }, { ...ok, id: 123 }, { ...ok, tier: 'mitico' }, { ...ok, x: NaN }, { ...ok, x: 5000 }, { ...ok, z: 'a' }, { ...ok, expiresAt: NOW - 1 }, { ...ok, expiresAt: 'logo' }])
      expect(readSharedChest(bad, NOW), JSON.stringify(bad)).toBe(null);
  });

  it('aviso de baú aberto', () => {
    expect(readChestOpened({ id: ID, left: true })).toEqual({ id: ID, left: true });
    expect(readChestOpened({ id: ID })).toEqual({ id: ID, left: false });
    expect(readChestOpened({ id: ID, left: 'sim' })).toEqual({ id: ID, left: false });
    expect(readChestOpened({ id: 'x' })).toBe(null);
    expect(readChestOpened(null)).toBe(null);
  });
});
