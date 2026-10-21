/**
 * Companion World — o mundo aberto lá fora do Refúgio. Função pura e determinística: a mesma seed e a mesma lista de
 * biomas geram o mesmo mundo no cliente, no servidor de simulação (MVP 2) e nos testes.
 *
 * - Regiões: Voronoi com sítios numa grade (um por célula de REGION metros), bordas tortas por ruído (domain warp).
 *   Cada sítio recebe um bioma publicado; o sítio (0, 0) é o Portal do Refúgio, sempre no bioma de casa.
 * - Relevo: ruído fractal, com amplitude do bioma (settings.hills) misturada na borda entre regiões; plano no portal,
 *   nos marcos e nas trilhas; o mundo é cercado por morros.
 * - Trilhas: cada sítio liga ao vizinho da direita; a coluna 0 liga todas as linhas (o mapa fica todo conectado).
 * - Marcos: cada região tem uma pedra-guia com nome, para descobrir.
 * - Vegetação: por chunk de CHUNK metros, densidade tirada do próprio bioma (a quantidade da clareira ÷ a área da zona).
 */
import { type BiomeAsset, type BiomeConfig, type BiomeZone } from './biome.ts';

export const REGION = 90;      // tamanho da célula de cada região (m)
export const CHUNK = 16;       // chunk de vegetação (m)
export const WORLD_CELLS = 3;  // células de -3..3 → mundo de ~630 m
export const WORLD_R = REGION * (WORLD_CELLS + 0.5); // além disso, morros fecham o mundo
export const PORTAL_R = 7;     // área plana em volta do portal

export interface WorldSite {
  i: number; j: number; x: number; z: number;
  biome: number;             // índice em biomes
  name: string;              // nome do lugar (pedra-guia)
  home: boolean;             // o Portal do Refúgio
}
export interface RegionHit { site: WorldSite; other: WorldSite; edge: number /* d2 - d1, 0 = na borda */ }
export interface Spot { x: number; z: number; rot: number; s: number }

export interface CompanionWorld {
  seed: number;
  biomes: BiomeConfig[];
  sites: WorldSite[];
  roads: [WorldSite, WorldSite][];
  siteAt: (i: number, j: number) => WorldSite | undefined;
  regionAt: (x: number, z: number) => RegionHit;
  heightAt: (x: number, z: number) => number;
  dirtAt: (x: number, z: number) => number;
  /** 0 = campo aberto, 1 = mata fechada */
  forestAt: (x: number, z: number) => number;
  noise: (x: number, z: number) => number;
  /** Vegetação de um chunk: chave "slug/assetId" (ou "slug/__blades" para a grama leve) → pontos. */
  chunkSpots: (cx: number, cz: number) => Map<string, Spot[]>;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// área de cada zona na clareira do Refúgio (m²): converte "quantidade na clareira" em densidade por m²
const ZONE_AREA: Record<BiomeZone, number> = { inside: 300, edge: 460, outside: 1460, anywhere: 1790 };
// no mundo aberto cada papel tem a sua fração da densidade da clareira (grama muito densa pesaria demais)
export const WORLD_ROLE: Record<string, { density: number; view: number }> = {
  grass: { density: 0.25, view: 1 }, plant: { density: 0.5, view: 2 }, tree: { density: 0.7, view: 3 },
  rock: { density: 0.45, view: 3 }, landmark: { density: 0, view: 3 }, prop: { density: 0.3, view: 2 }, blades: { density: 0.3, view: 1 },
};

const PLACE_A = ['Vale', 'Campo', 'Colina', 'Bosque', 'Clareira', 'Trilha', 'Pedra', 'Ninho', 'Jardim', 'Mirante'];
const PLACE_B = ['da Névoa', 'Lumina', 'dos Ecos', 'do Orvalho', 'dos Vaga-lumes', 'Serena', 'do Vento Manso', 'das Lanternas', 'de Âmbar', 'Sussurrante', 'das Sementes', 'do Luar'];

export function makeCompanionWorld(seed: number, biomesIn: BiomeConfig[]): CompanionWorld {
  const S = seed | 0;
  const biomes = biomesIn.length ? biomesIn : [];
  if (!biomes.length) throw new Error('makeCompanionWorld: precisa de pelo menos um bioma');
  const hash = (...n: number[]) => { let h = Math.imul(S, 1442695041) | 0; for (const v of n) { h = (h + Math.imul(v | 0, 374761393)) | 0; h = Math.imul(h ^ (h >>> 15), 668265263); } h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vnoise = (x: number, y: number, salt: number) => {
    const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi; xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, salt), b = hash(xi + 1, yi, salt), c = hash(xi, yi + 1, salt), d = hash(xi + 1, yi + 1, salt);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  const fbm = (x: number, y: number, salt = 0) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { v += a * vnoise(x * f, y * f, salt + i); f *= 2.03; a *= 0.5; } return v / 0.9375; };

  // ---- sítios e regiões
  const homeIdx = Math.max(0, biomes.findIndex((b) => b.slug === 'refugio' || b.slug === 'prados'));
  const sites: WorldSite[] = [];
  const grid = new Map<string, WorldSite>();
  const usedNames = new Set<string>();
  for (let j = -WORLD_CELLS; j <= WORLD_CELLS; j++) for (let i = -WORLD_CELLS; i <= WORLD_CELLS; i++) {
    const home = i === 0 && j === 0;
    const x = home ? 0 : (i + 0.2 + hash(i, j, 1) * 0.6 - 0.5) * REGION, z = home ? 0 : (j + 0.2 + hash(i, j, 2) * 0.6 - 0.5) * REGION;
    // vizinhos do portal num bioma diferente quando houver mais de um
    let biome = home ? homeIdx : Math.floor(hash(i, j, 3) * biomes.length);
    if (!home && biomes.length > 1 && Math.abs(i) + Math.abs(j) === 1 && biome === homeIdx) biome = (biome + 1 + Math.floor(hash(i, j, 4) * (biomes.length - 1))) % biomes.length;
    let name = home ? 'Portal do Refúgio' : '';
    for (let t = 0; !name || usedNames.has(name); t++) name = PLACE_A[Math.floor(hash(i, j, 5, t) * PLACE_A.length)] + ' ' + PLACE_B[Math.floor(hash(i, j, 6, t) * PLACE_B.length)];
    usedNames.add(name);
    const s: WorldSite = { i, j, x, z, biome, name, home };
    sites.push(s); grid.set(i + ',' + j, s);
  }
  const siteAt = (i: number, j: number) => grid.get(i + ',' + j);

  const regionAt = (x: number, z: number): RegionHit => {
    const wx = x + (fbm(x * 0.012, z * 0.012, 40) - 0.5) * 46, wz = z + (fbm(x * 0.012 + 9, z * 0.012, 41) - 0.5) * 46;
    const ci = Math.round(wx / REGION), cj = Math.round(wz / REGION);
    let best: WorldSite | undefined, second: WorldSite | undefined, d1 = Infinity, d2 = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const s = siteAt(Math.max(-WORLD_CELLS, Math.min(WORLD_CELLS, ci + di)), Math.max(-WORLD_CELLS, Math.min(WORLD_CELLS, cj + dj)));
      if (!s || s === best || s === second) continue;
      const d = Math.hypot(wx - s.x, wz - s.z);
      if (d < d1) { d2 = d1; second = best; d1 = d; best = s; } else if (d < d2) { d2 = d; second = s; }
    }
    return { site: best!, other: second ?? best!, edge: d2 - d1 };
  };

