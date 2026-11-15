/**
 * Baús de drop e a reconstrução de Áster.
 *
 * Baús: o monstro derrotado deixa um baú no chão, com o que ele soltou (sorteado no servidor), os Lumes e, às vezes,
 * Cristais Ápice. Abrir revela o conteúdo (Lumes e cristais vão na hora) e
 * os itens vão para a bolsa no que couber; o que não couber fica no baú aberto por um tempo. Elites e chefes deixam
 * baú raro; o MVP, baú lendário. Baú que some leva o que ficou dentro.
 *
 * Reconstrução: quando Áster cai (fim da defesa; por enquanto o ADM derruba), a Torre Central pede uma meta do
 * servidor inteiro: Cristais Ápice, materiais da coleta (refinados) e Lumes. Quando a meta fecha, a cidade volta ao
 * normal e todos que ajudaram são reconhecidos. Metas e chances no Admin (game_config.values.aster).
 */
import { MATERIALS, CATEGORIES, PROP_LABEL, BAND_LABEL, atLeast, parseBatchKey, type ResCategory, type PropKey, type Band } from './ecos.ts';
import type { CreatureDef } from './creatures.ts';

export type ChestTier = 'comum' | 'raro' | 'lendario';
export const CHEST_TIERS: Record<ChestTier, { label: string; color: string }> = {
  comum: { label: 'Baú', color: '#b88a55' }, raro: { label: 'Baú raro', color: '#9fb6d8' }, lendario: { label: 'Baú lendário', color: '#ffc457' },
};
/** item da bolsa que guarda os cristais */
export const CRYSTAL_KEY = 'cristal-apice';
export const CRYSTAL_LABEL = 'Cristal Ápice';
export const CRYSTALS_LABEL = 'Cristais Ápice';
/**
 * Tempo de cada estado do baú: fechado (some com o que tinha dentro), aberto com itens que ainda não couberam na bolsa,
 * e vazio (só a animação de sumir, no cliente).
 */
export const CHEST_TTL_MS = 3 * 60_000;
export const CHEST_OPEN_TTL_MS = 2 * 60_000;
export const CHEST_EMPTY_MS = 10_000;
/** carga máxima para ainda pegar itens do baú (vezes a capacidade): acima disso, o resto fica no baú */
export const CHEST_CARRY_LIMIT = 2;
export type ChestState = 'fechado' | 'aberto' | 'vazio';
/** distância máxima para abrir (m): o baú abre no clique, de onde o Companion estiver (é o raio em que ele aparece na tela) */
export const CHEST_REACH = 60;

export function chestTierFor(def: Pick<CreatureDef, 'family'> | null): ChestTier {
  const t = def?.family?.tier;
  return t === 'mvp' ? 'lendario' : t === 'elite' || t === 'chefe' ? 'raro' : 'comum';
}

export interface ChestContents { drops: { key: string; label: string; qty: number; category: string }[]; lumes: number; crystals: number }

// ---------------------------------------------------------------------------
// Um baú para todos (mundo compartilhado): quem simulava o monstro cria o baú no servidor e avisa os outros jogadores
// pelo canal; quem abrir primeiro leva. O aviso vem de outro jogador, então nada nele é de confiança: serve só para
// DESENHAR o baú — abrir e pegar continuam conferidos no servidor (um baú inventado simplesmente não abre).
// ---------------------------------------------------------------------------

/** Quem pede a recompensa da derrota: `own` conta e deixa o baú; `none` só conta; `only` só deixa o baú. */
export type KillLoot = 'own' | 'none' | 'only';
/**
 * O que cada jogo pede ao servidor quando o monstro cai. `owner`: este jogo simulava o monstro (ou está sozinho);
 * `hit`: este Companion bateu nele há pouco. Devolve null quando não há nada a pedir.
 */
export function killLoot(owner: boolean, hit: boolean): KillLoot | null {
  if (owner) return hit ? 'own' : 'only';
  return hit ? 'none' : null;
}

export interface SharedChest { id: string; tier: ChestTier; x: number; z: number; expiresAt: number; crystals: number; state: 'fechado'; drops: [] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Aviso "nasceu um baú aqui". `now` em ms. O prazo nunca passa do tempo de um baú fechado. */
export function readSharedChest(d: unknown, now: number): SharedChest | null {
  if (!d || typeof d !== 'object') return null;
  const c = d as Record<string, unknown>;
  if (typeof c.id !== 'string' || !UUID.test(c.id)) return null;
  if (c.tier !== 'comum' && c.tier !== 'raro' && c.tier !== 'lendario') return null;
  const x = Number(c.x), z = Number(c.z), exp = Number(c.expiresAt);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) >= 1000 || Math.abs(z) >= 1000 || !Number.isFinite(exp) || exp <= now) return null;
  return { id: c.id, tier: c.tier, x, z, expiresAt: Math.min(exp, now + CHEST_TTL_MS), crystals: Math.min(20, Math.max(0, Math.round(Number(c.crystals) || 0))), state: 'fechado', drops: [] };
}

/** Aviso "este baú foi aberto": `left` = ainda tem itens dentro (os outros podem pegar o que sobrou). */
export function readChestOpened(d: unknown): { id: string; left: boolean } | null {
  if (!d || typeof d !== 'object') return null;
  const c = d as Record<string, unknown>;
  return typeof c.id === 'string' && UUID.test(c.id) ? { id: c.id, left: c.left === true } : null;
}

