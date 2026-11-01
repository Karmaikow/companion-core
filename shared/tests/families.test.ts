import { describe, it, expect } from 'vitest';
import { CREATURE_FAMILIES, TIER_ORDER } from '../rules/families';
import { creatureStatsAt, sanitizeCreature } from '../rules/creatures';
import { DEFAULT_SKILLS } from '../rules/combat/skills';
import { DEFAULT_ITEMS } from '../rules/equipment';

describe('famílias de monstros', () => {
  for (const fam of CREATURE_FAMILIES) {
    it(`${fam.id}: um estágio de cada, do bebê ao MVP, em ordem`, () => {
      expect(fam.creatures.map((c) => c.family?.tier)).toEqual(TIER_ORDER);
      for (const c of fam.creatures) expect(c.family?.id).toBe(fam.id);
      expect(fam.creatures.at(-1)!.archetype).toBe('ancestral');
    });

    it(`${fam.id}: cada estágio começa depois do anterior e fica mais forte no próprio nível`, () => {
      for (let i = 1; i < fam.creatures.length; i++) {
        const a = fam.creatures[i - 1], b = fam.creatures[i];
        expect(b.level[0]).toBeGreaterThan(a.level[1]);
        const sa = creatureStatsAt(a, a.level[1]), sb = creatureStatsAt(b, b.level[0]);
        expect(sb.vida).toBeGreaterThan(sa.vida);
        expect(b.rarity).toBeLessThanOrEqual(a.rarity);
        expect(b.respawn).toBeGreaterThanOrEqual(a.respawn);
        expect(b.lumes[1]).toBeGreaterThan(a.lumes[1]);
      }
    });

    it(`${fam.id}: habilidades existem na Forja e drops existem no Arsenal`, () => {
      const skills = new Set(DEFAULT_SKILLS.map((s) => s.slug));
      const items = new Set(DEFAULT_ITEMS.map((i) => i.name));
      for (const c of fam.creatures) {
        for (const s of c.skills) expect(skills, `${c.slug}: ${s.slug}`).toContain(s.slug);
        for (const d of c.drops) expect(items, `${c.slug}: ${d.item}`).toContain(d.item);
      }
    });
  }

  it('o campo family sobrevive ao saneamento e rejeita estágio inválido', () => {
    const c = CREATURE_FAMILIES[0].creatures[0];
    expect(sanitizeCreature(c)?.family).toEqual(c.family);
    expect(sanitizeCreature({ ...c, family: { id: 'x-y', tier: 'deus' } })?.family).toBeUndefined();
  });
});
