import { describe, it, expect } from 'vitest';
import { offlineTurn, companionPick } from '../rules/offline.ts';
import { initialQuests, type QuestState } from '../rules/quests.ts';

const st = (done: string[]): QuestState[] => initialQuests().map((q) => (done.includes(q.key) ? { ...q, status: 'done' } : q));
const base = { name: 'Lumi', pronoun: 'ela' as const };

describe('o Companion escolhe as próprias coisas', () => {
  it('perguntar a cor faz o Companion contar a dele', () => {
    const t = offlineTurn('Qual é a sua cor favorita?', base, st(['identity', 'traits']), 1, [], '');
    expect(t.discoveries[0]).toMatchObject({ quest: 'color', value: companionPick('color', base) });
  });
  it('um palpite também revela a cor escolhida pelo Companion (não a do palpite)', () => {
    const t = offlineTurn('Acho que sua cor é amarelo', base, st(['identity', 'traits']), 1, [], '');
    expect(t.discoveries[0].value).toBe(companionPick('color', base));
  });
  it('responder "qual?" ao gancho do sonho revela o sonho', () => {
    const t = offlineTurn('qual?', base, st(['identity', 'traits', 'color', 'species', 'essence', 'bond']), 1, [], 'Já sei qual é o meu primeiro sonho… quer saber?');
    expect(t.discoveries[0]?.quest).toBe('dream');
  });
  it('a essência segue as afinidades da forma', () => {
    const d = { ...base, form: 'touro' as never };
    const e = companionPick('essence', d);
    expect(['terra', 'fogo', 'luz', 'agua', 'vento', 'natureza', 'sombra', 'gelo', 'raio']).toContain(e);
  });
});
