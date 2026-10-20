import type { GameConfig } from './config.ts';
import { normalize, similarity } from './text.ts';

/** XP acumulado necessário para atingir o nível L (L >= 1). Sem teto. */
export function xpForLevel(level: number, cfg: GameConfig): number {
  if (level <= 1) return 0;
  return Math.round(cfg.levelBase * Math.pow(level - 1, cfg.levelExp));
}

export function levelForXp(xp: number, cfg: GameConfig): number {
  let level = 1;
  while (xpForLevel(level + 1, cfg) <= xp) level++;
  return level;
}

export function levelProgress(xp: number, cfg: GameConfig) {
  const level = levelForXp(xp, cfg);
  const from = xpForLevel(level, cfg);
  const to = xpForLevel(level + 1, cfg);
  return { level, xp, from, to, ratio: (xp - from) / (to - from) };
}

export interface TurnXpInput {
  message: string;
  /** Últimas mensagens do jogador (mais recentes primeiro), para detectar repetição. */
  recentPlayerMessages: string[];
  /** Mensagens significativas já registradas hoje (dia real UTC). */
  meaningfulToday: number;
  /** Avaliação do modelo: a mensagem teve conteúdo relacional/novo? */
  modelSaysMeaningful: boolean;
  /** Quests concluídas neste turno (já validadas). */
  newDiscoveries: number;
  /** Memórias novas (não duplicadas) neste turno. */
  newMemories: number;
}

export interface TurnXp { total: number; parts: { message: number; discoveries: number; memories: number }; reason: string; meaningful: boolean; boosted?: boolean }

const PRAISE_ONLY = /^(?:(?:voce e|vc e|tu e|que)?\s*(?:muito|mt|tao|super)?\s*(?:linda|lindo|fofa|fofo|incrivel|perfeita|perfeito|legal|top|demais|maravilhosa|maravilhoso|amo voce|te amo|gosto de voce)\s*)+$/;

/**
 * GDD 6: "Repetição artificial de elogios, diálogos, deslocamentos ou ações
 * não deve gerar XP ilimitado." Regras determinísticas:
 *  - mensagens curtas ou só elogios genéricos não geram XP de mensagem;
 *  - mensagens muito parecidas com as recentes não geram XP;
 *  - retorno decrescente ao longo do dia: base / (1 + n / softCap).
 * Descobertas só pontuam uma vez por quest (garantido pelo chamador).
 */
export function computeTurnXp(input: TurnXpInput, cfg: GameConfig): TurnXp {
  const n = normalize(input.message);
  let message = 0;
  let reason = 'ok';
  let meaningful = false;
  if (n.length < cfg.minMessageChars) reason = 'curta';
  else if (PRAISE_ONLY.test(n)) reason = 'elogio genérico';
  else if (input.recentPlayerMessages.some((m) => similarity(m, input.message) >= cfg.repetitionThreshold)) reason = 'repetição';
  else if (!input.modelSaysMeaningful) reason = 'sem conteúdo novo';
  else {
    meaningful = true;
    message = Math.max(1, Math.round(cfg.messageXp / (1 + input.meaningfulToday / cfg.dailySoftCap)));
  }
  const discoveries = input.newDiscoveries * cfg.discoveryXp;
  const memories = Math.min(input.newMemories, cfg.maxMemoryXpPerTurn) * cfg.memoryXp;
  return { total: message + discoveries + memories, parts: { message, discoveries, memories }, reason, meaningful };
}
