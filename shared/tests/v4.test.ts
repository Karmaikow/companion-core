import { describe, expect, it } from 'vitest';
import { DEFAULT_CREATURES, DEFAULT_ITEMS, creatureSkillsAt, mitigate, pickCreatureSkill, sanitizeCreature, sanitizeItem, gripFor } from '../rules/index.ts';

describe('monstros: atributos e árvore de habilidades', () => {
  const lobo = DEFAULT_CREATURES.find((c) => c.slug === 'lobinho-de-geada')!;
  it('velocidade de ataque tem padrão e limites', () => {
    expect(lobo.stats.atkSpeed).toBe(0.9);
    expect(sanitizeCreature({ slug: 'x-y', stats: { atkSpeed: 99 } })!.stats.atkSpeed).toBe(4);
    expect(sanitizeCreature({ slug: 'x-y' })!.stats.atkSpeed).toBe(0.8);
  });
  it('habilidades abrem por nível e pela de antes', () => {
    expect(creatureSkillsAt(lobo, 1).map((s) => s.slug)).toEqual(['golpe']);
    expect(creatureSkillsAt(lobo, 4).map((s) => s.slug)).toEqual(['golpe', 'investida']);
    expect(creatureSkillsAt(lobo, 6).map((s) => s.slug)).toEqual(['golpe', 'investida', 'rajada-fria']);
    for (let i = 0; i < 50; i++) expect(pickCreatureSkill(lobo, i / 50, 1)).toBe('golpe');
  });
  it('pré-requisito que não existe (ou ela mesma) vira raiz', () => {
    const c = sanitizeCreature({ slug: 'x-y', skills: [{ slug: 'golpe', weight: 1, level: 1, after: 'golpe' }, { slug: 'brasas', weight: 1, level: 2, after: 'nao-existe' }] })!;
    expect(c.skills.every((s) => !s.after)).toBe(true);
  });
  it('defesa corta o dano (100 = metade), mínimo 1', () => {
    expect(mitigate(40, 0)).toBe(40);
    expect(mitigate(40, 100)).toBe(20);
    expect(mitigate(1, 500)).toBe(1);
  });
});

describe('arsenal: pegada por modelo', () => {
  it('guarda ajustes por Companion e usa o padrão nos outros', () => {
    const base = DEFAULT_ITEMS[0];
    const id = '0f5b1a8e-1234-4abc-9def-001122334455';
    const it2 = sanitizeItem({ ...base, gripByModel: { [id]: { pos: [0.1, 0, 0], rot: [0, 1, 0], scale: 1.4 }, 'não é id': { scale: 2 } } })!;
    expect(Object.keys(it2.gripByModel!)).toEqual([id]);
    expect(gripFor(it2, id).scale).toBe(1.4);
    expect(gripFor(it2, 'outro')).toEqual(it2.grip);
    expect(gripFor(it2, null)).toEqual(it2.grip);
  });
});
