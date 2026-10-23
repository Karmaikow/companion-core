import { describe, expect, it } from 'vitest';
import { masculinize } from '../rules/text.ts';
import { offlineTurn } from '../rules/offline.ts';
import { fillBark } from '../rules/barks.ts';
import { initialQuests } from '../rules/quests.ts';

describe('Companion "ele" fala de si no masculino', () => {
  it('troca os adjetivos sobre si', () => {
    expect(masculinize('Estou pronta para despertar!')).toBe('Estou pronto para despertar!');
    expect(masculinize('Fico tão animada e curiosa com isso.')).toBe('Fico tão animado e curioso com isso.');
    expect(masculinize('Obrigada por existir! Me sinto sozinha às vezes.')).toBe('Obrigado por existir! Me sinto sozinho às vezes.');
    expect(masculinize('Tô cansadinha depois da luta')).toBe('Tô cansadinho depois da luta');
    expect(masculinize('Curiosa? Calma? Corajosa?')).toBe('Curioso? Calmo? Corajoso?');
  });
  it('não mexe no que não é sobre si', () => {
    for (const t of ['A casa está linda hoje.', 'A sopa ficou pronta, quer?', 'Você é uma pessoa curiosa.', 'A Luna é minha amiga.', 'Que flor bonita!', 'Uma flor muito bonita.', 'Ela está tão animada.']) expect(masculinize(t)).toBe(t);
  });
  it('respondedor offline e falas curtas', () => {
    const q = initialQuests().map((x) => ({ ...x, status: 'done' as const }));
    expect(offlineTurn('oi tudo bem?', { name: 'Kai', pronoun: 'ele' }, q, 1).reply).not.toMatch(/\bpronta\b/);
    expect(fillBark('Estou ficando fraca, socorro!', {}, 'ele')).toBe('Estou ficando fraco, socorro!');
  });
});
