import { describe, expect, it } from 'vitest';
import { validateSetup, TRAIT_GROUPS, traitLabel } from '../rules/index.ts';

const ok = { name: 'lumi', pronoun: 'ela', playerName: 'Diego', traits: ['curiosa', 'gentil', 'sanguinea'] };

describe('ritual de criação', () => {
  it('aceita setup válido e gera descobertas', () => {
    const r = validateSetup(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discoveries).toEqual({ name: 'Lumi', pronoun: 'ela', playerName: 'Diego', traits: ['curiosa', 'gentil', 'sanguínea'] });
  });
  it('usa o masculino quando escolhido', () => {
    const r = validateSetup({ ...ok, pronoun: 'ele', traits: ['brincalhona', 'protetora'] });
    expect(r.ok && r.discoveries.traits).toEqual(['brincalhão', 'protetor']);
    expect(traitLabel('curiosa', 'ele')).toBe('Curioso');
  });
  it('rejeita entradas inválidas', () => {
    expect(validateSetup({ ...ok, name: 'x' }).ok).toBe(false);
    expect(validateSetup({ ...ok, name: 'Claude' }).ok).toBe(false);
    expect(validateSetup({ ...ok, playerName: '' }).ok).toBe(false);
    expect(validateSetup({ ...ok, playerName: 'Lumi' }).ok).toBe(false);
    expect(validateSetup({ ...ok, traits: ['curiosa'] }).ok).toBe(false);
    expect(validateSetup({ ...ok, traits: ['curiosa', 'hacker'] }).ok).toBe(false);
    expect(validateSetup({ ...ok, traits: ['sanguinea', 'colerica'] }).ok).toBe(false);
    expect(validateSetup({ ...ok, traits: ['curiosa', 'criativa', 'gentil', 'serena', 'franca', 'paciente'] }).ok).toBe(false);
  });
  it('catálogo tem ids únicos', () => {
    const ids = TRAIT_GROUPS.flatMap((g) => g.options.map((o) => o.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
