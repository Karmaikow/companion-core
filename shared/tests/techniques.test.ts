import { describe, it, expect } from 'vitest';
import { WEAPON_TECHNIQUES, INFUSIONS, ELEMENTS, infuse, techniquesFor, lockedTechniques, sanitizeSkill, skillFits, kitFor, DEFAULT_SKILLS, type Element } from '../rules/index';

describe('técnicas de arma', () => {
  it('espada, faca, maça, lança, arco, varinha têm 4 técnicas cada; cajado tem 3; físicas exceto cajado e varinha; slugs únicos', () => {
    for (const w of ['espada', 'faca', 'maca', 'lanca', 'arco', 'varinha'] as const) expect(WEAPON_TECHNIQUES.filter((t) => t.weapon === w)).toHaveLength(4);
    expect(WEAPON_TECHNIQUES.filter((t) => t.weapon === 'cajado')).toHaveLength(3);
    expect(new Set(WEAPON_TECHNIQUES.map((t) => t.slug)).size).toBe(WEAPON_TECHNIQUES.length);
    for (const t of WEAPON_TECHNIQUES) { expect(t.slot).toBe('technique'); expect(t.modality).toBe((t.weapon === 'cajado' || t.weapon === 'varinha') ? 'magica' : 'fisica'); expect(t.essence).toBeNull(); }
  });

  it('toda essência tem infusão', () => {
    for (const el of Object.keys(ELEMENTS) as Element[]) expect(INFUSIONS[el]).toBeTruthy();
  });

  it('infundir dá o elemento, o estilo e o estado da essência; o estado próprio da técnica vence', () => {
    const tiro = WEAPON_TECHNIQUES.find((t) => t.slug === 'arco-tiro-preciso')!;
    const fogo = infuse(tiro, 'fogo');
    expect(fogo.essence).toBe('fogo');
    expect(fogo.vfx.style).toBe('chamas');
    expect(fogo.status?.key).toBe('queimando');
    expect(infuse(tiro, 'vento').power).toBeGreaterThan(tiro.power);
    const ascendente = WEAPON_TECHNIQUES.find((t) => t.slug === 'espada-golpe-ascendente')!;
    expect(infuse(ascendente, 'veneno').status?.key).toBe('atordoado');
    expect(infuse(tiro, null)).toBe(tiro);
  });

  it('só aparecem com a arma do tipo na mão, abertas pelo vínculo', () => {
    expect(techniquesFor([], null, 'fogo', 20)).toEqual([]);
    // maca agora tem técnicas
    const macaTecs = techniquesFor([], 'maca', 'fogo', 20);
    expect(macaTecs.length).toBe(4);
    expect(macaTecs[0].weapon).toBe('maca');
    const cedo = techniquesFor([], 'espada', 'gelo', 1);
    expect(cedo.map((t) => t.slug)).toEqual(['espada-corte-giratorio']);
    expect(cedo[0].essence).toBe('gelo');
    expect(techniquesFor([], 'arco', 'gelo', 20)).toHaveLength(4);
    expect(lockedTechniques([], 'espada', 1)).toHaveLength(3);
  });

  it('a da Forja vale no lugar da que vem com o jogo (mesmo slug)', () => {
    const forged = sanitizeSkill({ ...WEAPON_TECHNIQUES[0], power: 99 })!;
    expect(forged.weapon).toBe('espada');
    expect(forged.slot).toBe('technique');
    const got = techniquesFor([forged], 'espada', null, 1);
    expect(got).toHaveLength(1);
    expect(got[0].power).toBe(99);
  });

  it('não entram na árvore nem no kit de essência', () => {
    for (const t of WEAPON_TECHNIQUES) expect(skillFits(t, null, 'biped', 'touro')).toBe(false);
    const kit = kitFor([...DEFAULT_SKILLS, ...WEAPON_TECHNIQUES], { essence: 'fogo', body: 'biped', bond: 20, species: 'touro' });
    expect([kit.basic, ...kit.essence, kit.form, kit.supreme].some((s) => s?.slot === 'technique')).toBe(false);
  });
});
