import type {
    Memory,
    MemoryType,
    CompanionState
  } from '../models/types.js';
  
  export interface RetrievedMemory {
    memory: Memory;
    score: number;
  }
  
  export class MemoryRetriever {
  
    static retrieve(
      memories: Memory[],
      query: string,
      limit = 5,
      state?: CompanionState
    ): RetrievedMemory[] {
  
      if (!memories.length) {
        return [];
      }
  
      const normalizedQuery = this.normalize(query);
  
      if (!normalizedQuery) {
        return [];
      }
  
      const queryTokens = this.tokenize(normalizedQuery);
  
      const results = memories.map(memory => {
  
        const title = this.normalize(memory.title);
        const content = this.normalize(memory.content);
  
        const titleTokens = this.tokenize(title);
        const contentTokens = this.tokenize(content);
  
        let score = 0;
  
        score += this.countMatches(
          queryTokens,
          titleTokens
        ) * 10;
  
        score += this.countMatches(
          queryTokens,
          contentTokens
        ) * 4;
  
        score += this.getMemoryTypeBonus(memory.type);
  
        score += memory.emotionalWeight * 0.08;
  
        /*
         * Dá um pequeno peso adicional para memórias
         * diretamente relacionadas à identidade da Companion
         * ou da pessoa que a acompanha.
         */
        if (state) {
  
          const companionName =
            this.normalize(state.profile.name);
  
          const companionOf =
            this.normalize(
              state.profile.companionOf.name
            );
  
          const combined =
            `${title} ${content}`;
  
          if (
            companionName &&
            combined.includes(companionName)
          ) {
            score += 4;
          }
  
          if (
            companionOf &&
            combined.includes(companionOf)
          ) {
            score += 6;
          }
        }
  
        return {
          memory,
          score
        };
  
      });
  
      return results
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, limit));
    }
  
    private static normalize(
      text: string
    ): string {
  
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  
    private static tokenize(
      text: string
    ): string[] {
  
      return text
        .split(/\s+/)
        .filter(word =>
          word.length >= 3 &&
          !this.isStopWord(word)
        );
    }
  
    private static countMatches(
      queryTokens: string[],
      memoryTokens: string[]
    ): number {
  
      const memorySet =
        new Set(memoryTokens);
  
      return queryTokens.filter(
        token => memorySet.has(token)
      ).length;
    }
  
    private static getMemoryTypeBonus(
      type: MemoryType
    ): number {
  
      switch (type) {
  
        case 'IDENTITY_FORMING':
          return 12;
  
        case 'SIGNIFICANT':
          return 6;
  
        case 'EPISODIC':
        default:
          return 2;
      }
    }
  
    private static isStopWord(
      word: string
    ): boolean {
  
      return new Set([
        'que',
        'uma',
        'umas',
        'uns',
        'com',
        'para',
        'por',
        'dos',
        'das',
        'nos',
        'nas',
        'sobre',
        'isso',
        'essa',
        'esse',
        'como',
        'onde',
        'quando',
        'qual',
        'quais',
        'tem',
        'tenho',
        'tinha',
        'era',
        'foi',
        'ser',
        'sou',
        'nao',
        'não',
        'voce',
        'você',
        'muito',
        'muita',
        'alguma',
        'algum',
        'coisa',
        'quer',
        'sabe',
        'lembra',
        'lembrar',
        'lembro',
        'pode',
        'poderia',
        'estou',
        'esta',
        'está'
      ]).has(word);
    }
  }