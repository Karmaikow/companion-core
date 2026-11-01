/**
 * Lojas de Áster. A moeda é a mesma do Pacto (Lumes, sempre pelo livro-razão no servidor).
 *
 * Cada loja da cidade é um marcador "loja" com um tipo: Poções, Equipamentos ou Rotação. O estoque básico é fixo
 * (sem limite); a loja da Rotação (estoque global, diário e com requisitos) vem na etapa 3.
 * Consumíveis entram na bolsa com a chave `loja:<id>`; ferramentas viram peças do Pacto (com durabilidade), as
 * mesmas que a Forja Taurina conclui.
 *
 * Venda: a loja compra materiais da mochila do Vale (preço pela raridade e qualidade), drops dos monstros e o que ela
 * mesma vende (a 40%). Descobertas, raros e peças forjadas não se vendem.
 *
 * O ADM muda preços, itens, limites e o Mercadão (rotação diária com estoque global e requisitos) na aba Lojas:
 * ver ShopConfig no fim do arquivo.
 */
import { MATERIALS, parseBatchKey, bandRank, type ToolKey } from './ecos.ts';
import { findItem, type ItemDef, type Rarity } from './equipment.ts';
import type { CitySchool } from './escolas.ts';

export type ShopKind = 'pocoes' | 'equipamentos' | 'rotacao';
export const SHOP_KINDS: Record<ShopKind, { label: string; icon: string; merchant: string; greeting: string }> = {
  pocoes: { label: 'Loja de Poções', icon: '⚗️', merchant: 'Alquimista', greeting: 'Frascos fresquinhos e pão quente! Do que você precisa, viajante?' },
  equipamentos: { label: 'Loja de Equipamentos', icon: '⚒️', merchant: 'Ferramenteiro', greeting: 'Cabo firme, lâmina honesta. Vai trabalhar hoje?' },
  rotacao: { label: 'Mercadão', icon: '🧺', merchant: 'Mercador Viajante', greeting: 'Hoje não tenho muita coisa… volte quando as estrelas girarem.' },
};
export const SHOP_KIND_IDS = Object.keys(SHOP_KINDS) as ShopKind[];

/** Efeito de um consumível: fração do máximo (0,3 = 30%) recuperada; `over` = segundos para recuperar (comida). */
export interface ShopEffect { hp?: number; sp?: number; st?: number; over?: number }
export interface ShopGood {
  id: string;
  name: string;
  description: string;
  shop: ShopKind;
  price: number;
  kind: 'consumivel' | 'ferramenta';
  icon: string;
  effect?: ShopEffect;
  /** ferramenta: qual coleta libera e o projeto do Pacto que a descreve (durabilidade) */
  tool?: ToolKey;
  blueprint?: string;
}

const P = (id: string, name: string, price: number, icon: string, effect: ShopEffect, description: string): ShopGood => ({ id, name, description, shop: 'pocoes', price, kind: 'consumivel', icon, effect });
const T = (id: string, name: string, price: number, icon: string, tool: ToolKey, blueprint: string, description: string): ShopGood => ({ id, name, description, shop: 'equipamentos', price, kind: 'ferramenta', icon, tool, blueprint });

export const SHOP_GOODS: ShopGood[] = [
  P('pocao-vida-p', 'Poção de Vida Pequena', 15, '🧪', { hp: 0.3 }, 'Recupera 30% da vida na hora.'),
  P('pocao-vida-m', 'Poção de Vida Média', 40, '🧪', { hp: 0.6 }, 'Recupera 60% da vida na hora.'),
  P('pocao-sp-p', 'Poção de SP Pequena', 15, '🔹', { sp: 0.3 }, 'Recupera 30% do SP na hora.'),
  P('pocao-sp-m', 'Poção de SP Média', 40, '🔹', { sp: 0.6 }, 'Recupera 60% do SP na hora.'),
  P('pao-de-mel', 'Pão de Mel', 8, '🍞', { hp: 0.25, over: 15 }, 'Recupera 25% da vida aos poucos (15 s).'),
  P('sopa-de-raizes', 'Sopa de Raízes', 12, '🥣', { sp: 0.3, over: 15 }, 'Recupera 30% do SP aos poucos (15 s).'),
  P('espetinho', 'Espetinho Assado', 10, '🍢', { st: 0.5, over: 10 }, 'Recupera metade da stamina aos poucos (10 s).'),
  P('pocao-vida-g', 'Poção de Vida Grande', 90, '🧪', { hp: 1 }, 'Recupera toda a vida na hora. Só preparada na Escola do Veneno.'),
  P('pocao-sp-g', 'Poção de SP Grande', 90, '🔹', { sp: 1 }, 'Recupera todo o SP na hora. Só preparada na Escola do Veneno.'),
  P('elixir-lunar', 'Elixir Lunar', 140, '🌙', { hp: 0.6, sp: 0.6, st: 1, over: 20 }, 'Vida, SP e stamina aos poucos (20 s). Feito com Erva Lunar.'),
  P('torta-de-frutas', 'Torta de Frutas', 25, '🥧', { hp: 0.3, sp: 0.3, st: 0.3, over: 20 }, 'Um pouco de tudo: vida, SP e stamina (20 s).'),
  T('machado-simples', 'Machado Simples', 120, '🪓', 'machado', 'machado-simples', 'Para cortar árvores inteiras.'),
  T('picareta-simples', 'Picareta Simples', 120, '⛏️', 'picareta', 'picareta-simples', 'Quebra rocha e escava veios.'),
  T('foice-de-colheita', 'Foice de Colheita', 90, '🌾', 'faca', 'faca-de-colheita', 'Colhe flores, seiva e raízes sem estragar a planta.'),
];

