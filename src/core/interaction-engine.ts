import type {
  CompanionState,
  MemoryType
} from '../models/types.js';

import {
  CompanionCore
} from './core.js';

import {
  AIContextBuilder
} from '../ai/ai-context.js';

import {
  ResponseGuard
} from '../ai/response-guard.js';

import type {
  AIProvider
} from '../ai/ai-provider.js';

import {
  ConversationHistory
} from '../interaction/conversation-history.js';

export interface InteractionResult {
  response: string;
  guarded: boolean;
}

export class InteractionEngine {
  constructor(
    private readonly core: CompanionCore,
    private readonly ai: AIProvider,
    private readonly history: ConversationHistory
  ) {}

  async interact(
    userMessage: string
  ): Promise<InteractionResult> {

    const state =
      this.core.getState();

    const cleanMessage =
      userMessage.trim();

    if (!cleanMessage) {
      return {
        response:
          `Estou aqui, ${state.profile.companionOf.preferredAddress}. 💙`,
        guarded: false
      };
    }

    const normalizedMessage =
      cleanMessage.length > 2000
        ? cleanMessage.slice(0, 2000)
        : cleanMessage;

    const extractedMemories =
      this.extractMemories(
        state,
        normalizedMessage
      );

    const recentMessages =
      this.history.getRecent(6);

    const context =
      AIContextBuilder.build(
        state,
        normalizedMessage,
        recentMessages.map(
          message => ({
            role:
              message.role,

            content:
              message.content
          })
        )
      );

    let response =
      await this.ai.generateResponse(
        context
      );

    const guard =
      ResponseGuard.validate(
        response,
        state
      );

    const guarded =
      !guard.valid;

    if (!guard.valid) {
      response =
        guard.response;
    }

    const companionMemories = this.extractCompanionMemories(
      state,
      normalizedMessage,
      response
    );

    this.history.add(
      'USER',
      normalizedMessage
    );

    this.history.add(
      'COMPANION',
      response
    );

    const event =
      this.core.processEvent(
        'CONVERSATION',
        {
          userMessage:
            normalizedMessage,

          response
        },
        {
          coreXp: 5,

          combatXp: 0,

          bond: 1
        }
      );

    const memoriesToSave = [...extractedMemories, ...companionMemories];

    for (const extractedMemory of memoriesToSave) {
      this.core.addMemory(
        extractedMemory.type,

        extractedMemory.title,

        extractedMemory.content,

        extractedMemory.emotionalWeight,

        [event.id]
      );

      if (
        extractedMemory.type ===
        'IDENTITY_FORMING'
      ) {
        this.core.addJournal(
          'FOUNDATIONAL',

          extractedMemory.title,

          extractedMemory.content,

          [event.id]
        );
      }
    }

    return {
      response,
      guarded
    };
  }

