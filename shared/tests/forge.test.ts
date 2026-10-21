import { describe, it, expect } from 'vitest';
import { DEFAULT_SKILLS, sanitizeSkill, kitFor, affinity, expectedDamage, DEFAULT_CREATURES, sanitizeCreature, chunkSpawns, pickCreatureSkill, rollDrops, creatureStatsAt, sanitizeLook, LOOK_PRESETS } from '../rules/index.ts';

describe('Forja de Batalha', () => {
  it('o catálogo inicial é válido e sem slugs repetidos', () => {
    expect(new Set(DEFAULT_SKILLS.map((s) => s.slug)).size).toBe(DEFAULT_SKILLS.length);
    for (const s of DEFAULT_SKILLS) expect(sanitizeSkill(s)).toEqual(s);
  });
  it('todo Companion (qualquer essência e corpo) recebe um kit completo no vínculo 8', () => {
    for (const essence of ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza'] as const)
      for (const body of ['quadruped', 'biped', 'avian', 'serpentine', 'aquatic'] as const) {
        const k = kitFor(DEFAULT_SKILLS, { essence, body, bond: 8 });
        expect(k.basic).toBeTruthy(); expect(k.essence.length).toBe(2); expect(k.form).toBeTruthy(); expect(k.supreme).toBeTruthy();
        expect(k.essence.every((s) => s.essence === essence)).toBe(true);
      }
  });
  it('o vínculo abre os espaços aos poucos', () => {
    const k1 = kitFor(DEFAULT_SKILLS, { essence: 'fogo', body: 'quadruped', bond: 1 });
    expect(k1.essence.map((s) => s.slug)).toEqual(['sopro-de-chamas']);
    expect(k1.form).toBeNull(); expect(k1.supreme).toBeNull();
    expect(k1.locked.map((s) => s.slug)).toContain('investida');
    expect(kitFor(DEFAULT_SKILLS, { essence: 'fogo', body: 'quadruped', bond: 5 }).form?.slug).toBe('investida');
    expect(kitFor(DEFAULT_SKILLS, { essence: null, body: 'avian', bond: 1 }).basic?.slug).toBe('faisca-de-essencia');
  });
  it('afinidades: anel das sete e luz/sombra', () => {
    expect(affinity('agua', 'fogo')).toBe(1.25); expect(affinity('fogo', 'agua')).toBe(0.8);
    expect(affinity('vento', 'agua')).toBe(1.25); expect(affinity('luz', 'sombra')).toBe(1.25);
    expect(affinity('luz', 'fogo')).toBe(1); expect(affinity(null, 'fogo')).toBe(1);
    expect(expectedDamage({ power: 100 }, 50, 50)).toBe(50);
  });
  it('sanitizeSkill recusa slug ruim e corrige números', () => {
    expect(sanitizeSkill({ slug: 'X!' })).toBeNull();
    const s = sanitizeSkill({ slug: 'teste', power: 9999, cooldown: -1, essence: 'plasma', status: { key: 'nope' } })!;
    expect(s.power).toBe(400); expect(s.cooldown).toBe(0.3); expect(s.essence).toBeNull(); expect(s.status).toBeNull();
  });
});

describe('Invocador de Monstros', () => {
  it('reservas válidas', () => { for (const c of DEFAULT_CREATURES) expect(sanitizeCreature(c)).toEqual(c); });
  it('aparições são determinísticas e respeitam bioma e horário', () => {
    const c = DEFAULT_CREATURES.map((x) => ({ ...x, biomes: [{ slug: 'a', weight: 1 }] }));
    const run = () => { const out = []; for (let i = 0; i < 400; i++) out.push(...chunkSpawns(42, i % 20, Math.floor(i / 20), 16, c, () => 'a', () => false, false)); return out; };
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    expect(a.some((s) => s.slug === 'fagulha')).toBe(false); // só à noite
    let none = 0; for (let i = 0; i < 400; i++) none += chunkSpawns(42, i % 20, Math.floor(i / 20), 16, c, () => 'b', () => false, false).length;
    expect(none).toBe(0);
  });
  it('frequência das habilidades, drops e atributos por nível', () => {
    const lobo = DEFAULT_CREATURES[2];
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) { const s = pickCreatureSkill(lobo, i / 400)!; counts[s] = (counts[s] ?? 0) + 1; }
    expect(counts.golpe).toBe(200); expect(counts.investida).toBe(100);
    let k = 0; const rng = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    const d = rollDrops(lobo, rng); expect(d.every((x) => x.qty >= 1)).toBe(true);
    expect(creatureStatsAt(lobo, 5).vida).toBeGreaterThan(lobo.stats.vida);
  });
  it('aparência: original some, predefinições valem', () => {
    expect(sanitizeLook(LOOK_PRESETS[0].look)).toBeUndefined();
    expect(sanitizeLook({ hue: 999, tint: 'x' })!.hue).toBe(180);
  });
});