export const SHOP_PREFIX = 'loja:';
export const shopKey = (id: string) => SHOP_PREFIX + id;
export const goodById = (id: string) => SHOP_GOODS.find((g) => g.id === id) ?? null;
export const goodByKey = (key: string) => (key.startsWith(SHOP_PREFIX) ? goodById(key.slice(SHOP_PREFIX.length)) : null);
export const goodsOf = (shop: ShopKind) => SHOP_GOODS.filter((g) => g.shop === shop);

export const MAX_BUY = 50;
/** Pode comprar? Devolve o motivo de não poder (null = pode). */
export function buyCheck(good: ShopGood | null, qty: number, lumes: number): string | null {
  if (!good) return 'Esse item não está à venda.';
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_BUY) return `Compre de 1 a ${MAX_BUY}.`;
  if (good.kind === 'ferramenta' && qty !== 1) return 'Ferramentas: uma por vez.';
  if (good.price * qty > lumes) return 'Lumes insuficientes.';
  return null;
}

/** A loja paga 40% do preço do que ela mesma vende. */
export const SELL_RATE = 0.4;
const VALE_PRICE: Record<1 | 2 | 3, number> = { 1: 3, 2: 8, 3: 20 };
const QUALITY_MUL = [0.8, 1, 1.3];
const DROP_PRICE: Record<Rarity, number> = { comum: 2, incomum: 5, rara: 12, lendaria: 30 };

/** Lote da mochila do Vale: raridade do material × qualidade média das faixas. */
export function valeSellPrice(batchKey: string): number | null {
  const b = parseBatchKey(batchKey);
  if (!b) return null;
  const ranks = Object.values(b.bands).map((v) => bandRank(v));
  const avg = ranks.length ? Math.round(ranks.reduce((a, r) => a + r, 0) / ranks.length) : 1;
  return Math.max(1, Math.round(VALE_PRICE[MATERIALS[b.material].rarity] * QUALITY_MUL[Math.max(0, Math.min(2, avg))]));
}

/**
 * Item da bolsa (chave + meta): o que a loja vende (40%), drops e materiais do catálogo (pela raridade).
 * Descobertas, raros, itens de quest e o resto do catálogo (armas, equipamentos) não se vendem: null.
 */
export function bagSellPrice(key: string, meta: Record<string, unknown>, catalog: ItemDef[], cfg: ShopConfig = DEFAULT_SHOP): number | null {
  if (meta.rare || meta.secret || meta.quest) return null;
  const good = goodByKey(key);
  if (good) return good.kind === 'consumivel' ? goodResale(good.id, cfg) : null;
  const it = key.startsWith('drop:') ? findItem(key.slice(5), catalog) : catalog.find((i) => i.slug === key) ?? null;
  if (it) return it.type in MATERIAL_TYPES ? DROP_PRICE[it.rarity] : null;
  return key.startsWith('drop:') ? 1 : null;
}
const MATERIAL_TYPES = { madeira: 1, minerio: 1, pedra: 1, fibra: 1, erva: 1, gema: 1, essencia: 1, parte: 1 };

/** Lumes que um monstro solta: o intervalo do Invocador, +10% por nível acima do 1. */
export function rollLumes(range: [number, number], level: number, rng: () => number): number {
  const [a, b] = range;
  if (b <= 0) return 0;
  const base = a + Math.floor(rng() * (b - a + 1));
  return Math.max(0, Math.round(base * (1 + 0.1 * (Math.max(1, level) - 1))));
}

/** Lumes por quest concluída (descobertas da conversa). */
export const QUEST_LUMES = 40;

