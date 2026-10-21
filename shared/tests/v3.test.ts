import { describe, expect, it } from 'vitest';
import {
  evaluateSecrets, isQuestionAboutCompanion, refugeFeatures, initialQuests, fixMemorySubject, sameMemory, newRecipes,
  parseModelTurn, applyTurn, buildChatSystemPrompt, DEFAULT_CONFIG as cfg,
} from '../rules/index.ts';

const done = (...keys: string[]) => initialQuests().map((q) => ({ ...q, status: (keys.includes(q.key) ? 'done' : 'active') as 'done' | 'active' }));

describe('quests secretas', () => {
  it('detecta sinais determinísticos e não repete', () => {
    expect(evaluateSecrets({ message: 'oi', phase: 'madrugada' }, new Set())).toEqual(['lua']);
    expect(evaluateSecrets({ message: 'oi', phase: 'madrugada' }, new Set(['lua']))).toEqual([]);
    expect(evaluateSecrets({ recipesTotal: 1 }, new Set())).toEqual(['chef']);
    expect(evaluateSecrets({ message: 'Muito obrigado por hoje, Lumi', phase: 'tarde' }, new Set())).toEqual(['gratidao']);
    expect(evaluateSecrets({ message: 'x'.repeat(300), meaningful: true }, new Set())).toEqual(['contador']);
    expect(evaluateSecrets({ renamed: true, diaryTotal: 1, questionsAboutCompanion: 5 }, new Set())).toEqual(['rebatizado', 'sonhador', 'curioso']);
  });
  it('reconhece perguntas sobre o Companion', () => {
    expect(isQuestionAboutCompanion('vc gosta de café?')).toBe(true);
    expect(isQuestionAboutCompanion('qual a sua cor?')).toBe(true);
    expect(isQuestionAboutCompanion('choveu hoje?')).toBe(false);
  });
});

describe('refúgio que cresce', () => {
  it('começa só com o altar', () => {
    const f = refugeFeatures({}, initialQuests(), 1);
    expect(f).toMatchObject({ lanterns: 0, crystals: false, shelves: 0, element: null, nest: false, window: false, plants: 0, cauldron: false });
  });
  it('acrescenta elementos conforme o vínculo e as quests', () => {
    const f = refugeFeatures({ color: '#4cc46a', element: 'agua' }, done('color', 'essence', 'bond', 'dream'), 5, { recipes: 1 });
    expect(f).toMatchObject({ lanterns: 4, crystals: true, shelves: 2, element: 'agua', nest: true, window: true, plants: 1, cauldron: true });
    expect(refugeFeatures({ element: 'natureza' }, done('essence'), 1).plants).toBe(3);
  });
});

describe('memórias', () => {
  const d = { name: 'Mayuna', playerName: 'Karmaikow' };
  it('corrige o sujeito pelos nomes', () => {
    expect(fixMemorySubject({ subject: 'companion', content: 'Karmaikow gosta de café', importance: 3 }, d).subject).toBe('player');
    expect(fixMemorySubject({ subject: 'player', content: 'Mayuna adora pão de luz', importance: 3 }, d).subject).toBe('companion');
    expect(fixMemorySubject({ subject: 'player', content: 'Karmaikow e Mayuna inventaram uma receita', importance: 3 }, d).subject).toBe('shared');
  });
  it('reconhece memórias repetidas com outras palavras', () => {
    expect(sameMemory('Karmaikow gosta de café', 'Karmaikow gosta muito de café quente')).toBe(true);
    expect(sameMemory('Karmaikow gosta de café', 'Mayuna tem medo de trovão')).toBe(false);
  });
  it('aplica no turno: dedupe e sujeito', () => {
    const plan = applyTurn({
      playerMessage: 'gosto muito de café quente de manhã', discoveries: d, quests: initialQuests(), bondXp: 0,
      existingMemories: [{ subject: 'player', content: 'Karmaikow gosta de café', importance: 3 }], recentPlayerMessages: [], meaningfulToday: 0, cfg,
      model: { reply: '', meaningful: true, mood: 'feliz', discoveries: [], memories: [
        { subject: 'companion', content: 'Karmaikow gosta muito de café quente', importance: 3 },
        { subject: 'companion', content: 'Karmaikow acorda cedo', importance: 3 },
      ] },
    });
    expect(plan.newMemories).toEqual([{ subject: 'player', content: 'Karmaikow acorda cedo', importance: 3 }]);
  });
});

