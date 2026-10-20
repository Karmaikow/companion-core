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
};

export function resolveConfig(overrides: Partial<GameConfig> | null | undefined): GameConfig {
  const out: GameConfig = { ...DEFAULT_CONFIG };
  if (!overrides) return out;
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof GameConfig)[]) {
    const v = overrides[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}
