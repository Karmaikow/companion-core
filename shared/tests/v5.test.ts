import { describe, expect, it } from 'vitest';
import { parseCommand, bark, recordKill, dossier, combatMemoryLines, isAnalyzed, ANALYSIS_TARGET, DEFAULT_CREATURES, buildChatSystemPrompt, initialQuests } from '../rules/index.ts';

const places = ['Floresta Densa', 'Montanha Azul', 'Bosque Âmbar'];
const creatures = ['Bruma de Musgo', 'Fagulha', 'Lobinho de Geada'];
const P = (t: string) => parseCommand(t, { places, creatures });

describe('ordens', () => {
  it('ataque, fuga, parar, calma', () => {
    expect(P('Mayuna ataque esses monstros!')).toEqual({ kind: 'attack' });
    expect(P('pega eles!!')).toEqual({ kind: 'attack' });
    expect(P('Fuja Mayuna deu ruim!!')).toEqual({ kind: 'flee' });
    expect(P('socorro me ajude')).toEqual({ kind: 'flee' });
    expect(P('pare')).toEqual({ kind: 'stop' });
    expect(P('não ataque, fica calma')).toEqual({ kind: 'calm' });
  });
  it('caçar, ir, coletar', () => {
    expect(P('vai matar 30 monstros na Floresta Densa')).toEqual({ kind: 'hunt', count: 30, creature: null, place: 'Floresta Densa' });
    expect(P('derrote cinco lobinhos de geada')).toMatchObject({ kind: 'hunt', count: 5 });
    expect(P('mate a Fagulha')).toEqual({ kind: 'hunt', count: 1, creature: 'Fagulha', place: null });
    expect(P('caminhe até a montanha azul e me chame quando chegar')).toEqual({ kind: 'goto', place: 'Montanha Azul', call: true });
    expect(P('corra até o Bosque Âmbar')).toEqual({ kind: 'goto', place: 'Bosque Âmbar', call: false });
    expect(P('vai colher 40 folhas')).toEqual({ kind: 'gather', count: 40, what: 'folha' });
    expect(P('pega umas pedras')).toEqual({ kind: 'gather', count: 10, what: 'pedra' });
  });
  it('conversa normal não vira ordem', () => {
    expect(P('oi, tudo bem?')).toBeNull();
    expect(P('qual sua comida favorita?')).toBeNull();
    expect(P('vamos para casa um dia')).toBeNull();
  });
});

describe('falas', () => {
  it('troca os nomes e respeita o masculino', () => {
    expect(bark('see-new', { m: 'Fagulha' }, [], 0)).toContain('Fagulha');
    expect(bark('arrive', { p: 'Floresta Densa', you: 'Diego' }, [], 0)).toBe('Cheguei em Floresta Densa, Diego!');
    expect(bark('low-hp', {}, [], 0.4, 'ele')).not.toContain('fraca');
  });
});

describe('Análise de Partículas', () => {
  const bruma = DEFAULT_CREATURES[0];
  it('primeira derrota, análise completa e marco', () => {
    const now = '2026-10-22T00:00:00Z';
    let r = recordKill(null, [], { slug: bruma.slug, name: bruma.name, level: 1 }, now);
    expect(r.first).toBe(true); expect(r.analyzedNow).toBe(false);
    let e = r.entry;
    for (let i = 1; i < ANALYSIS_TARGET; i++) { r = recordKill(e, [e], { slug: bruma.slug, name: bruma.name, level: 1 }, now); e = r.entry; }
    expect(r.analyzedNow).toBe(true); expect(r.milestone).toBe(1); expect(isAnalyzed(e)).toBe(true);
    expect(recordKill(e, [e], { slug: bruma.slug, name: bruma.name, level: 1 }, now).analyzedNow).toBe(false);
  });
  it('a ficha revela em camadas', () => {
    expect(dossier(bruma, { particles: 1 }).archetype).toBeUndefined();
    expect(dossier(bruma, { particles: 2 }).archetype).toBeDefined();
    const full = dossier(bruma, { particles: 3 });
    expect(full.weakTo).toContain('Veneno'); expect(full.drops).toContain('Musgo macio');
  });
  it('vai para o prompt da IA, com o corpo depois do despertar', () => {
    const lines = combatMemoryLines([{ slug: bruma.slug, name: bruma.name, kills: 3, particles: 3, firstAt: 'a', lastAt: 'b' }], DEFAULT_CREATURES);
    expect(lines[0]).toContain('100%');
    const p = buildChatSystemPrompt({ discoveries: { name: 'Mayuna' }, quests: initialQuests(), bondLevel: 5, memories: [], history: [], gamePhase: 'dia', firstMeeting: false, body: { awakened: true, formLabel: 'humanoide da classe Dracônica' }, combat: lines });
    expect(p).toContain('não é mais uma esfera de luz'); expect(p).toContain('MEMÓRIAS DE COMBATE'); expect(p).not.toContain('Ainda não tem corpo');
  });
});
