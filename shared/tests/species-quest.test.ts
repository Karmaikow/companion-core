import { describe, expect, it } from 'vitest';
import { offlineTurn } from '../rules/offline.ts';
import { assistDiscoveries } from '../rules/engine.ts';
import { initialQuests, validateDiscovery } from '../rules/quests.ts';
import { classSuggestionLine, classSuggestionOrder, isAffirmative, nextClassSuggestion, suggestedClass } from '../rules/species.ts';
import { DEFAULT_CONFIG } from '../rules/config.ts';

const quests = initialQuests().map((q) => (['identity', 'color', 'traits'].includes(q.key) ? { ...q, status: 'done' as const } : q));
const d = { name: 'Lunaya', traits: ['protetora', 'persistente'], pronoun: 'ela' as const };

describe('Que criatura serei? — sugestão e confirmação', () => {
  it('sugere uma classe com pergunta e reconhece a sugestão', () => {
    const line = classSuggestionLine('touro');
    expect(line).toMatch(/Que tal eu me parecer um touro\?/);
    expect(suggestedClass(line)).toBe('touro');
    expect(suggestedClass('Eu gosto de touros.')).toBeNull();
  });
  it('a ordem favorece a classe que combina com os traços e gira ao recusar', () => {
    expect(classSuggestionOrder(['protetora'])[0]).toBe('touro');
    const first = nextClassSuggestion(d.traits, '');
    const second = nextClassSuggestion(d.traits, classSuggestionLine(first));
    expect(second).not.toBe(first);
  });
  it('"sim" depois da sugestão conclui a quest; "não" não conclui', () => {
    const last = classSuggestionLine('touro');
    const yes = offlineTurn('Sim! Adorei', d, quests, 1, [], last);
    expect(yes.discoveries).toEqual([expect.objectContaining({ quest: 'species', value: 'touro' })]);
    const r = validateDiscovery(yes.discoveries[0], { bondLevel: 1, cfg: DEFAULT_CONFIG });
    expect(r.ok && r.patch.form).toBe('touro');
    const no = offlineTurn('não, prefiro outra', d, quests, 1, [], last);
    expect(no.discoveries).toHaveLength(0);
    expect(suggestedClass(no.reply)).not.toBe('touro');
    expect(offlineTurn('sim', d, quests, 1, [], 'Que dia bonito hoje!').discoveries).toHaveLength(0);
  });
  it('com IA: a confirmação entra mesmo se a resposta do modelo não repetir o animal', () => {
    const model = { reply: 'Eba! Vou ficar forte e tranquila.', mood: 'feliz', meaningful: true, discoveries: [], memories: [] };
    const out = assistDiscoveries('pode ser!', model as never, d, quests, [], classSuggestionLine('touro'));
    expect(out.discoveries.map((x) => x.quest)).toEqual(['species']);
  });
  it('afirmativas', () => {
    for (const t of ['sim', 'Siiim!', 'pode ser', 'adorei', 'claro que sim']) expect(isAffirmative(t)).toBe(true);
    for (const t of ['não', 'talvez', 'prefiro gato', '']) expect(isAffirmative(t)).toBe(false);
  });
});
