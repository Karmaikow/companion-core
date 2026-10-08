export type InteractionRole =
  | 'USER'
  | 'COMPANION'
  | 'SYSTEM';

export interface InteractionMessage {
  id: string;

  role: InteractionRole;

  content: string;

  timestamp: string;

  companionId: string;

  metadata?: {
    emotionalTone?: string;
    importance?: number;
  };
}

export interface InteractionResult {
  message: InteractionMessage;

  effects: {
    coreXp: number;
    bond: number;
  };

  memoryCreated: boolean;

  eventId: string;
}