import { describe, it, expect } from 'vitest';
import { DEFAULT_SKILLS } from '../rules/combat/skills';
import { SPELL_CATALOGUE } from '../rules/combat/catalogue';
import { skillIconSpec, iconSeed } from '../rules/combat/skillIcon';

const bySlug = (slug: string) => DEFAULT_SKILLS.find((s) => s.slug === slug)!;

describe('ícone gerado das habilidades', () => {
  it('dá um símbolo e uma cor válida a todas as habilidades do catálogo inicial', () => {
    for (const s of DEFAULT_SKILLS) {
      const spec = skillIconSpec(s);
      expect(spec.motif).toBeTruthy();
      expect(spec.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('escolhe o símbolo pelo que a habilidade é', () => {
    expect(skillIconSpec(bySlug('sopro-de-chamas')).motif).toBe('breath');
    expect(skillIconSpec(bySlug('lanca-de-gelo')).motif).toBe('spear');
    expect(skillIconSpec(bySlug('guarda')).motif).toBe('shield');
    expect(skillIconSpec(bySlug('bolha')).motif).toBe('bubble');
    expect(skillIconSpec(bySlug('faisca-encadeada')).motif).toBe('bolt');
    expect(skillIconSpec(bySlug('garra-sombria')).motif).toBe('claw');
    expect(skillIconSpec(bySlug('redemoinho')).motif).toBe('swirl');
    expect(skillIconSpec(bySlug('pedregulho')).motif).toBe('rock');
    expect(skillIconSpec(bySlug('cuspe-toxico')).motif).toBe('poison');
    expect(skillIconSpec(bySlug('polen-curativo'))).toMatchObject({ motif: 'leaf', heal: true });
  });

  it('usa o efeito do catálogo (nome e cor) quando a habilidade tem um', () => {
    const base = bySlug('golpe');
    const hourglass = SPELL_CATALOGUE.find((c) => c.id === 'hourglass')!;
    const spec = skillIconSpec({ ...base, slug: 'vfx-hourglass', name: 'Hourglass', vfx: { ...base.vfx, catalogue: 'hourglass' } });
    expect(spec).toMatchObject({ motif: 'hourglass', accent: hourglass.accent });
  });

  it('marca a forma de uso e mantém as partículas no mesmo lugar', () => {
    expect(skillIconSpec(bySlug('pedregulho')).mod).toBe('trail');
    expect(skillIconSpec(bySlug('brasas')).mod).toBe('ground');
    expect(skillIconSpec(bySlug('investida')).mod).toBe('speed');
    expect(iconSeed('golpe')).toBe(iconSeed('golpe'));
    expect(iconSeed('golpe')).not.toBe(iconSeed('bote'));
  });
});
