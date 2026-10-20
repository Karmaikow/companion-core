/**
 * GDD 9: 4 horas reais = 12 horas no jogo; um dia completo no jogo = 8 horas reais.
 * Fator 3x. A época (epoch) é configurável para alinhar o mundo.
 */
export const REAL_MS_PER_GAME_DAY = 8 * 60 * 60 * 1000;

export interface GameTime { day: number; hour: number; minute: number; phase: 'madrugada' | 'manha' | 'tarde' | 'noite'; daylight: number }

export function gameTime(nowMs: number, epochMs = Date.UTC(2026, 0, 1)): GameTime {
  const elapsed = nowMs - epochMs;
  const day = Math.floor(elapsed / REAL_MS_PER_GAME_DAY);
  const frac = (elapsed % REAL_MS_PER_GAME_DAY) / REAL_MS_PER_GAME_DAY; // 0..1
  const totalMinutes = frac * 24 * 60;
  const hour = Math.floor(totalMinutes / 60);
  const minute = Math.floor(totalMinutes % 60);
  const phase = hour < 5 ? 'madrugada' : hour < 12 ? 'manha' : hour < 18 ? 'tarde' : 'noite';
  // luz do dia suave: 0 à meia-noite, 1 ao meio-dia
  const daylight = Math.max(0, Math.sin((frac - 0.25) * Math.PI * 2) * 0.5 + 0.5);
  return { day, hour, minute, phase, daylight };
}

/** Dia de vida do Companion no relógio do jogo (1 = dia do nascimento). */
export function companionDay(createdAtMs: number, nowMs: number): number {
  return gameTime(nowMs).day - gameTime(createdAtMs).day + 1;
}
