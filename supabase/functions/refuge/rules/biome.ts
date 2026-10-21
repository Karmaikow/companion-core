/**
 * Biomas configuráveis no Estúdio (painel do ADM). Um bioma é uma paleta + uma lista de modelos .GLB com papel,
 * tamanho, quantidade, vento e zona. O mesmo formato serve para a prévia no Estúdio e para o jogo (o Refúgio usa o
 * bioma "refugio" quando ele está publicado).
 */

import { sanitizeLook, type ModelLook } from './look.ts';
import { DEFAULT_BIOME_WEATHER, sanitizeWeights, type WeatherKind } from './weather.ts';

export type BiomeAssetRole = 'tree' | 'rock' | 'grass' | 'plant' | 'landmark' | 'prop';
export type BiomeZone = 'inside' | 'edge' | 'outside' | 'anywhere';

export interface BiomeAsset {
  id: string;
  name: string;
  url: string;        // URL pública (bucket world-assets) ou caminho do próprio site (/assets/...)
  path?: string;      // caminho no bucket, quando enviado pelo Estúdio
  role: BiomeAssetRole;
  zone: BiomeZone;
  height: [number, number]; // metros (mín, máx)
  count: number;            // cópias (no celular cai pela metade)
  wind: number;             // 0 = parado, 0.35 = árvore, 1 = grama
  look?: ModelLook;         // cor/luz/brilho próprios deste bioma (sem editar o .GLB)
}

/** Refúgio: o cenário em volta do altar (um padrão para todos ou um feito para um Companion). Região: um pedaço do Companion World. */
export type BiomeKind = 'refuge' | 'world';
/** Partículas no ar das regiões do mundo. */
export type BiomeAmbient = 'none' | 'fireflies' | 'embers' | 'snow' | 'leaves' | 'petals' | 'spores';
export const BIOME_AMBIENTS: Record<BiomeAmbient, string> = {
  none: 'Nada', fireflies: 'Vaga-lumes', embers: 'Brasas subindo', snow: 'Neve', leaves: 'Folhas caindo', petals: 'Pétalas', spores: 'Esporos brilhantes',
};

export interface BiomePalette {
  grassLight: string; grassDark: string; dirt: string; dirtDark: string;
  rockSide: string; rockTop: string; rockBottom: string;
  sky: string; fog: string; skyNight: string; fogNight: string;
}

export interface BiomeConfig {
  slug: string;
  name: string;
  description: string;
  palette: BiomePalette;
  settings: {
    kind: BiomeKind;
    grassBlades: number; cliffs: boolean;
    /** derivado de kind: aparece como região do Companion World */
    world: boolean;
    /** partículas no ar (regiões do mundo) */
    ambient: BiomeAmbient;
    /** névoa da região no mundo: 1 = normal, 2 = densa */
    fog: number;
    /** chance de cada clima aqui (0 = nunca); multiplica o peso global do ADM */
    weather: Record<WeatherKind, number>;
    /** relevo da região no mundo aberto: 0 = plano, 1 = colinas, 2 = morros */
    hills: number;
  };
  assets: BiomeAsset[];
}

export const BIOME_ROLES: Record<BiomeAssetRole, { label: string; zone: BiomeZone; height: [number, number]; count: number; wind: number; gap: number }> = {
  tree: { label: 'Árvore', zone: 'outside', height: [2.8, 4.2], count: 14, wind: 0.35, gap: 3.4 },
  rock: { label: 'Pedra', zone: 'edge', height: [0.6, 1.8], count: 8, wind: 0, gap: 2.5 },
  grass: { label: 'Grama / tufo', zone: 'inside', height: [0.32, 0.5], count: 160, wind: 1, gap: 0 },
  plant: { label: 'Planta / flor / arbusto', zone: 'inside', height: [0.4, 1.0], count: 40, wind: 0.7, gap: 0.8 },
  landmark: { label: 'Marco do lugar', zone: 'edge', height: [3, 6], count: 1, wind: 0, gap: 4 },
  prop: { label: 'Objeto', zone: 'inside', height: [0.5, 1.2], count: 6, wind: 0, gap: 2 },
};