// ---------------------------------------------------------------------------
// Configuração do ADM (aba Lojas): o que cada loja vende, por quanto e quanto; o Mercadão rotativo.
// Fica em game_config.values.shop; sem nada salvo, vale DEFAULT_SHOP (o estoque acima).
// ---------------------------------------------------------------------------

/** O que a entrada vende: um item da loja (poções, comidas, ferramentas) ou um item do Arsenal. */
export type ShopRef = { kind: 'loja'; good: string } | { kind: 'item'; slug: string };
export interface ShopEntry {
  id: string;
  shop: ShopKind;
  ref: ShopRef;
  price: number;
  /** máximo por compra (ferramenta: sempre 1) */
  maxBuy: number;
  enabled: boolean;
  /** Mercadão: quantos o servidor inteiro pode comprar por dia (0 = sem limite) */
  stock: number;
  /** Mercadão: chance de entrar no sorteio do dia (peso) */
  weight: number;
  /** requisito: estudar nesta escola */
  school: CitySchool | null;
  /** requisito: materiais do Vale entregues junto com os Lumes */
  materials: { material: string; qty: number }[];
}
export interface ShopConfig { entries: ShopEntry[]; sellRate: number; rotationPerDay: number }

const entryOf = (g: ShopGood): ShopEntry => ({ id: g.id, shop: g.shop, ref: { kind: 'loja', good: g.id }, price: g.price, maxBuy: g.kind === 'ferramenta' ? 1 : MAX_BUY, enabled: true, stock: 0, weight: 1, school: null, materials: [] });
/** bens que só a Escola do Veneno prepara (a loja padrão não vende; o ADM pode pôr à venda na aba Lojas) */
export const SCHOOL_ONLY_GOODS = ['pocao-vida-g', 'pocao-sp-g', 'elixir-lunar'];
export const DEFAULT_SHOP: ShopConfig = { entries: SHOP_GOODS.filter((g) => !SCHOOL_ONLY_GOODS.includes(g.id)).map(entryOf), sellRate: SELL_RATE, rotationPerDay: 4 };
export const MAX_SHOP_ENTRIES = 120;

const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const ENTRY_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
export function sanitizeShopEntry(raw: unknown, i = 0): ShopEntry | null {
  const e = (raw ?? {}) as Partial<ShopEntry> & { ref?: Partial<{ kind: string; good: string; slug: string }> };
  const ref: ShopRef | null = e.ref?.kind === 'loja' && typeof e.ref.good === 'string' && goodById(e.ref.good) ? { kind: 'loja', good: e.ref.good }
    : e.ref?.kind === 'item' && typeof e.ref.slug === 'string' && /^[a-z0-9][a-z0-9_-]{0,60}$/.test(e.ref.slug) ? { kind: 'item', slug: e.ref.slug } : null;
  if (!ref || !SHOP_KIND_IDS.includes(e.shop as ShopKind)) return null;
  const tool = ref.kind === 'loja' && goodById(ref.good)!.kind === 'ferramenta';
  return {
    id: typeof e.id === 'string' && ENTRY_ID.test(e.id) ? e.id : `item-${i}`,
    shop: e.shop as ShopKind, ref,
    price: Math.round(n(e.price, 0, 1_000_000, 10)),
    maxBuy: tool ? 1 : Math.round(n(e.maxBuy, 1, 999, MAX_BUY)),
    enabled: e.enabled !== false,
    stock: Math.round(n(e.stock, 0, 100_000, 0)),
    weight: n(e.weight, 0, 100, 1),
    school: e.school === 'forja' || e.school === 'veneno' ? e.school : null,
    materials: (Array.isArray(e.materials) ? e.materials : []).filter((m) => m && MATERIALS[m.material]).slice(0, 6).map((m) => ({ material: m.material, qty: Math.round(n(m.qty, 1, 999, 1)) })),
  };
}
export function resolveShop(raw: unknown): ShopConfig {
  const r = (raw ?? {}) as Partial<ShopConfig>;
  if (!Array.isArray(r.entries)) return { ...DEFAULT_SHOP, sellRate: n(r.sellRate, 0, 1, SELL_RATE), rotationPerDay: Math.round(n(r.rotationPerDay, 0, 30, 4)) };
  const ids = new Set<string>();
  const entries: ShopEntry[] = [];
  for (const [i, x] of r.entries.slice(0, MAX_SHOP_ENTRIES).entries()) {
    const e = sanitizeShopEntry(x, i); if (!e) continue;
    while (ids.has(e.id)) e.id += '-2';
    ids.add(e.id); entries.push(e);
  }
  return { entries, sellRate: n(r.sellRate, 0, 1, SELL_RATE), rotationPerDay: Math.round(n(r.rotationPerDay, 0, 30, 4)) };
}

