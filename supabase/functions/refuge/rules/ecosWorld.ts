/**
 * Ecos da Terra no mundo aberto: os recursos de coleta nascem por chunk em todas as regiões do Companion World, pela
 * tabela de recursos de cada bioma (Admin → Biomas). Função pura e determinística, como as criaturas: o cliente
 * desenha e o servidor recalcula o mesmo recurso pelo id para conferir posição, alcance, horário e clima.
 *
 * Id de um recurso: "<tipo>@<cx>,<cz>#<n>" (ex.: "erva@3,-2#1"). O estado (abundância) continua por Companion em
 * ecos_nodes, guardado só quando alguém coleta.
 */
import { NODE_KINDS, type ResourceNode } from './ecos.ts';
import { biomeResources, type ResourceTerrain, type ResourceTime } from './biome.ts';
import { CHUNK, PORTAL_R, WORLD_WALK_R, type CompanionWorld } from './worldgen.ts';
import { gameTime } from './clock.ts';
import { weatherAt, DEFAULT_WEATHER, type WeatherConfig, type WeatherKind } from './weather.ts';

export interface WorldNode extends ResourceNode {
  /** slug do bioma onde nasceu */
  biome: string;
  time: ResourceTime;
  /** climas em que aparece (vazio = qualquer) */
  weather: WeatherKind[];
  /** só para quem tem este desbloqueio */
  unlock?: string;
}

const NODE_ID = /^([a-z][a-z-]{1,40})@(-?\d{1,4}),(-?\d{1,4})#(\d{1,3})$/;
/** Tipo do recurso a partir do id (sem precisar do mundo). */
export function worldNodeKind(id: string): string | null {
  const m = NODE_ID.exec(id);
  return m && m[1] in NODE_KINDS ? m[1] : null;
}

const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function hashOf(seed: number) {
  return (...v: number[]) => { let x = Math.imul(seed | 0, 1442695041) ^ 0x2c1b3c6d; for (const k of v) { x = (x + Math.imul(k | 0, 374761393)) | 0; x = Math.imul(x ^ (x >>> 15), 668265263); } x ^= x >>> 13; x = Math.imul(x, 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
}
/** distância mínima entre dois recursos do mesmo chunk (m) */
const NODE_GAP = 3;

function terrainOk(t: ResourceTerrain, forest: number) {
  return t === 'qualquer' || (t === 'mata' ? forest >= 0.5 : forest <= 0.55);
}

const caches = new WeakMap<CompanionWorld, Map<string, WorldNode[]>>();

/**
 * Recursos de um chunk (todos, sem filtrar horário e clima: use `nodeAvailable`). Cada tipo sorteia candidatos com a
 * maior densidade entre os biomas que tocam o chunk; cada candidato fica se o bioma dele tiver o tipo (na proporção
 * da densidade dele) e o terreno servir. Longe das trilhas, dos marcos, do portal e da borda do mundo.
 */
export function chunkResources(w: CompanionWorld, cx: number, cz: number): WorldNode[] {
  let cache = caches.get(w);
  if (!cache) { cache = new Map(); caches.set(w, cache); }
  const key = cx + ',' + cz;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = hashOf(w.seed + 31);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const present = new Set<number>();
  for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) present.add(w.regionAt(x0 + u * CHUNK, z0 + v * CHUNK).site.biome);
  const maxD = new Map<string, number>();
  for (const bi of present) for (const r of biomeResources(w.biomes[bi])) if (r.density > 0) maxD.set(r.kind, Math.max(maxD.get(r.kind) ?? 0, r.density));
  const out: WorldNode[] = [];
  for (const kind of [...maxD.keys()].sort()) {
    const dmax = maxD.get(kind)!, ks = strHash(kind);
    const n = Math.floor(dmax) + (h(cx, cz, ks, 1) < dmax % 1 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const x = x0 + (0.08 + 0.84 * h(cx, cz, ks, j, 2)) * CHUNK, z = z0 + (0.08 + 0.84 * h(cx, cz, ks, j, 3)) * CHUNK;
      const reg = w.regionAt(x, z), b = w.biomes[reg.site.biome];
      const row = biomeResources(b).find((r) => r.kind === kind);
      if (!row || h(cx, cz, ks, j, 4) >= row.density / dmax) continue;
      if (!terrainOk(row.terrain, w.forestAt(x, z))) continue;
      if (w.dirtAt(x, z) > 0.3 || Math.hypot(x, z) > WORLD_WALK_R - 3) continue;
      if (Math.hypot(x - reg.site.x, z - reg.site.z) < (reg.site.home || reg.site.gate ? PORTAL_R + 2 : 4.5)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < NODE_GAP)) continue;
      out.push({ id: `${kind}@${cx},${cz}#${j}`, kind, x, z, biome: b.slug, time: row.time, weather: row.weather, ...(row.unlock ? { unlock: row.unlock } : {}) });
    }
  }
  if (cache.size > 900) cache.clear();
  cache.set(key, out);
  return out;
}

/** O recurso de um id (recalculado pelo mundo) ou null se não existe. */
export function worldNodeById(w: CompanionWorld, id: string): WorldNode | null {
  const m = NODE_ID.exec(id);
  if (!m || !(m[1] in NODE_KINDS)) return null;
  return chunkResources(w, Number(m[2]), Number(m[3])).find((n) => n.id === id) ?? null;
}

/** Recursos até `r` metros de um ponto (todos; filtre com `nodeAvailable`). */
export function nodesNear(w: CompanionWorld, x: number, z: number, r: number): WorldNode[] {
  const out: WorldNode[] = [];
  const c0 = Math.floor((x - r) / CHUNK), c1 = Math.floor((x + r) / CHUNK), d0 = Math.floor((z - r) / CHUNK), d1 = Math.floor((z + r) / CHUNK);
  for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) for (const n of chunkResources(w, cx, cz)) if (Math.hypot(n.x - x, n.z - z) <= r) out.push(n);
  return out;
}

/** É noite no relógio do jogo (o mesmo corte das criaturas noturnas). */
export const isNightAt = (now: number) => gameTime(now).daylight < 0.35;

/** Clima agora numa região do mundo (a mesma conta do cliente: config do ADM × peso do bioma). */
export function regionWeather(w: CompanionWorld, biomeSlug: string, now: number, cfg: WeatherConfig = DEFAULT_WEATHER): WeatherKind {
  const b = w.biomes.find((x) => x.slug === biomeSlug);
  return weatherAt(cfg, now, 'mundo:' + biomeSlug, b?.settings.weather).kind;
}

export interface NodeEnv { night: boolean; weatherOf: (biomeSlug: string) => WeatherKind; unlocks?: readonly string[] }
/** O recurso está à vista agora (horário, clima e, para as variedades, o desbloqueio)? */
export function nodeAvailable(n: WorldNode, env: NodeEnv): boolean {
  if (n.unlock && !env.unlocks?.includes(n.unlock)) return false;
  if (n.time === 'dia' && env.night) return false;
  if (n.time === 'noite' && !env.night) return false;
  return !n.weather.length || n.weather.includes(env.weatherOf(n.biome));
}

/** Ambiente de agora para `nodeAvailable`. */
export function nodeEnvAt(w: CompanionWorld, now: number, cfg?: WeatherConfig, unlocks: readonly string[] = []): NodeEnv {
  const memo = new Map<string, WeatherKind>();
  return { night: isNightAt(now), unlocks, weatherOf: (slug) => { let k = memo.get(slug); if (!k) { k = regionWeather(w, slug, now, cfg); memo.set(slug, k); } return k; } };
}