export const BIOME_ZONES: Record<BiomeZone, string> = {
  inside: 'Dentro da clareira',
  edge: 'Na borda (junto às pedras)',
  outside: 'Fora (floresta em volta)',
  anywhere: 'Em todo lugar',
};

export const DEFAULT_PALETTE: BiomePalette = {
  grassLight: '#8fcf60', grassDark: '#5aa84c', dirt: '#d8b07a', dirtDark: '#b98c5c',
  rockSide: '#b3a8d2', rockTop: '#97d36a', rockBottom: '#7a6e9c',
  sky: '#bfe6ff', fog: '#d4eefc', skyNight: '#2c3270', fogNight: '#2c3270',
};

const A = (id: string, name: string, role: BiomeAssetRole, over: Partial<BiomeAsset> = {}): BiomeAsset => ({
  id, name, url: `/assets/refuge/${id}.glb`, role, zone: BIOME_ROLES[role].zone, height: BIOME_ROLES[role].height, count: BIOME_ROLES[role].count, wind: BIOME_ROLES[role].wind, ...over,
});

/** O Refúgio de fábrica (o que o jogo usa enquanto o bioma "refugio" não for publicado no Estúdio). */
export const REFUGE_BIOME: BiomeConfig = {
  slug: 'refugio',
  name: 'Clareira do Refúgio',
  description: 'Clareira escondida cercada de pedras lavanda e árvores; onde o Companion nasce.',
  palette: DEFAULT_PALETTE,
  settings: { kind: 'refuge', grassBlades: 1, cliffs: true, world: false, ambient: 'fireflies', fog: 1, hills: 0.6, weather: { ...DEFAULT_BIOME_WEATHER } },
  assets: [
    A('arvore', 'Árvore', 'tree', { height: [3.0, 4.4], count: 14 }),
    A('arvore_dois', 'Árvore dois', 'tree', { height: [2.6, 3.8], count: 12 }),
    A('tufo_grama', 'Tufo de grama', 'grass', { count: 170 }),
    A('tufo_grama_alta', 'Grama alta', 'grass', { zone: 'edge', height: [0.55, 0.9], count: 80 }),
    A('pedra', 'Pedra pequena', 'rock', { id: 'pedra-pequena', zone: 'inside', height: [0.35, 0.7], count: 5, url: '/assets/refuge/pedra.glb' }),
    A('pedra', 'Pedra grande', 'rock', { id: 'pedra-grande', height: [1.2, 2.2], count: 8, url: '/assets/refuge/pedra.glb' }),
  ],
};

const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const clampN = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

/** Normaliza o que vem do banco ou do painel: valores fora do lugar voltam ao padrão, listas são limitadas. */
export function sanitizeBiome(input: unknown): BiomeConfig {
  const b = (input ?? {}) as Partial<BiomeConfig>;
  const pal = { ...DEFAULT_PALETTE } as BiomePalette;
  for (const k of Object.keys(DEFAULT_PALETTE) as (keyof BiomePalette)[]) {
    const v = (b.palette as Partial<BiomePalette> | undefined)?.[k];
    if (typeof v === 'string' && HEX.test(v)) pal[k] = v.toLowerCase();
  }
  const assets: BiomeAsset[] = [];
  for (const raw of Array.isArray(b.assets) ? b.assets.slice(0, 40) : []) {
    const a = raw as Partial<BiomeAsset>;
    if (typeof a.url !== 'string' || !/^(https:\/\/|\/assets\/)/.test(a.url)) continue;
    const role = (a.role && a.role in BIOME_ROLES ? a.role : 'prop') as BiomeAssetRole;
    const def = BIOME_ROLES[role];
    const lo = clampN(a.height?.[0], 0.05, 30, def.height[0]), hi = clampN(a.height?.[1], 0.05, 30, def.height[1]);
    assets.push({
      id: typeof a.id === 'string' && a.id ? a.id.slice(0, 60) : 'a' + assets.length,
      name: typeof a.name === 'string' ? a.name.slice(0, 60) : 'Modelo',
      url: a.url, path: typeof a.path === 'string' ? a.path : undefined,
      role, zone: (a.zone && a.zone in BIOME_ZONES ? a.zone : def.zone) as BiomeZone,
      height: [Math.min(lo, hi), Math.max(lo, hi)],
      count: Math.round(clampN(a.count, 0, 600, def.count)),
      wind: clampN(a.wind, 0, 1.5, def.wind),
      look: sanitizeLook(a.look),
    });
  }
  return {
    slug: typeof b.slug === 'string' && SLUG.test(b.slug) ? b.slug : 'bioma',
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 60) : 'Bioma sem nome',
    description: typeof b.description === 'string' ? b.description.slice(0, 300) : '',
    palette: pal,
    settings: (() => {
      const st = (b.settings ?? {}) as Partial<BiomeConfig['settings']>;
      // biomas antigos não tinham "kind": o refugio e os que tinham "aparece no mundo" desligado são Refúgios
      const kind: BiomeKind = st.kind === 'refuge' || st.kind === 'world' ? st.kind : b.slug === 'refugio' || st.world === false ? 'refuge' : 'world';
      return {
        kind, world: kind === 'world', grassBlades: clampN(st.grassBlades, 0, 2, 1), cliffs: st.cliffs !== false,
        ambient: (st.ambient && st.ambient in BIOME_AMBIENTS ? st.ambient : kind === 'refuge' ? 'fireflies' : 'none') as BiomeAmbient,
        fog: clampN(st.fog, 1, 2, 1), hills: clampN(st.hills, 0, 2, 1),
        weather: sanitizeWeights(st.weather, DEFAULT_BIOME_WEATHER),
      };
    })(),
    assets,
  };
}