/** O que mostrar de uma entrada (nome, ícone, tipo), seja item da loja ou do Arsenal. */
export function entryInfo(e: ShopEntry, catalog: ItemDef[]): { name: string; icon: string; description: string; kind: 'consumivel' | 'ferramenta' | 'item'; item?: ItemDef } | null {
  if (e.ref.kind === 'loja') { const g = goodById(e.ref.good); return g ? { name: g.name, icon: g.icon, description: g.description, kind: g.kind } : null; }
  const it = findItem(e.ref.slug, catalog);
  return it ? { name: it.name, icon: '✦', description: it.description ?? '', kind: 'item', item: it } : null;
}

/** Dia do Mercadão (horário de Brasília): a rotação e o estoque global viram à meia-noite. */
export const shopDay = (now = Date.now()) => new Date(now - 3 * 3_600_000).toISOString().slice(0, 10);
function seeded(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

/** O que uma loja mostra hoje: as fixas, tudo o que está ativo; o Mercadão, um sorteio do dia (pelo peso). */
export function shopListing(cfg: ShopConfig, shop: ShopKind, day = shopDay()): ShopEntry[] {
  const all = cfg.entries.filter((e) => e.shop === shop && e.enabled);
  if (shop !== 'rotacao') return all;
  const pool = all.filter((e) => e.weight > 0), rnd = seeded('mercadao:' + day), out: ShopEntry[] = [];
  while (pool.length && out.length < cfg.rotationPerDay) {
    let t = rnd() * pool.reduce((a, e) => a + e.weight, 0), k = 0;
    while (k < pool.length - 1 && (t -= pool[k].weight) > 0) k++;
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

/** Pode comprar esta entrada? (null = pode). `sold`: quanto o servidor já vendeu hoje; `bag`: mochila do Vale. */
export function entryBuyCheck(e: ShopEntry | null, qty: number, ctx: { lumes: number; sold?: number; schools?: readonly string[]; bag?: { key: string; qty: number }[]; listed?: boolean }): string | null {
  if (!e || !e.enabled || ctx.listed === false) return 'Esse item não está à venda hoje.';
  if (!Number.isInteger(qty) || qty < 1 || qty > e.maxBuy) return e.maxBuy === 1 ? 'Uma unidade por vez.' : `Compre de 1 a ${e.maxBuy}.`;
  if (e.stock > 0 && (ctx.sold ?? 0) + qty > e.stock) return (ctx.sold ?? 0) >= e.stock ? 'Esgotado hoje.' : `Só restam ${e.stock - (ctx.sold ?? 0)} hoje.`;
  if (e.school && !(ctx.schools ?? []).includes(e.school)) return `Só para quem estuda na Escola ${e.school === 'forja' ? 'da Forja' : 'do Veneno'}.`;
  if (e.price * qty > ctx.lumes) return 'Lumes insuficientes.';
  if (e.materials.length && ctx.bag && !materialsTake(e, qty, ctx.bag)) return 'Faltam: ' + e.materials.map((m) => `${m.qty * qty}× ${MATERIALS[m.material].name}`).join(', ') + '.';
  return null;
}
/** Lotes da mochila que pagam os materiais exigidos (qualquer qualidade; os piores primeiro). null = falta. */
export function materialsTake(e: ShopEntry, qty: number, bag: { key: string; qty: number }[]): { key: string; qty: number }[] | null {
  const out: { key: string; qty: number }[] = [];
  for (const m of e.materials) {
    let need = m.qty * qty;
    const lots = bag.filter((b) => b.qty > 0 && parseBatchKey(b.key)?.material === m.material).sort((a, b) => bandSum(a.key) - bandSum(b.key) || a.key.localeCompare(b.key));
    for (const b of lots) { if (!need) break; const t = Math.min(need, b.qty); out.push({ key: b.key, qty: t }); need -= t; }
    if (need) return null;
  }
  return out;
}
const bandSum = (k: string) => Object.values(parseBatchKey(k)?.bands ?? {}).reduce((a, b) => a + bandRank(b), 0);
/** Preço de revenda de um item da loja com a configuração do ADM (preço atual × taxa). */
export function goodResale(goodId: string, cfg: ShopConfig): number {
  const e = cfg.entries.find((x) => x.ref.kind === 'loja' && x.ref.good === goodId && x.shop !== 'rotacao') ?? cfg.entries.find((x) => x.ref.kind === 'loja' && x.ref.good === goodId);
  return Math.max(1, Math.floor((e?.price ?? goodById(goodId)?.price ?? 0) * cfg.sellRate));
}
