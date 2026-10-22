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

describe('monstros: tempo de volta', () => {
  it('tem padrão de 45 s e limites', () => {
    expect(sanitizeCreature({ slug: 'x-y' })!.respawn).toBe(45);
    expect(sanitizeCreature({ slug: 'x-y', respawn: 1 })!.respawn).toBe(5);
    expect(sanitizeCreature({ slug: 'x-y', respawn: 120 })!.respawn).toBe(120);
  });
});

import { affinity, ELEMENTS, DEFAULT_SKILLS, kitFor, STATUSES, VFX_STYLES } from '../rules/index.ts';
describe('veneno', () => {
  it('é uma essência com afinidades fora do anel', () => {
    expect(ELEMENTS.veneno.label).toBe('Veneno');
    expect(affinity('veneno', 'natureza')).toBe(1.25); expect(affinity('veneno', 'agua')).toBe(1.25);
    expect(affinity('veneno', 'terra')).toBe(0.8); expect(affinity('veneno', 'luz')).toBe(0.8);
    expect(affinity('luz', 'veneno')).toBe(1.25); expect(affinity('natureza', 'veneno')).toBe(0.8);
    expect(affinity('veneno', 'fogo')).toBe(1); expect(affinity('fogo', 'veneno')).toBe(1);
  });
  it('tem duas habilidades, estado e efeito', () => {
    const v = DEFAULT_SKILLS.filter((s) => s.essence === 'veneno');
    expect(v.map((s) => s.slug).sort()).toEqual(['cuspe-toxico', 'nevoa-venenosa']);
    expect(v.every((s) => s.status?.key === 'envenenado' && s.vfx.style === 'veneno')).toBe(true);
    expect(STATUSES.envenenado.good).toBe(false); expect(VFX_STYLES.veneno).toBe('Veneno');
    expect(kitFor(DEFAULT_SKILLS, { essence: 'veneno', body: 'biped', bond: 5 }).essence.length).toBe(2);
  });
});

import { motionFor } from '../rules/index.ts';
describe('movimento por código dos monstros', () => {
  it('automático pelo corpo e escolha explícita', () => {
    expect(motionFor({ motion: 'auto', body: 'avian' })).toBe('flutuar');
    expect(motionFor({ motion: 'auto', body: 'serpentine' })).toBe('rastejar');
    expect(motionFor({ motion: 'auto', body: 'quadruped' })).toBe('gingar');
    expect(motionFor({ motion: 'saltitar', body: 'avian' })).toBe('saltitar');
    expect(sanitizeCreature({ slug: 'x-y', motion: 'voar' })!.motion).toBe('auto');
  });
});
