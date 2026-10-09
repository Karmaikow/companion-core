import { readableColor } from '../core/color-names.js';
import type { AIContext } from './ai-provider.js';
import { normalizeFact, preferenceFact, validPreference } from '../memory/memory-facts.js';

export function resolvePreferenceQuestion(context: AIContext): string | null {
  const q = normalizeFact(context.userMessage).replace(/\bvc\b/g, 'voce').replace(/\bpreferid([oa]s?)\b/g, 'favorit$1').replace(/favori+ta/g, 'favorita');
  if (/\b(historia|conto|finja|imagine|faz de conta)\b/.test(q)) return null;
  // A new declaration or a proposal needs a conversation, not recall of older facts.
  if (/\bminha cor (?:favorita|preferida)\s*(?:é|:)\s*\S/i.test(context.userMessage) || /\bminha cor favorita\s+e\s+(?!(?:(?:a|o)\s+)?(?:sua|seu)\b)/.test(q) || /\b(?:vamos definir|escolha|escolher|defina|talvez|que tal|poderia)\b/.test(q)) return null;
  const favorite = /\bfavorit[oa]s?\b/.test(q) || /qual animal voce prefere/.test(q);
  if (!favorite) return null;
  // Do not intercept statements of a new preference as recall questions.
  if (!context.userMessage.includes('?') && !/\b(qual|quais|diga|lembra|lembre|sabe|conte|tem|quero saber)\b/.test(q)) return null;
  const both = /\bnoss[oa]s?\b/.test(q) || (/\b(minha|minhas|meu|meus)\b/.test(q) && /\b(sua|suas|seu|seus|tua|teu)\b/.test(q));
  const user = both || /\b(minha|minhas|meu|meus)\b/.test(q);
  const companion = both || /\b(sua|suas|seu|seus|tua|teu|voce)\b/.test(q);
  if (!user && !companion) return null;
  const kinds: Array<{ slot: string; label: string }> = [];
  if (/\b(cor|cores)\b/.test(q)) kinds.push({ slot: 'cor favorita', label: 'Cor favorita' });
  if (/\b(animal|animais|bicho|bichos|passaro|passaros)\b/.test(q)) {
    kinds.push(/\bpassaros? misticos?\b/.test(q)
      ? { slot: 'passaro mistico favorito', label: 'Pássaro místico favorito' }
      : /\bmisticos?\b/.test(q)
        ? { slot: 'animais misticos favoritos', label: 'Animais místicos favoritos' }
        : { slot: 'animal favorito', label: 'Animais favoritos' });
  }
  if (!kinds.length) return null;
  const facts = [...(context.preferenceMemories ?? []), ...context.memories];
  const lookup = (slot: string, owner: string): string | null => {
    for (const memory of facts) {
      if (preferenceFact(memory)?.slot !== `${slot} de ${normalizeFact(owner)}`) continue;
      const value = memory.content.match(/(?:favorit[oa]s?\s+(?:é|e|são|sao|seria|seriam)|escolheu)\s+([^.!?]+)/i)?.[1]
        ?.replace(/^(?:a|o|as|os|um|uma)\s+/i, '').trim();
      if (!value || !validPreference(value)) continue;
      if (slot !== 'cor favorita' && /^(azul|azul-safira|verde|verde-musgo|vermelho|amarelo|roxo|preto|branco|rosa|laranja|cinza)$/.test(normalizeFact(value).replace(/ /g, '-'))) continue;
      return slot === 'cor favorita' ? readableColor(value) : value;
    }
    return null;
  };
  const lines: string[] = [];
  for (const kind of kinds) {
    if (user) {
      const value = lookup(kind.slot, context.knownPerson!.name);
      lines.push(value
        ? `Você — ${kind.label.toLowerCase()}: ${value}.`
        : `Você ainda não me contou: ${kind.label.toLowerCase()}.`);
    }
    if (companion) {
      const value = kind.slot === 'cor favorita'
        ? context.companionPreferences?.favoriteColor ?? null
        : lookup(kind.slot, context.identity.name);
      if (!value && kind.slot !== 'cor favorita' && !both && kinds.length === 1) return null; // Allow an explicit first choice.
      lines.push(value
        ? `Eu — ${kind.label.toLowerCase()}: ${value}.`
        : `Eu ainda não defini: ${kind.label.toLowerCase()}.`);
    }
  }
  return lines.join('\n');
}
