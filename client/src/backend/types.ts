import type { Discoveries, QuestState, AwakeningCheck, GameConfig, IdentityContractV1, TurnXp, CompanionSetup } from '@rules';

export interface MemoryRow { id: number; subject: 'player' | 'companion' | 'shared'; content: string; importance: number; source_event_ids: number[]; origin: string; created_at: string }
export interface DiaryRow { id: number; game_day: number; body: string; source_event_ids: number[]; created_at: string }
export interface InventoryRow { item_key: string; qty: number; meta: { label?: string; description?: string; quest?: string; [k: string]: unknown }; acquired_at: string }
export interface TimelineRow { id: number; actor: string; kind: string; payload: Record<string, unknown>; created_at: string }

export interface Snapshot {
  companion: null | {
    id: string;
    stage: 'particles' | 'awakened';
    discoveries: Discoveries;
    bondXp: number;
    bond: { level: number; xp: number; from: number; to: number; ratio: number };
    identityContract: IdentityContractV1 | null;
    awakenedAt: string | null;
    lastDreamAt: string | null;
    createdAt: string;
  };
  quests?: QuestState[];
  awakening?: AwakeningCheck;
  memories?: MemoryRow[];
  diary?: DiaryRow[];
  inventory?: InventoryRow[];
  timeline?: TimelineRow[];
  visualJob?: { id: string; status: string; contract_version: number; created_at: string } | null;
  config?: GameConfig;
  provider?: string;
  turn?: { reply: string; mood: string; source: string; diag?: string; renamed?: string | null; xp: TurnXp; completed: string[]; rejected: { quest: string; reason: string }[]; newMemories: number; levelUp: number | null; awakeningReady: boolean };
  dream?: { dreamed: boolean; reason?: string };
}

export interface Backend {
  readonly kind: 'online' | 'local';
  state(): Promise<Snapshot>;
  create(setup?: CompanionSetup): Promise<Snapshot>;
  chat(message: string): Promise<Snapshot>;
  dream(): Promise<Snapshot>;
  awaken(): Promise<Snapshot>;
  reset?(): Promise<void>;
  signOut?(): Promise<void>;
}