// ---------------------------------------------------------------------------
// Configuração (Admin → Servidor → Áster)
// ---------------------------------------------------------------------------

export interface RebuildNeed { label: string; category?: ResCategory; material?: string; prop?: PropKey; min?: Band; qty: number }
export interface AsterConfig {
  /** chance de um baú trazer cristais e quantos (por tipo de baú) */
  crystals: Record<ChestTier, { chance: number; qty: number }>;
  /** meta da reconstrução */
  rebuild: { crystals: number; lumes: number; materials: RebuildNeed[] };
}
export const DEFAULT_ASTER: AsterConfig = {
  crystals: { comum: { chance: 0.04, qty: 1 }, raro: { chance: 0.3, qty: 1 }, lendario: { chance: 1, qty: 3 } },
  rebuild: {
    crystals: 30, lumes: 3000,
    materials: [
      { label: 'Blocos Lapidados', material: 'bloco-lapidado', qty: 10 },
      { label: 'Tábuas Nobres', material: 'tabua-nobre', qty: 10 },
      { label: 'Lingotes de Cobre', material: 'lingote-de-cobre', qty: 6 },
    ],
  },
};
const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
export function resolveAster(v: unknown): AsterConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<AsterConfig>;
  const c = (o.crystals ?? {}) as Partial<AsterConfig['crystals']>;
  const tier = (t: ChestTier) => ({ chance: n(c[t]?.chance, 0, 1, DEFAULT_ASTER.crystals[t].chance), qty: Math.round(n(c[t]?.qty, 1, 20, DEFAULT_ASTER.crystals[t].qty)) });
  const r = (o.rebuild ?? {}) as Partial<AsterConfig['rebuild']>;
  const mats = (Array.isArray(r.materials) ? r.materials : DEFAULT_ASTER.rebuild.materials).slice(0, 8).map((m): RebuildNeed | null => {
    const x = (m ?? {}) as Partial<RebuildNeed>;
    const out: RebuildNeed = { label: typeof x.label === 'string' && x.label.trim() ? x.label.trim().slice(0, 40) : 'Material', qty: Math.round(n(x.qty, 1, 9999, 5)) };
    if (typeof x.material === 'string' && x.material in MATERIALS) out.material = x.material;
    else if (typeof x.category === 'string' && x.category in CATEGORIES) out.category = x.category;
    else return null;
    if (typeof x.prop === 'string' && x.prop in PROP_LABEL && x.min && ['baixa', 'media', 'alta'].includes(x.min)) { out.prop = x.prop; out.min = x.min; }
    return out;
  }).filter((x): x is RebuildNeed => !!x);
  return {
    crystals: { comum: tier('comum'), raro: tier('raro'), lendario: tier('lendario') },
    rebuild: { crystals: Math.round(n(r.crystals, 0, 99999, DEFAULT_ASTER.rebuild.crystals)), lumes: Math.round(n(r.lumes, 0, 9_999_999, DEFAULT_ASTER.rebuild.lumes)), materials: mats },
  };
}

/** Cristais de um baú (`rnd` em [0,1)). */
export function rollCrystals(tier: ChestTier, cfg: AsterConfig, rnd: () => number): number {
  const c = cfg.crystals[tier];
  return rnd() < c.chance ? c.qty : 0;
}

/** O lote da mochila serve para esse material da reconstrução? */
export function rebuildFits(need: RebuildNeed, key: string): boolean {
  const b = parseBatchKey(key);
  if (!b) return false;
  if (need.material ? b.material !== need.material : MATERIALS[b.material]?.category !== need.category) return false;
  return !need.prop || !need.min || atLeast(b.bands[need.prop], need.min);
}
export const needText = (m: RebuildNeed) => `${m.label}${m.prop && m.min ? ` (${PROP_LABEL[m.prop].toLowerCase()} ${BAND_LABEL[m.min]}+)` : ''}`;

// ---------------------------------------------------------------------------
// Estado da cidade
// ---------------------------------------------------------------------------

export interface RebuildProgress { crystals: number; lumes: number; materials: number[] }
export interface CityRebuild { state: 'normal' | 'destruida'; round: number; progress: RebuildProgress; destroyedAt: string | null; rebuiltAt: string | null }
export const EMPTY_PROGRESS: RebuildProgress = { crystals: 0, lumes: 0, materials: [] };
export function cleanProgress(v: unknown): RebuildProgress {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<RebuildProgress>;
  return { crystals: Math.max(0, Number(o.crystals) || 0), lumes: Math.max(0, Number(o.lumes) || 0), materials: Array.isArray(o.materials) ? o.materials.map((x) => Math.max(0, Number(x) || 0)) : [] };
}
export const rebuildDone = (goals: AsterConfig['rebuild'], p: RebuildProgress) =>
  p.crystals >= goals.crystals && p.lumes >= goals.lumes && goals.materials.every((m, i) => (p.materials[i] ?? 0) >= m.qty);
/** quanto falta, de 0 (nada) a 1 (pronto), pela média das partes */
export function rebuildRatio(goals: AsterConfig['rebuild'], p: RebuildProgress): number {
  const parts = [goals.crystals ? Math.min(1, p.crystals / goals.crystals) : 1, goals.lumes ? Math.min(1, p.lumes / goals.lumes) : 1, ...goals.materials.map((m, i) => Math.min(1, (p.materials[i] ?? 0) / m.qty))];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
