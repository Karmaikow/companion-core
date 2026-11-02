import { describe, it, expect } from 'vitest';
import {
  TIERS, tierOf, tierBlock, evolutionStage, sanitizeItem, basicAttack, equipmentBonus, validateEquipped, DEFAULT_ITEMS,
  WEAPON_TECHNIQUES, TECH_EVOLUTIONS, evolve, techniquesFor, sanitizeSkill, type ItemDef,
} from '../rules/index';

const sword = (o: Partial<ItemDef> = {}) => sanitizeItem({ slug: 'espada-teste', name: 'Espada', type: 'espada', rarity: 'comum', stats: { poder: 4 }, ...o })!;

describe('tiers de item', () => {
  it('sem tier é T1 (a raridade não muda o tier); com tier, o definido', () => {
    expect(tierOf(sword())).toBe(1);
    expect(tierOf(sword({ rarity: 'rara' }))).toBe(1);
    expect(tierOf(sword({ rarity: 'comum', tier: 5 }))).toBe(5);
    expect(sanitizeItem({ slug: 'espada-x', type: 'espada', tier: 9 })!.tier).toBeUndefined();
  });

  it('o tier sobe o dano da arma e os atributos', () => {
    expect(basicAttack(sword({ tier: 4 })).power).toBeCloseTo(basicAttack(sword({ tier: 1 })).power * TIERS[4].power);
    const t1 = sword({ tier: 1 }), t5 = sword({ slug: 'espada-t5', tier: 5 });
    expect(equipmentBonus({ mainhand: t5.slug }, [t5]).poder!).toBeGreaterThan(equipmentBonus({ mainhand: t1.slug }, [t1]).poder!);
  });

  it('tier alto pede vínculo para vestir', () => {
    const t5 = sword({ tier: 5 });
    expect(tierBlock(t5, 1)).toMatch(/vínculo/);
    expect(tierBlock(t5, TIERS[5].bond)).toBeNull();
    expect(validateEquipped({ mainhand: t5.slug }, [t5, ...DEFAULT_ITEMS], () => true, 1).mainhand).toBeUndefined();
    expect(validateEquipped({ mainhand: t5.slug }, [t5, ...DEFAULT_ITEMS], () => true, 30).mainhand).toBe(t5.slug);
  });

  it('faixas de evolução: base, T3 e T5', () => {
    expect([1, 2, 3, 4, 5].map((t) => evolutionStage(t as 1))).toEqual([0, 0, 1, 1, 2]);
  });
});

describe('evolução das técnicas', () => {
  it('toda técnica de arma tem dois caminhos', () => {
    for (const t of WEAPON_TECHNIQUES) expect(TECH_EVOLUTIONS[t.slug]?.length).toBe(2);
  });

  it('T1–T2 ou sem caminho fica igual; T3 e T5 mudam o nome e os números', () => {
    const est = WEAPON_TECHNIQUES.find((t) => t.slug === 'espada-estocada')!;
    expect(evolve(est, 2, 'b')).toBe(est);
    expect(evolve(est, 4, null)).toBe(est);
    const dupla = evolve(est, 3, 'b'), tripla = evolve(est, 5, 'b');
    expect(dupla.name).toBe('Estocada Dupla');
    expect(dupla.repeat).toBe(2);
    expect(tripla.repeat).toBe(3);
    expect(dupla.slug).toBe(est.slug);
    expect(evolve(est, 3, 'a').range).toBeGreaterThan(est.range);
  });

  it('as técnicas na mão saem evoluídas pelo tier e caminho', () => {
    const got = techniquesFor([], 'arco', 'fogo', 20, { tier: 5, paths: { 'arco-chuva-de-flechas': 'a' } });
    expect(got.find((s) => s.slug === 'arco-chuva-de-flechas')!.name).toBe('Tempestade de Aço');
    expect(got.find((s) => s.slug === 'arco-tiro-preciso')!.name).toBe('Tiro Preciso');
  });

  it('o número de golpes passa pela Forja (sanitize)', () => {
    expect(sanitizeSkill({ slug: 'golpe-x', repeat: 3 })!.repeat).toBe(3);
    expect(sanitizeSkill({ slug: 'golpe-x', repeat: 1 })!.repeat).toBeUndefined();
  });
});
