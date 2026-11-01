import type { TuneResult } from '@rules';
/** O que o servidor (ou o modo offline simulado) devolve sobre o Ecos da Terra. */
import type { EcosConfig, EnvironmentalClue, ToolKey } from '@rules';

export interface ChainView { step: number; choice?: 'extrair' | 'preservar'; completedAt?: string; at?: string }
export interface EcosView {
  serverNow: number;
  profile: { tools: ToolKey[]; seen: string[]; knownMaterials: string[]; techniques: string[]; chain: Record<string, ChainView> };
  bag: { key: string; qty: number }[];
  nodes: Record<string, { amount: number; at: number }>;
  sites: { id: string; stored: number; at: number; caredAt: number | null; createdAt: string; now: number }[];
  project: { id: string; stage: number; progress: number[]; startedAt: number; completedAt: string | null; goals: number[]; mine: number; mineTotal: number; capTotal: number };
  config: EcosConfig;
  /** modo offline: tudo simulado neste aparelho, sem valor na economia online */
  simulated?: boolean;
}
export interface ClueGain { chain: string; step: number; title: string; evidence: EnvironmentalClue; knowledge: string | null }
export interface EcosReply {
  ecos?: EcosView;
  started?: { request: string; startedAt: number; status: string; result: unknown; seconds: number };
  gather?: { ok: boolean; reason: string | null; message: string | null; wait: number | null; items: { key: string; qty: number }[]; repeat: boolean; tune?: TuneResult };
  clue?: ClueGain | null;
  chosen?: { choice: string; gave: { key: string; qty: number }[]; site: string | null };
  crafted?: { recipe: string; label: string; quality: string; kind: string };
  contributed?: { accepted: number; stageDone: boolean; requested: number };
  harvested?: { key: string; qty: number }[];
  cared?: boolean;
  dropped?: { key: string; qty: number };
  bond?: { xp: number; levelUp: number | null } | null;
}
