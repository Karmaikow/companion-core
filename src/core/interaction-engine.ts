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

    const extractedMemory =
      this.extractMemory(
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

    if (extractedMemory) {
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

  private extractMemory(
    state: CompanionState,
    message: string
  ): {
    type: MemoryType;
    title: string;
    content: string;
    emotionalWeight: number;
  } | null {

    const normalized =
      message
        .toLowerCase()
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          ''
        );

    const companionName =
      state.profile.name;

    const companionPersonName =
      state.profile.companionOf.name;

    const preferredAddress =
      state.profile.companionOf
        .preferredAddress;

    const colorMatch =
      message.match(
        /(?:a\s+)?minha\s+cor\s+(?:favorita|preferida)\s+(?:é|e|:)?\s*(.+)$/i
      );

    if (colorMatch) {
      const color =
        colorMatch[1]
          .trim()
          .replace(/[.!?]+$/, '');

      if (color.length >= 3) {
        const alreadyKnown =
          state.memories.some(
            memory =>
              memory.title.toLowerCase().includes('cor favorita') &&
              memory.content.toLowerCase().includes(color.toLowerCase())
          );

        if (!alreadyKnown) {
          return {
            type:
              'IDENTITY_FORMING',

            title:
              `Cor favorita de ${companionPersonName}`,

            content:
              `${preferredAddress} contou que sua cor favorita é ${color}.`,

            emotionalWeight: 100
          };
        }
      }
    }

    const animalList = this.extractFavoriteAnimals(message);
    if (animalList) {
      const alreadyKnown = state.memories.some(memory =>
        memory.title.toLowerCase().includes('animal favorito') &&
        memory.content.toLowerCase().includes(animalList.toLowerCase())
      );
      if (!alreadyKnown) {
        return {
          type: 'IDENTITY_FORMING',
          title: `Animal favorito de ${companionPersonName}`,
          content: `${preferredAddress} contou que seus animais místicos favoritos são ${animalList}.`,
          emotionalWeight: 100
        };
      }
    }

    const likesMatch =
      message.match(
        /(?:eu\s+)?gosto\s+(?:muito\s+)?de\s+(.+)$/i
      );

    if (likesMatch) {
      const thing =
        likesMatch[1]
          .trim()
          .replace(/[.!?]+$/, '');

      if (
        thing.length >= 3 &&
        !normalized.includes(
          'voce gosta'
        )
      ) {
        return {
          type:
            'SIGNIFICANT',

          title:
            `${preferredAddress} gosta de ${thing}`,

          content:
            `${preferredAddress} contou a ${companionName} que gosta de ${thing}.`,

          emotionalWeight: 70
        };
      }
    }

    const identityMatch =
      message.match(
        /^eu\s+sou\s+(.+)$/i
      );

    if (identityMatch) {
      const statement =
        identityMatch[1]
          .trim()
          .replace(/[.!?]+$/, '');

      if (statement.length >= 3) {
        return {
          type:
            'IDENTITY_FORMING',

          title:
            `Algo sobre ${preferredAddress}`,

          content:
            `${preferredAddress} contou que ${statement}.`,

          emotionalWeight: 85
        };
      }
    }

    return null;
  }

  private extractFavoriteAnimals(message: string): string | null {
    const normalized = message
      .toLowerCase()
      .replace(/[.!?]+$/, '')
      .trim();

    const patterns = [
      /(?:meus|minhas)\s+animais?\s+(?:místicos?\s+)?favoritos?\s+(?:são|sao|e|:)\s+(.+)$/,
      /(?:meus|minhas)\s+bichos?\s+favoritos?\s+(?:sao|e|:)\s+(.+)$/,
      /^(.+?)\s+(?:são|sao)\s+meus\s+animais?\s+(?:místicos?\s+)?favoritos?$/,
      /^(.+?)\s+(?:são|sao)\s+meus\s+bichos?\s+favoritos?$/
    ];
    const match = patterns.map(pattern => normalized.match(pattern)).find(Boolean);
    const animals = match?.[1]?.trim();
    return animals && animals.length >= 3 ? animals : null;
  }
}