/**
 * Regiões de reserva do Companion World: variações do Refúgio com os mesmos modelos, para o mundo já ter cara de
 * lugares diferentes enquanto o Estúdio ainda tem poucos biomas publicados.
 */
const variant = (slug: string, name: string, description: string, palette: Partial<BiomePalette>, hills: number, tweak: (a: BiomeAsset) => BiomeAsset | null, ambient: BiomeAmbient = 'none', weather: Partial<Record<WeatherKind, number>> = {}): BiomeConfig => ({
  slug, name, description, palette: { ...DEFAULT_PALETTE, ...palette }, settings: { kind: 'world', grassBlades: 1, cliffs: false, world: true, ambient, fog: 1, hills, weather: { ...DEFAULT_BIOME_WEATHER, ...weather } },
  assets: REFUGE_BIOME.assets.map(tweak).filter((a): a is BiomeAsset => !!a),
});
export const WORLD_FALLBACK_BIOMES: BiomeConfig[] = [
  { ...REFUGE_BIOME, slug: 'prados', name: 'Prados do Refúgio', settings: { ...REFUGE_BIOME.settings, kind: 'world', world: true, cliffs: false } },
  variant('bosque-ambar', 'Bosque Âmbar', 'Folhas cor de mel e chão de terra quente.', { grassLight: '#c9c25a', grassDark: '#93a046', dirt: '#e0a56a', dirtDark: '#b97a4a', rockSide: '#c7a98f', rockTop: '#c9c25a', rockBottom: '#8d6f5c', sky: '#ffe2b8', fog: '#ffe9cc' }, 1,
    (a) => (a.role === 'tree' ? { ...a, count: Math.round(a.count * 1.8), look: { hue: -55, sat: 1.15, light: 1.05, contrast: 1.05, tint: '#ffb35a', tintAmount: 0.25, glow: 0 } } : a), 'leaves', { chuva: 2 }),
  variant('colinas-lavanda', 'Colinas Lavanda', 'Morros de grama azulada e pedras grandes.', { grassLight: '#9fd0b0', grassDark: '#6a9f9a', dirt: '#cdb8e0', dirtDark: '#a58fc0', rockSide: '#c6b6ea', rockTop: '#9fd0b0', rockBottom: '#8576b0', sky: '#d6dcff', fog: '#e2e4ff' }, 1.8,
    (a) => (a.role === 'tree' ? { ...a, count: Math.round(a.count * 0.4) } : a.role === 'rock' ? { ...a, count: a.count * 2, look: { hue: 120, sat: 1.2, light: 1.05, contrast: 1, tint: '#c58cff', tintAmount: 0.35, glow: 0.35 } } : a), 'spores', { nevoa: 3, chuva: 0.5 }),
];

/** "Floresta Sussurrante" -> "floresta-sussurrante" */
export function biomeSlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bioma';
}
