import type { Memory, JournalEntry } from '../models/types.js';

export function normalizeFact(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bpreferid([oa]s?)\b/g, 'favorit$1')
    .replace(/\bpassarinhos?\b/g, 'passaros')
    .replace(/\b(?:kkk+|rsrs+|haha+|tbm|tambem)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validPreference(value: string): boolean {
  const normalized = normalizeFact(value).replace(/^(?:a|o|as|os|um|uma)\s+/, '');
  return normalized.length >= 2 && !/\b(?:vc sabe|voce sabe|nao sei|nao lembro|nao tenho|ainda nao|qual|quem|talvez)\b/.test(normalized)
    && !/[?]/.test(value);
}

// Include the subject in every key. The person's likes must never deduplicate
// against the Companion's likes. Narrative/episodic memories are not facts.
export function preferenceFact(item: Pick<Memory, 'title' | 'content'>): { slot: string; value: string } | null {
  const title = normalizeFact(item.title);
  const content = normalizeFact(item.content);
  const favorite = title.match(/^(cor favorita|animal favorito|animais misticos favoritos|passaro mistico favorito) de (.+)$/);
  const legacyColor = title.match(/^a cor de (.+)$/);
  if (favorite || legacyColor) {
    const slot = favorite ? `${favorite[1]} de ${favorite[2]}` : `cor favorita de ${legacyColor![1]}`;
    const value = content.match(/(?:favorit[oa]s? (?:e|sao|seria|seriam)|escolheu) (.+)$/)?.[1]
      ?.replace(/^(?:a|o|as|os|um|uma)\s+/, '');
    return value && validPreference(value) ? { slot, value } : null;
  }
  const like = title.match(/^(.+?) gosta de (.+)$/);
  return like && validPreference(like[2])
    ? { slot: `${like[1]} gosta de`, value: like[2].replace(/^(?:a|o|as|os|um|uma)\s+/, '') }
    : null;
}

export function sameFact(a: Memory | JournalEntry, b: Pick<Memory, 'type' | 'title' | 'content'> | Pick<JournalEntry, 'type' | 'title' | 'content'>): boolean {
  if (a.type === 'EPISODIC' || b.type === 'EPISODIC' || a.type === 'STORY' || b.type === 'STORY') return false;
  const left = preferenceFact(a);
  const right = preferenceFact(b);
  if (left && right) return left.slot === right.slot && left.value === right.value;
  return a.type === b.type && normalizeFact(a.title) === normalizeFact(b.title)
    && normalizeFact(a.content) === normalizeFact(b.content);
}

// Keep historical assertions on disk, but use the latest value of each favorite
// in conversation. Repeated likes collapse; unrelated episodes remain intact.
export function currentMemories(memories: Memory[]): Memory[] {
  const seen = new Set<string>();
  return [...memories].reverse().sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .filter(memory => {
      if (memory.type === 'EPISODIC') return true;
      // Keep legacy fragments on disk, but do not feed unresolved pronouns to AI.
      if (/ gosta de /.test(normalizeFact(memory.title)) && /\b(ele|ela|eles|elas|isso|aquilo)\b/.test(normalizeFact(memory.content))) return false;
      const fact = preferenceFact(memory);
      if (!fact) return true;
      const key = fact.slot.includes(' gosta de') ? `${fact.slot}:${fact.value}` : fact.slot;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
