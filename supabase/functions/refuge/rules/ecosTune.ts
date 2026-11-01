/**
 * Afinar o Eco: durante a coleta, o recurso solta três pulsos; quem toca quando o pulso encosta no anel "afina" o eco
 * e o material sai melhor (as propriedades sobem). Errar não tira nada — só não ajuda.
 *
 * O cliente manda, para cada pulso, quanto antes (negativo) ou depois (positivo) do momento certo foi o toque, em ms;
 * o servidor recalcula a nota aqui e aplica o bônus com teto. A Companion coletando sozinha afina como "bom".
 */

export type TuneGrade = 'perfeito' | 'bom' | 'fora';
export const TUNE_PULSES = 3;
/** janelas de acerto em ms (metade para cada lado do momento certo) */
export const TUNE_WINDOW = { perfeito: 110, bom: 260 } as const;
/** quanto cada nota soma às propriedades do material (0–100; as faixas viram a cada ~35) */
export const TUNE_POINTS: Record<TuneGrade, number> = { perfeito: 7, bom: 3, fora: 0 };
/** três perfeitos seguidos: o eco puro soma mais um pouco */
export const PURE_ECHO_BONUS = 4;
export const TUNE_MAX_BONUS = TUNE_PULSES * TUNE_POINTS.perfeito + PURE_ECHO_BONUS;
export const TUNE_LABEL: Record<TuneGrade, string> = { perfeito: 'Perfeito', bom: 'Bom', fora: 'Fora' };

/** em que fração da coleta cada pulso chega ao anel (deixa um respiro no começo e no fim) */
export function pulseTimes(seconds: number): number[] {
  return Array.from({ length: TUNE_PULSES }, (_, i) => Math.round(seconds * 1000 * ((i + 1) / (TUNE_PULSES + 1))));
}

export function gradeOf(offsetMs: number | null | undefined): TuneGrade {
  if (offsetMs === null || offsetMs === undefined || !Number.isFinite(offsetMs)) return 'fora';
  const d = Math.abs(offsetMs);
  return d <= TUNE_WINDOW.perfeito ? 'perfeito' : d <= TUNE_WINDOW.bom ? 'bom' : 'fora';
}

/** saneia o que veio do cliente: no máximo três números finitos, cada um preso a ±2 s */
export function cleanTune(v: unknown): (number | null)[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, TUNE_PULSES).map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(-2000, Math.min(2000, Math.round(x))) : null));
}

export interface TuneResult { grades: TuneGrade[]; bonus: number; pure: boolean }

/** nota dos pulsos e o bônus que entra no sorteio da coleta (rollGather) */
export function scoreTune(offsets: (number | null)[]): TuneResult {
  const grades = Array.from({ length: TUNE_PULSES }, (_, i) => gradeOf(offsets[i]));
  const pure = grades.every((g) => g === 'perfeito');
  const bonus = grades.reduce((t, g) => t + TUNE_POINTS[g], 0) + (pure ? PURE_ECHO_BONUS : 0);
  return { grades, bonus: Math.min(TUNE_MAX_BONUS, bonus), pure };
}

/** a Companion coletando sozinha (ou a afinação automática): três "bom" */
export const COMPANION_TUNE: (number | null)[] = Array.from({ length: TUNE_PULSES }, () => TUNE_WINDOW.perfeito + 1);
