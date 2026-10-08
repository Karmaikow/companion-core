export type ConversationRole =
  | 'USER'
  | 'COMPANION'
  | 'SYSTEM';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: string;
}

export class ConversationHistory {
  private messages: ConversationMessage[] = [];

  constructor(
    private readonly maxMessages: number = 6
  ) {}

  add(
    role: ConversationRole,
    content: string
  ): ConversationMessage {
    const message: ConversationMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: new Date().toISOString()
    };

    this.messages.push(message);
    this.trim();

    return message;
  }

  getRecent(
    limit: number = this.maxMessages
  ): ConversationMessage[] {
    const safeLimit = Math.max(
      1,
      Math.min(limit, this.maxMessages)
    );

    return this.messages
      .slice(-safeLimit)
      .map(message => ({ ...message }));
  }

  clear(): void {
    this.messages = [];
  }

  size(): number {
    return this.messages.length;
  }

  private trim(): void {
    if (
      this.messages.length <=
      this.maxMessages
    ) {
      return;
    }

    this.messages =
      this.messages.slice(
        -this.maxMessages
      );
  }
}