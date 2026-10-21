/**
 * Clima procedural: limpo, chuva, tempestade, névoa, sol forte, neve e tempestade de areia.
 * Determinístico pelo relógio: o tempo é dividido em janelas (ex.: 20 min) e cada janela sorteia o clima pelo peso
 * do bioma × o peso global (todos veem o mesmo clima na mesma região). O ADM pode fixar um clima (game_config.values.weather).
 * O cliente só desenha (client/src/scene/Weather.tsx) e faz a transição suave entre janelas.
 */

export type WeatherKind = 'limpo' | 'chuva' | 'tempestade' | 'nevoa' | 'sol' | 'neve' | 'areia';

export const WEATHERS: Record<WeatherKind, { label: string; icon: string; hint: string }> = {
  limpo: { label: 'Limpo', icon: '☀️', hint: 'Céu aberto, nada no ar.' },
  sol: { label: 'Sol forte', icon: '🌞', hint: 'Luz quente e brilhante, ar tremulando.' },
  chuva: { label: 'Chuva', icon: '🌧️', hint: 'Chuva fina, céu cinza, chão mais escuro.' },
  tempestade: { label: 'Tempestade', icon: '⛈️', hint: 'Chuva forte, vento e relâmpagos.' },
  nevoa: { label: 'Névoa', icon: '🌫️', hint: 'Névoa densa e baixa; enxerga-se pouco.' },
  neve: { label: 'Neve', icon: '❄️', hint: 'Flocos caindo devagar, luz fria.' },
  areia: { label: 'Tempestade de areia', icon: '🏜️', hint: 'Vento forte com areia; céu alaranjado.' },
};
export const WEATHER_KINDS = Object.keys(WEATHERS) as WeatherKind[];

export interface WeatherConfig {
  mode: 'auto' | 'fixo';
  fixed: WeatherKind;
  intensity: number;                              // 0..1 (no modo fixo; no auto, sorteada por janela)
  windowMinutes: number;                          // duração de cada janela de clima
  weights: Record<WeatherKind, number>;           // peso global (multiplica o do bioma)
}

export const DEFAULT_WEATHER: WeatherConfig = {
  mode: 'auto', fixed: 'chuva', intensity: 0.7, windowMinutes: 20,
  weights: { limpo: 6, sol: 2, chuva: 2, tempestade: 0.5, nevoa: 1, neve: 0, areia: 0 },
};

/** Peso padrão de um bioma (o Estúdio pode mudar): neve e areia só onde o bioma pede. */
export const DEFAULT_BIOME_WEATHER: Record<WeatherKind, number> = { limpo: 1, sol: 1, chuva: 1, tempestade: 1, nevoa: 1, neve: 0, areia: 0 };

const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };

export function sanitizeWeights(input: unknown, base: Record<WeatherKind, number>): Record<WeatherKind, number> {
  const w = (input ?? {}) as Partial<Record<WeatherKind, number>>;
  const out = { ...base };
  for (const k of WEATHER_KINDS) if (w[k] !== undefined) out[k] = n(w[k], 0, 10, base[k]);
  return out;
}

export function sanitizeWeather(input: unknown): WeatherConfig {
  const w = (input ?? {}) as Partial<WeatherConfig>;
  return {
    mode: w.mode === 'fixo' ? 'fixo' : 'auto',
    fixed: w.fixed && w.fixed in WEATHERS ? w.fixed : DEFAULT_WEATHER.fixed,
    intensity: n(w.intensity, 0, 1, DEFAULT_WEATHER.intensity),
    windowMinutes: Math.round(n(w.windowMinutes, 2, 240, DEFAULT_WEATHER.windowMinutes)),
    weights: sanitizeWeights(w.weights, DEFAULT_WEATHER.weights),
  };
}

const hash = (a: number, b: number) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };

export interface WeatherNow { kind: WeatherKind; intensity: number; windowStart: number; windowEnd: number }

/** Clima de uma janela para um lugar (o slug do bioma entra no sorteio: regiões diferentes, climas diferentes). */
export function weatherAt(cfg: WeatherConfig, nowMs: number, place: string, biomeWeights: Record<WeatherKind, number> = DEFAULT_BIOME_WEATHER): WeatherNow {
  const win = cfg.windowMinutes * 60_000, idx = Math.floor(nowMs / win), start = idx * win;
  if (cfg.mode === 'fixo') return { kind: cfg.fixed, intensity: cfg.intensity, windowStart: start, windowEnd: start + win };
  const salt = strHash(place);
  const pool = WEATHER_KINDS.map((k) => [k, cfg.weights[k] * (biomeWeights[k] ?? 0)] as const).filter(([, w]) => w > 0);
  const total = pool.reduce((t, [, w]) => t + w, 0);
  if (!total) return { kind: 'limpo', intensity: 0, windowStart: start, windowEnd: start + win };
  let r = hash(idx, salt) * total, kind: WeatherKind = pool[0][0];
  for (const [k, w] of pool) { r -= w; if (r < 0) { kind = k; break; } }
  return { kind, intensity: kind === 'limpo' ? 0 : 0.45 + hash(idx, salt + 7) * 0.55, windowStart: start, windowEnd: start + win };
}