describe('receitas e impulso', () => {
  it('lê receitas do modelo e ignora as já anotadas', () => {
    const t = parseModelTurn('{"reply":"Anotado!","recipes":[{"name":"Pão de Luz","description":"brilha na boca","ingredients":[{"name":"cristais de água","where":"lago da névoa"},"pó de estrela"]},{"name":"x","ingredients":[]}]}');
    expect(t.recipes).toHaveLength(1);
    expect(t.recipes![0].ingredients[0]).toEqual({ name: 'cristais de água', where: 'lago da névoa' });
    expect(newRecipes(t.recipes!, ['pão de luz'])).toHaveLength(0);
  });
  it('impulso dobra o XP da mensagem e é consumido', () => {
    const plan = applyTurn({ playerMessage: 'hoje fui ver o mar com minha irmã', discoveries: {}, quests: initialQuests(), bondXp: 0, existingMemories: [], recentPlayerMessages: [], meaningfulToday: 0, cfg, boost: 2,
      model: { reply: '', meaningful: true, mood: 'feliz', discoveries: [], memories: [] } });
    expect(plan.xp.parts.message).toBe(cfg.messageXp * 2);
    expect(plan.xp.boosted).toBe(true);
    expect(plan.boostLeft).toBe(1);
  });
});

describe('prompt v3', () => {
  it('explica pronomes, mundo de fantasia e limita o uso do nome', () => {
    const p = buildChatSystemPrompt({ discoveries: { name: 'Mayuna', playerName: 'Karmaikow', playerPronoun: 'ele' }, quests: initialQuests(), bondLevel: 2, memories: [], history: [], gamePhase: 'noite', firstMeeting: false, recipes: ['Pão de Luz'] });
    expect(p).toContain('"cria um apelido para mim" = um apelido para Karmaikow');
    expect(p).toContain('mundo de fantasia');
    expect(p).toContain('nunca para começar a frase');
    expect(p).toContain('masculino (ex.: "você está animado"');
    expect(p).toContain('Pão de Luz');
  });
});

describe('ingredientes', () => {
  it('separa o lugar quando vem grudado no nome', async () => {
    const { splitIngredient } = await import('../rules/index.ts');
    expect(splitIngredient({ name: 'Farinha de poeira de estrela (colhida na névoa do vale)' })).toEqual({ name: 'Farinha de poeira de estrela', where: 'colhida na névoa do vale' });
    expect(splitIngredient({ name: 'Mel de luz — pétalas da flor-lua' })).toEqual({ name: 'Mel de luz', where: 'pétalas da flor-lua' });
    expect(splitIngredient({ name: 'Sal de prata', where: 'pedras do rio' })).toEqual({ name: 'Sal de prata', where: 'pedras do rio' });
  });
});

describe('forma no modo offline', () => {
  it('guarda só a criatura descrita', () => {
    const q = initialQuests().map((s) => ({ ...s, status: (['identity', 'traits', 'color'].includes(s.key) ? 'done' : 'active') as 'done' | 'active' }));
    expect(offlineTurnFn('Eu imagino você como uma raposa com asas', q)).toEqual({ quest: 'species', value: 'raposa com asas' });
    expect(offlineTurnFn('dragão', q)).toEqual({ quest: 'species', value: 'dragão' });
  });
  it('prompt de arte usa o contrato', async () => {
    const { buildArtPrompt, buildIdentityContract } = await import('../rules/index.ts');
    const c = buildIdentityContract('x', { name: 'Mayuna', species: 'raposa com asas', form: 'felino', color: '#64834b', traits: ['curiosa', 'gentil'], element: 'natureza', playerAddress: 'Di', dream: 'voar' }, 5);
    const a = buildArtPrompt(c);
    expect(a.prompt).toContain('"Mayuna"');
    expect(a.prompt).toContain('raposa com asas');
    expect(a.prompt).toContain('#64834b');
    expect(a.summaryPt).toContain('Natureza');
    expect(a.body).toBe('quadruped'); // raposa tem quatro patas
    const d = buildArtPrompt({ ...c, species: { ...c.species, family: 'serpente', description: 'Um dragão de Luz parece bom' } });
    expect(d.body).toBe('quadruped');
    expect(d.prompt).toContain('four-legged');
    expect(buildArtPrompt({ ...c, species: { ...c.species, family: 'mistica', description: 'uma fada de cristal' } }).body).toBe('biped');
    expect(buildArtPrompt({ ...c, species: { ...c.species, family: 'passaro', description: 'uma coruja' } }).body).toBe('avian');
  });
});
import { offlineTurn as _ot } from '../rules/index.ts';
function offlineTurnFn(msg: string, q: ReturnType<typeof initialQuests>) { return _ot(msg, { name: 'Lumi' }, q, 1).discoveries[0]; }