  private extractMemories(
    state: CompanionState,
    message: string
  ): Array<{ type: MemoryType; title: string; content: string; emotionalWeight: number }> {
    const personName = state.profile.companionOf.name;
    const address = state.profile.companionOf.preferredAddress;
    const extracted: Array<{ type: MemoryType; title: string; content: string; emotionalWeight: number }> = [];

    // Only store an asserted value. A question such as "qual é minha cor?"
    // must never be extracted as the answer "vc sabe".
    const colorMatch = message.match(/(?:a\s+)?minha\s+cor\s+(?:favorita|preferida)\s*(?:é|e|:)\s*(.+)$/i);
    const color = colorMatch ? this.cleanPreferenceValue(colorMatch[1]) : '';
    if (color.length >= 3) {
      const title = `Cor favorita de ${personName}`;
      if (!state.memories.some(memory => memory.title.toLowerCase() === title.toLowerCase() && memory.content.toLowerCase().includes(color.toLowerCase()))) {
        extracted.push({ type: 'IDENTITY_FORMING', title, content: `${address} contou que sua cor favorita é ${color}.`, emotionalWeight: 100 });
      }
    }

    for (const fact of this.extractFavoriteAnimals(message, personName, address)) {
      const alreadyKnown = state.memories.some(memory => memory.title.toLowerCase() === fact.title.toLowerCase() && memory.content.toLowerCase().includes(fact.value.toLowerCase()));
      if (!alreadyKnown) extracted.push({ type: 'IDENTITY_FORMING', ...fact, emotionalWeight: 100 });
    }

    for (const thing of this.extractDeclaredLikes(message)) {
      const title = `${address} gosta de ${thing}`;
      const alreadyKnown = state.memories.some(memory =>
        memory.title.toLowerCase() === title.toLowerCase() && memory.content.toLowerCase().includes(thing.toLowerCase())
      );
      if (!alreadyKnown) {
        extracted.push({ type: 'SIGNIFICANT', title, content: `${address} contou que gosta de ${thing}.`, emotionalWeight: 70 });
      }
    }

    const identityMatch = message.match(/^eu\s+sou\s+(.+)$/i);
    if (identityMatch) {
      const statement = identityMatch[1].split(/[,.!?]/, 1)[0].trim().replace(/^(?:o|a)\s+/i, '');
      const knownName = statement.toLowerCase() === personName.toLowerCase() || statement.toLowerCase() === address.toLowerCase();
      if (statement.length >= 3 && !knownName) extracted.push({ type: 'IDENTITY_FORMING', title: `Algo sobre ${address}`, content: `${address} contou que ${statement}.`, emotionalWeight: 85 });
    }
    return extracted;
  }

  private cleanPreferenceValue(value: string): string {
    return value.trim()
      .replace(/\s*(?::d|:p|;)\s*$/i, '')
      .replace(/\s*(?:kkk+|haha+|rsrs+|rss+)[\s.!?,:;]*$/i, '')
      .replace(/\s+(?:tbm|tamb[eé]m)\s*$/i, '')
      .replace(/[.!?,:;]+$/, '')
      .replace(/^(?:a|o|as|os|um|uma)\s+/i, '')
      .trim();
  }

  private extractDeclaredLikes(text: string): string[] {
    const clauses = (text.match(/[^.!?]+[.!?]?/g) ?? [])
      .flatMap(sentence => sentence.split(/,\s*/))
      .filter(clause => !clause.trim().endsWith('?'))
      .map(clause => clause.replace(/[.!]+$/, ''));
    const likes: string[] = [];
    for (const clause of clauses) {
      const match = clause.trim().replace(/^(?:e|mas|tamb[eé]m|tbm)\s+/i, '').match(/^(?:eu\s+)?(?:gosto(?:\s+muito)?\s+de|adoro|amo(?:\s+muito)?|prefiro)\s+(.+?)\s*$/i);
      if (!match) continue;
      let value = this.cleanPreferenceValue(match[1]);
      value = value.replace(/^observar\s+/i, '').replace(/^de\s+/i, '').trim();
      if (value.length >= 2 && !likes.some(existing => existing.toLowerCase() === value.toLowerCase())) likes.push(value);
    }
    return likes;
  }

  private extractCompanionMemories(
    state: CompanionState,
    question: string,
    response: string
  ): Array<{ type: MemoryType; title: string; content: string; emotionalWeight: number }> {
    const favorite = this.extractCompanionPreference(state, question, response);
    if (favorite) return [favorite];

    const name = state.profile.name;
    return this.extractDeclaredLikes(response)
      .filter(thing => !state.memories.some(memory =>
        memory.title.toLowerCase() === `${name} gosta de ${thing}`.toLowerCase()
      ))
      .map(thing => ({
        type: 'SIGNIFICANT' as const,
        title: `${name} gosta de ${thing}`,
        content: `${name} disse que gosta de ${thing}.`,
        emotionalWeight: 75
      }));
  }

