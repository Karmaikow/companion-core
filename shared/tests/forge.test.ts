import { describe, it, expect } from 'vitest';
import { DEFAULT_SKILLS, sanitizeSkill, kitFor, affinity, expectedDamage, DEFAULT_CREATURES, sanitizeCreature, chunkSpawns, pickCreatureSkill, rollDrops, creatureStatsAt, sanitizeLook, LOOK_PRESETS } from '../rules/index.ts';

describe('Forja de Batalha', () => {
  it('o catálogo inicial é válido e sem slugs repetidos', () => {
    expect(new Set(DEFAULT_SKILLS.map((s) => s.slug)).size).toBe(DEFAULT_SKILLS.length);
    for (const s of DEFAULT_SKILLS) expect(sanitizeSkill(s)).toEqual(s);
  });
  it('todo Companion (qualquer essência e classe) recebe um kit completo no vínculo 8', () => {
    for (const essence of ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza'] as const)
      for (const species of ['serpente', 'passaro', 'felino', 'touro', 'mistica'] as const) {
        const k = kitFor(DEFAULT_SKILLS, { essence, body: 'biped', bond: 8, species });
        expect(k.basic).toBeTruthy(); expect(k.essence.length).toBe(2); expect(k.form).toBeTruthy(); expect(k.supreme).toBeTruthy();
        expect(k.essence.every((s) => s.essence === essence)).toBe(true);
      }
  });
  it('o vínculo abre os espaços aos poucos', () => {
    const k1 = kitFor(DEFAULT_SKILLS, { essence: 'fogo', body: 'biped', bond: 1, species: 'touro' });
    expect(k1.essence.map((s) => s.slug)).toEqual(['sopro-de-chamas']);
    expect(k1.form).toBeNull(); expect(k1.supreme).toBeNull();
    expect(k1.locked.map((s) => s.slug)).toContain('investida');
    expect(kitFor(DEFAULT_SKILLS, { essence: 'fogo', body: 'biped', bond: 5, species: 'touro' }).form?.slug).toBe('investida');
    expect(kitFor(DEFAULT_SKILLS, { essence: 'agua', body: 'biped', bond: 5, species: 'serpente' }).form?.slug).toBe('chicote-de-cauda');
    expect(kitFor(DEFAULT_SKILLS, { essence: null, body: 'biped', bond: 1, species: 'passaro' }).basic?.slug).toBe('faisca-de-essencia');
    expect(kitFor(DEFAULT_SKILLS, { essence: null, body: 'biped', bond: 1, species: 'touro' }).basic?.slug).toBe('golpe');
    // monstros continuam pelo corpo
    expect(kitFor(DEFAULT_SKILLS, { essence: null, body: 'quadruped', bond: 5 }).form?.slug).toBe('bote');
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

describe('Árvore de habilidades', () => {
  it('monta três galhos com os nós certos para a Mayuna (dracônica de água)', async () => {
    const { buildSkillTree, canSpend, validateAllocation, treeEffects, skillPoints } = await import('../rules/index.ts');
    const t = buildSkillTree(DEFAULT_SKILLS, { essence: 'agua', species: 'serpente' });
    const by = (id: string) => t.nodes.find((n) => n.id === id)!;
    expect(by('e1').skill).toBe('jato-dagua'); expect(by('e4').skill).toBe('bolha');
    expect(by('c2').skill).toBe('chicote-de-cauda'); expect(by('v5').skill).toBe('ressonancia');
    expect(skillPoints(5)).toBe(5);
    expect(canSpend(t, {}, 'e2', 5, 5)).toContain('Precisa');
    expect(canSpend(t, {}, 'e4', 1, 5)).toContain('vínculo');
    expect(canSpend(t, { e1: 1, e2: 2, c1: 2 }, 'c2', 5, 5)).toBe('Sem pontos livres.');
    expect(canSpend(t, {}, 'e1', 1, 1)).toBeNull();
    const v = validateAllocation(t, { e1: 1, e2: 9, e4: 1, v5: 1, c1: 1 }, 5, 5);
    expect(v).toEqual({ e1: 1, e2: 3, c1: 1 });
    const fx = treeEffects(t, { e1: 1, e2: 2, c1: 3 });
    expect(fx.skills.get('jato-dagua')).toBe(3);
    expect(fx.bonus.defesa).toBe(12);
  });
  it('toda essência × classe tem árvore com 5 fileiras em cada galho', async () => {
    const { buildSkillTree } = await import('../rules/index.ts');
    for (const essence of ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza'] as const)
      for (const species of ['serpente', 'passaro', 'felino', 'touro', 'mistica'] as const) {
        const t = buildSkillTree(DEFAULT_SKILLS, { essence, species });
        for (const b of ['essencia', 'classe', 'vinculo'] as const) expect(new Set(t.nodes.filter((n) => n.branch === b).map((n) => n.tier)).size).toBe(5);
        for (const n of t.nodes) for (const r of n.requires) expect(t.nodes.some((x) => x.id === r)).toBe(true);
      }
  });
});

describe('velocidade das classes', () => {
  it('Feral é a mais rápida, Taurina a mais lenta, sem classe = 1', async () => {
    const { SPECIES, speciesSpeed } = await import('../rules/index.ts');
    const v = Object.values(SPECIES).map((s) => s.speed);
    expect(speciesSpeed('felino')).toBe(Math.max(...v));
    expect(speciesSpeed('touro')).toBe(Math.min(...v));
    expect(speciesSpeed(null)).toBe(1);
  });
});

describe('atributos do monstro por nível', () => {
  const base = sanitizeCreature({ ...DEFAULT_CREATURES[0], stats: { vida: 100, poder: 10, defesa: 10, agilidade: 10, atkSpeed: 1 } })!;
  it('sem ajustes cresce 8% em vida/ataque/defesa e mantém o resto', () => {
    const s = creatureStatsAt(base, 2);
    expect(s.vida).toBe(108); expect(s.agilidade).toBe(10); expect(s.atkSpeed).toBe(1);
  });
  it('valores fixados: linha reta entre eles e crescimento depois do último', () => {
    const c = sanitizeCreature({ ...base, levelStats: { '5': { vida: 500 } }, growth: { vida: 0.1 } })!;
    expect(creatureStatsAt(c, 3).vida).toBe(300);
    expect(creatureStatsAt(c, 5).vida).toBe(500);
    expect(creatureStatsAt(c, 6).vida).toBe(550);
    expect(creatureStatsAt(c, 6).poder).toBe(Math.round(10 * Math.pow(1.08, 5)));
  });
  it('limpa valores fora dos limites', () => {
    const c = sanitizeCreature({ ...base, levelStats: { '99': { vida: 5 }, '3': { atkSpeed: 9, x: 1 } }, growth: { vida: 3 } })!;
    expect(c.levelStats).toEqual({ '3': { atkSpeed: 4 } });
    expect(c.growth?.vida).toBe(0.5);
  });
});
