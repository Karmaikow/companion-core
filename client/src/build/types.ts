import type { BalanceConfig, BuildState } from '@rules';

/** O que o servidor devolve da build (o estado autoritativo + o que o cliente precisa para a prévia). */
export interface BuildView extends BuildState { stage: number; budget: number; blockers: string[]; config: BalanceConfig; simulated?: boolean }
export interface BuildReply { build?: BuildView; applied?: boolean; pending?: boolean; reason?: string; cancelled?: boolean; saved?: string; repeat?: boolean }
