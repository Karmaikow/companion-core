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
 */
import { MATERIALS, parseBatchKey, bandRank, type ToolKey } from './ecos.ts';
import { findItem, type ItemDef, type Rarity } from './equipment.ts';

export type ShopKind = 'pocoes' | 'equipamentos' | 'rotacao';
export const SHOP_KINDS: Record<ShopKind, { label: string; icon: string; merchant: string; greeting: string }> = {
  pocoes: { label: 'Loja de Poções', icon: '⚗️', merchant: 'Alquimista', greeting: 'Frascos fresquinhos e pão quente! Do que você precisa, viajante?' },
  equipamentos: { label: 'Loja de Equipamentos', icon: '⚒️', merchant: 'Ferramenteiro', greeting: 'Cabo firme, lâmina honesta. Vai trabalhar hoje?' },
  rotacao: { label: 'Loja da Rotação', icon: '✧', merchant: 'Mercador Viajante', greeting: 'Hoje não tenho muita coisa… volte quando as estrelas girarem.' },
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
export function bagSellPrice(key: string, meta: Record<string, unknown>, catalog: ItemDef[]): number | null {
  if (meta.rare || meta.secret || meta.quest) return null;
  const good = goodByKey(key);
  if (good) return good.kind === 'consumivel' ? Math.max(1, Math.floor(good.price * SELL_RATE)) : null;
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
