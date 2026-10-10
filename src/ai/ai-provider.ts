export interface AIContext {
    systemPrompt: string;
    firstMeeting?: boolean;
    /** Current favorite facts, separate from the bounded narrative retrieval. */
    preferenceMemories?: Array<{ title: string; content: string; importance: number }>;
    knownPerson?: { name: string; preferredAddress: string };
    companionPreferences?: { favoriteColor: string | null };
  
    identity: {
      name: string;
      companionId: string;
      evolutionStage: string;
    };
  
    personality: Record<string, number>;
  
    relationship: {
      value: number;
      type: string;
    };
  
    memories: Array<{
      title: string;
      content: string;
      importance: number;
    }>;
  
    recentMessages: Array<{
      role: 'USER' | 'COMPANION' | 'SYSTEM';
      content: string;
    }>;
  
    userMessage: string;
  }
  
  export interface AIProvider {
    readonly name: string;
    readonly activeProvider?: string;
  
    generateResponse(
      context: AIContext
    ): Promise<string>;
  }