  private extractFavoriteAnimals(message: string, personName: string, address: string): Array<{title: string; content: string; value: string}> {
    const raw = message.toLowerCase().replace(/\bpreferid([oa]s?)\b/g, 'favorit$1');
    const facts: Array<{title: string; content: string; value: string}> = [];
    const singular = raw.match(/\b(?:meu|minha)\s+(?:animal|bicho)\s+favorito\s*(?:(?:também|tambem|tbm)\s*)?(?:é|e|são|sao|seria|seriam|:)\s+([^,.!?]+)/i)
      ?? raw.match(/\banimais?\s+[^,.!?]*[,;]\s*(?:o\s+)?meu\s+favorito\s*(?:é|e|seria|seriam)\s+([^,.!?]+)/i);
    const plural = raw.match(/\b(?:meus|minhas)\s+(?:animais|bichos)\s+(?:místicos?\s+)?favoritos\s*(?:são|sao|seriam|:)\s+([^,.!?]+)/i)
      ?? raw.match(/\b([^,.!?]+?)\s+(?:são|sao|seriam)\s+meus\s+(?:animais|bichos)\s+(?:místicos?\s+)?favoritos\b/i);
    const mythical = raw.match(/\banimais\s+místicos?\s+(?:com\s+certeza|favoritos?\s*(?:são|sao|e|:))\s+([^,.!?]+)/i);

    const one = singular?.[1] ? this.cleanPreferenceValue(singular[1]) : '';
    const many = plural?.[1] ? this.cleanPreferenceValue(plural[1]) : '';
    const myth = mythical?.[1] ? this.cleanPreferenceValue(mythical[1]) : '';
    if (one.length >= 2) facts.push({ title: `Animal favorito de ${personName}`, content: `${address} contou que seu animal favorito é ${one}.`, value: one });
    else if (many.length >= 2) facts.push({ title: `Animal favorito de ${personName}`, content: `${address} contou que seus animais favoritos são ${many}.`, value: many });
    if (myth.length >= 2) facts.push({ title: `Animais místicos favoritos de ${personName}`, content: `${address} contou que seus animais místicos favoritos são ${myth}.`, value: myth });
    return facts;
  }

  private extractCompanionPreference(state: CompanionState, question: string, response: string): { type: MemoryType; title: string; content: string; emotionalWeight: number } | null {
    const normalizedQuestion = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bpreferid([oa]s?)\b/g, 'favorit$1');
    const rawResponse = response.toLowerCase();
    const asksMysticBird = /passaro mistico favorito/.test(normalizedQuestion);
    const asksAnimal = /(?:seu|teu) animal favorito/.test(normalizedQuestion);
    if (!asksMysticBird && !asksAnimal) return null;

    const name = state.profile.name;
    const title = asksMysticBird ? `Pássaro místico favorito de ${name}` : `Animal favorito de ${name}`;
    if (state.memories.some(memory => memory.title.toLowerCase() === title.toLowerCase())) return null;

    const declaredLikes = this.extractDeclaredLikes(response);
    const match = asksMysticBird
      ? rawResponse.match(/(?:imaginei (?:um|uma)|meu pássaro místico favorito (?:seria|é|e))\s+([^.!?]+)/i)
      : null;
    const value = asksMysticBird
      ? (match?.[1] ? this.cleanPreferenceValue(match[1]) : '')
      : (declaredLikes[0] ?? this.cleanPreferenceValue(rawResponse.match(/(?:meu animal favorito (?:é|e|seria)|eu escolheria)\s+(?:um|uma|os|as)?\s*([^.!?]+)/i)?.[1] ?? ''));
    if (value.length < 2 || /^(?:ainda nao|nao sei|nao tenho)/.test(value)) return null;

    return {
      type: 'IDENTITY_FORMING',
      title,
      content: asksMysticBird
        ? `${name} imaginou que seu pássaro místico favorito seria ${value}.`
        : `${name} escolheu ${value}.`,
      emotionalWeight: 90
    };
  }
}
