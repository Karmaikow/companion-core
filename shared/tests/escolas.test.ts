import { describe, expect, it } from 'vitest';
import {
  BREWS, DEFAULT_SKILLS, brewById, brewCheck, batchKey, schoolBlock, schoolSkills, studiesAt, cleanSchools,
  resolveElement, companionElement, COMPANION_ELEMENTS, lineageOf, kitFor,
} from '../rules';

describe('escolas de Áster', () => {
  it('Forja só para Taurinas; Veneno para Natureza ou Água', () => {
    expect(schoolBlock('forja', 'touro', ['fogo'])).toBeNull();
    expect(schoolBlock('forja', 'felino', ['fogo'])).toMatch(/Taurinas/);
    expect(schoolBlock('veneno', 'felino', ['natureza'])).toBeNull();
    expect(schoolBlock('veneno', 'touro', ['agua'])).toBeNull();
    expect(schoolBlock('veneno', 'felino', ['fogo'])).toMatch(/Natureza ou Água/);
    expect(studiesAt('veneno', ['veneno'], 'felino', ['agua'])).toBe(true);
    expect(studiesAt('veneno', [], 'felino', ['agua'])).toBe(false);
    expect(cleanSchools(['veneno', 'x', 'veneno', 'forja'])).toEqual(['veneno', 'forja']);
  });

  it('Veneno deixou de ser essência de Companion (vira Natureza)', () => {
    expect(COMPANION_ELEMENTS).not.toContain('veneno');
    expect(resolveElement('acho que é veneno')).toBe('natureza');
    expect(companionElement('veneno')).toBe('natureza');
    expect(lineageOf('felino', 'veneno', { essences: ['natureza'] }).essences).toEqual(['natureza']);
  });

  it('técnicas de veneno vêm da escola, não da essência', () => {
    const veneno = schoolSkills(DEFAULT_SKILLS, ['veneno']).map((s) => s.slug).sort();
    expect(veneno).toEqual(['cuspe-toxico', 'nevoa-venenosa']);
    expect(schoolSkills(DEFAULT_SKILLS, ['forja'])).toEqual([]);
    expect(kitFor(DEFAULT_SKILLS, { essence: 'natureza', body: 'biped', bond: 5 }).essence.map((s) => s.essence)).not.toContain('veneno');
  });

  it('bancada: consome as plantas e dá bônus com potência alta', () => {
    const r = brewById('pocao-vida-p')!;
    const fraca = batchKey('erva-orvalho-folha', { potencia: 'media', estabilidade: 'alta' });
    const forte = batchKey('erva-orvalho-folha', { potencia: 'alta', estabilidade: 'alta' });
    expect(brewCheck(r, 1, [{ key: fraca, qty: 2 }])).toMatchObject({ ok: false });
    expect(brewCheck(r, 1, [{ key: fraca, qty: 5 }])).toMatchObject({ ok: true, give: 2, bonus: false });
    const ok = brewCheck(r, 2, [{ key: fraca, qty: 5 }, { key: forte, qty: 6 }]);
    expect(ok).toMatchObject({ ok: true, give: 6, bonus: true, consume: [{ key: forte, qty: 6 }] });
    expect(brewCheck(r, 0, [{ key: forte, qty: 9 }])).toMatchObject({ ok: false });
    expect(BREWS.every((b) => b.inputs.length > 0)).toBe(true);
  });
});