  // ---- trilhas
  const roads: [WorldSite, WorldSite][] = [];
  for (const s of sites) {
    const r = siteAt(s.i + 1, s.j); if (r) roads.push([s, r]);
    const d = siteAt(s.i, s.j + 1); if (d && (s.i === 0 || hash(s.i, s.j, 7) < 0.35)) roads.push([s, d]);
  }
  const roadsNear = new Map<string, [WorldSite, WorldSite][]>();
  for (const rd of roads) for (const s of rd) { const k = s.i + ',' + s.j; if (!roadsNear.has(k)) roadsNear.set(k, []); roadsNear.get(k)!.push(rd); }
  const segDist = (px: number, pz: number, a: WorldSite, b: WorldSite) => {
    const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / l2));
    // trilha sinuosa: desvio lateral por ruído ao longo do caminho
    const len = Math.sqrt(l2), nx = -vz / len, nz = vx / len, wob = (vnoise(t * len * 0.04, a.i * 7 + b.j * 3, 50) - 0.5) * 14 * Math.sin(Math.PI * t);
    return Math.hypot(px - (a.x + vx * t + nx * wob), pz - (a.z + vz * t + nz * wob));
  };
  const roadDist = (x: number, z: number) => {
    const ci = Math.round(x / REGION), cj = Math.round(z / REGION);
    let d = Infinity; const seen = new Set<[WorldSite, WorldSite]>();
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const rd of roadsNear.get((ci + di) + ',' + (cj + dj)) ?? []) {
      if (seen.has(rd)) continue; seen.add(rd); d = Math.min(d, segDist(x, z, rd[0], rd[1]));
    }
    return d;
  };

  const dirtAt = (x: number, z: number) => {
    const road = 1 - smooth(1.1, 2.0, roadDist(x, z) + (vnoise(x * 0.4, z * 0.4, 60) - 0.5) * 0.8);
    const patch = smooth(0.74, 0.82, fbm(x * 0.05 + 3, z * 0.05 - 5, 61)) * 0.9;
    return Math.max(road, patch);
  };

  const forestAt = (x: number, z: number) => fbm(x * 0.018, z * 0.018, 70);

  const heightAt = (x: number, z: number) => {
    const h = regionAt(x, z);
    const w = 0.5 + 0.5 * smooth(0, 24, h.edge); // na borda, metade de cada
    const hills = biomes[h.site.biome].settings.hills * w + biomes[h.other.biome].settings.hills * (1 - w);
    let y = (fbm(x * 0.025, z * 0.025, 80) - 0.5) * 5 * hills + (fbm(x * 0.12, z * 0.12, 81) - 0.5) * 0.5;
    // plano no portal, nos marcos e (quase) nas trilhas
    const ds = Math.hypot(x - h.site.x, z - h.site.z);
    y *= smooth(h.site.home ? PORTAL_R : 3, h.site.home ? PORTAL_R + 10 : 9, ds);
    y *= 0.35 + 0.65 * smooth(1.5, 6, roadDist(x, z));
    // morros que fecham o mundo
    const r = Math.max(Math.abs(x), Math.abs(z));
    y += smooth(WORLD_R - 25, WORLD_R + 5, r) * (14 + fbm(x * 0.05, z * 0.05, 82) * 8);
    return y;
  };

  // ---- vegetação por chunk
  const zoneWeight = (zone: BiomeZone, f: number) =>
    zone === 'inside' ? 1 - smooth(0.42, 0.62, f) : zone === 'outside' ? smooth(0.45, 0.62, f) : zone === 'edge' ? Math.max(0, 1 - Math.abs(f - 0.52) * 4) : 1;
  const cache = new Map<string, Map<string, Spot[]>>();
  const chunkSpots = (cx: number, cz: number) => {
    const key = cx + ',' + cz;
    const hit = cache.get(key);
    if (hit) return hit;
    const out = new Map<string, Spot[]>();
    const x0 = cx * CHUNK, z0 = cz * CHUNK, area = CHUNK * CHUNK;
    // biomas que tocam o chunk
    const present = new Set<number>();
    for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) present.add(regionAt(x0 + u * CHUNK, z0 + v * CHUNK).site.biome);
    const blocked = (x: number, z: number, h: RegionHit) =>
      dirtAt(x, z) > 0.35 || Math.hypot(x - h.site.x, z - h.site.z) < (h.site.home ? PORTAL_R - 1 : 3.2) || Math.max(Math.abs(x), Math.abs(z)) > WORLD_R - 12;
    for (const bi of present) {
      const b = biomes[bi];
      const layers: { id: string; role: string; zone: BiomeZone; count: number }[] = b.assets.map((a: BiomeAsset) => ({ id: a.id, role: a.role, zone: a.zone, count: a.count }));
      if (b.settings.grassBlades > 0) layers.push({ id: '__blades', role: 'blades', zone: 'anywhere', count: 2200 * b.settings.grassBlades });
      layers.forEach((L, li) => {
        const want = (L.count / ZONE_AREA[L.zone]) * area * (WORLD_ROLE[L.role]?.density ?? 0.3) * 1.6; // 1,6: candidatos (parte cai fora da zona)
        const n = Math.floor(want) + (hash(cx, cz, bi, li, 90) < want % 1 ? 1 : 0);
        const list: Spot[] = [];
        const gap = L.role === 'tree' ? 2.6 : L.role === 'rock' ? 1.6 : 0;
        for (let k = 0; k < n; k++) {
          const x = x0 + hash(cx, cz, bi, li, k, 91) * CHUNK, z = z0 + hash(cx, cz, bi, li, k, 92) * CHUNK;
          const h = regionAt(x, z);
          if (h.site.biome !== bi || blocked(x, z, h)) continue;
          if (hash(cx, cz, bi, li, k, 93) > zoneWeight(L.zone, forestAt(x, z)) * 0.62) continue;
          if (gap && list.some((q) => Math.hypot(q.x - x, q.z - z) < gap)) continue;
          list.push({ x, z, rot: hash(cx, cz, li, k, 94) * Math.PI * 2, s: hash(cx, cz, li, k, 95) });
        }
        if (list.length) out.set(b.slug + '/' + L.id, list);
      });
    }
    if (cache.size > 600) cache.clear();
    cache.set(key, out);
    return out;
  };

  return { seed: S, biomes, sites, roads, siteAt, regionAt, heightAt, dirtAt, forestAt, noise: (x, z) => fbm(x, z, 0), chunkSpots };
}

/** Seed do mundo compartilhado (todo mundo anda no mesmo Companion World). */
export const WORLD_SEED = strHash('companion-world-v0');

/** O papel de uma camada de vegetação a partir da chave "slug/assetId". */
export function layerRole(world: CompanionWorld, key: string): { biome: BiomeConfig; asset: BiomeAsset | null; role: string } | null {
  const [slug, id] = key.split('/');
  const biome = world.biomes.find((b) => b.slug === slug);
  if (!biome) return null;
  if (id === '__blades') return { biome, asset: null, role: 'blades' };
  const asset = biome.assets.find((a) => a.id === id) ?? null;
  return asset ? { biome, asset, role: asset.role } : null;
}

