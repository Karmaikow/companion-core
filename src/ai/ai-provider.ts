export interface AIContext {
    systemPrompt: string;
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
