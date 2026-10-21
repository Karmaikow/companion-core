/**
 * Biomas configuráveis no Estúdio (painel do ADM). Um bioma é uma paleta + uma lista de modelos .GLB com papel,
 * tamanho, quantidade, vento e zona. O mesmo formato serve para a prévia no Estúdio e para o jogo (o Refúgio usa o
 * bioma "refugio" quando ele está publicado).
 */

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
}

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
  settings: { grassBlades: number; cliffs: boolean };
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
  settings: { grassBlades: 1, cliffs: true },
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
    });
  }
  return {
    slug: typeof b.slug === 'string' && SLUG.test(b.slug) ? b.slug : 'bioma',
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 60) : 'Bioma sem nome',
    description: typeof b.description === 'string' ? b.description.slice(0, 300) : '',
    palette: pal,
    settings: { grassBlades: clampN(b.settings?.grassBlades, 0, 2, 1), cliffs: b.settings?.cliffs !== false },
    assets,
  };
}

/** "Floresta Sussurrante" -> "floresta-sussurrante" */
export function biomeSlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bioma';
}
