import type { Discoveries, QuestState, AwakeningCheck, GameConfig, IdentityContractV1, TurnXp, CompanionSetup, BestiaryEntry } from '@rules';

export interface MemoryRow { id: number; subject: 'player' | 'companion' | 'shared'; content: string; importance: number; source_event_ids: number[]; origin: string; created_at: string }
export interface DiaryRow { id: number; game_day: number; body: string; source_event_ids: number[]; created_at: string }
export interface InventoryRow { item_key: string; qty: number; meta: { label?: string; description?: string; quest?: string; [k: string]: unknown }; acquired_at: string }
export interface RecipeRow { id: number; name: string; description: string; ingredients: { name: string; where?: string }[]; created_at: string }
export interface TimelineRow { id: number; actor: string; kind: string; payload: Record<string, unknown>; created_at: string }

export interface CombatResult { entry: BestiaryEntry; first: boolean; analyzed: boolean; analyzedCount: number; milestone: number | null }

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
  visualJob?: { id: string; status: string; contract_version: number; created_at: string; artUrl?: string; model?: CompanionModelFiles } | null;
  secrets?: { key: string; achievedAt: string }[];
  recipes?: RecipeRow[];
  /** Análise de Partículas: criaturas derrotadas e partículas recolhidas */
  bestiary?: BestiaryEntry[];
  /** resultado de combat.kill */
  combat?: CombatResult;
  boost?: number;
  config?: GameConfig;
  provider?: string;
  turn?: { reply: string; mood: string; source: string; diag?: string; renamed?: string | null; secrets?: string[]; recipes?: string[]; xp: TurnXp; completed: string[]; rejected: { quest: string; reason: string }[]; newMemories: number; levelUp: number | null; awakeningReady: boolean };
  dream?: { dreamed: boolean; reason?: string; secrets?: string[] };
}

export interface Backend {
  readonly kind: 'online' | 'local';
  state(): Promise<Snapshot>;
  create(setup?: CompanionSetup): Promise<Snapshot>;
  chat(message: string): Promise<Snapshot>;
  dream(): Promise<Snapshot>;
  awaken(): Promise<Snapshot>;
  /** O Companion puxa assunto após um silêncio. */
  muse?(): Promise<Snapshot>;
  /** Uma criatura derrotada no mundo: bestiário, partículas e Memórias de Combate. */
  combatKill?(slug: string, level: number): Promise<Snapshot>;
  /** falas pela IA: estoque por evento, ou uma fala de momento com contexto (só online) */
  barks?(req: BarksRequest): Promise<{ lines?: Record<string, string[]>; line?: string | null }>;
  reset?(): Promise<void>;
  signOut?(): Promise<void>;
}

/** Modelo 3D aprovado na Fábrica: o .GLB do corpo e as animações (cada uma num .GLB do mesmo rig). */
export interface CompanionModelFiles { url: string; anims: { url: string; kind: string; name: string }[] }

export type BarksRequest =
  | { mode: 'bank'; events: string[]; recent?: string[] }
  | { mode: 'moment'; event: string; vars?: { m?: string; p?: string; n?: number; t?: number }; slug?: string };
