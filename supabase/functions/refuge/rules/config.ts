/**
 * Valores de balanceamento do MVP 1. Todos são hipóteses do GDD (seção 5.1 e 6)
 * e podem ser sobrescritos pela tabela `game_config` (administração).
 */
export interface GameConfig {
  /** Quests fundamentais necessárias para o despertar. */
  awakeningQuests: number;
  /** Nível de vínculo mínimo para o despertar. */
  awakeningBondLevel: number;
  /** Nível de vínculo mínimo para concluir "Primeiro laço". */
  firstBondLevel: number;
  /** XP base por mensagem significativa. */
  messageXp: number;
  /** A partir de quantas mensagens no dia o XP cai pela metade. */
  dailySoftCap: number;
  /** Mensagens com menos caracteres não geram XP. */
  minMessageChars: number;
  /** Similaridade (0–1) acima da qual uma mensagem é considerada repetição. */
  repetitionThreshold: number;
  /** XP por descoberta de identidade (uma vez por quest). */
  discoveryXp: number;
  /** XP por memória nova consolidada no turno. */
  memoryXp: number;
  /** Máximo de memórias que podem gerar XP por turno. */
  maxMemoryXpPerTurn: number;
  /** Curva de níveis: limiar(L) = levelBase * (L-1)^levelExp. Sem nível máximo. */
  levelBase: number;
  levelExp: number;
  /** Multiplicador de todo o XP de vínculo (mensagens, descobertas, memórias e combate). 1 = normal. */
  xpMultiplier: number;
  /** XP por criatura derrotada (mais 1 a cada 3 níveis da criatura). */
  killXp: number;
  /** XP extra na primeira vez que derrota uma espécie (Memória de Combate). */
  firstKillXp: number;
  /** XP extra ao completar a Análise de Partículas de uma espécie. */
  analysisXp: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  awakeningQuests: 7,
  awakeningBondLevel: 5,
  firstBondLevel: 2,
  messageXp: 8,
  dailySoftCap: 25,
  minMessageChars: 8,
  repetitionThreshold: 0.8,
  discoveryXp: 40,
  memoryXp: 4,
  maxMemoryXpPerTurn: 2,
  levelBase: 60,
  levelExp: 1.6,
  xpMultiplier: 1,
  killXp: 4,
  firstKillXp: 15,
  analysisXp: 30,
};

/** Valores de XP já com o multiplicador aplicado (o servidor usa estes; o Admin edita os valores base). */
export function withXpMultiplier(cfg: GameConfig): GameConfig {
  const m = Math.min(20, Math.max(0, Number.isFinite(cfg.xpMultiplier) ? cfg.xpMultiplier : 1));
  const k = (v: number) => Math.round(v * m * 10) / 10;
  return { ...cfg, xpMultiplier: 1, messageXp: k(cfg.messageXp), discoveryXp: k(cfg.discoveryXp), memoryXp: k(cfg.memoryXp), killXp: k(cfg.killXp), firstKillXp: k(cfg.firstKillXp), analysisXp: k(cfg.analysisXp) };
}

/** XP de vínculo por uma criatura derrotada (cfg já com o multiplicador). */
export function combatXp(cfg: GameConfig, level: number, first: boolean, analyzed: boolean): number {
  const base = cfg.killXp > 0 ? cfg.killXp + Math.floor(Math.max(0, level) / 3) * Math.max(1, cfg.killXp / 4) : 0;
  return Math.round(base + (first ? cfg.firstKillXp : 0) + (analyzed ? cfg.analysisXp : 0));
}

export function resolveConfig(overrides: Partial<GameConfig> | null | undefined): GameConfig {
  const out: GameConfig = { ...DEFAULT_CONFIG };
  if (!overrides) return out;
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof GameConfig)[]) {
    const v = overrides[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}
