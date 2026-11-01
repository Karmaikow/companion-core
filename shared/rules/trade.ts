/**
 * Mural de trocas (Casa dos Ecos): um Companion desperto abre um pedido — vender materiais por Lumes, comprar
 * materiais com Lumes ou trocar materiais por materiais. O que ele oferece fica guardado (garantia) na hora de abrir,
 * então ninguém oferece o que não tem. Quem aceita entrega o que foi pedido e leva o que estava oferecido, numa
 * transação só. Abrir custa uma taxa pequena em Lumes (o mural não lota) e o pedido vence: a garantia volta.
 */
import { MATERIALS, CATEGORIES, PROP_LABEL, BAND_LABEL, atLeast, parseBatchKey, type PropKey, type Band } from './ecos.ts';

/** O que se oferece: um lote exato da mochila (quem aceita vê a qualidade) ou Lumes. */
export type TradeOffer = { kind: 'material'; key: string; qty: number } | { kind: 'lumes'; qty: number };
/** O que se pede: um material (com qualidade mínima opcional) ou Lumes. */
export type TradeWant = { kind: 'material'; material: string; prop?: PropKey; min?: Band; qty: number } | { kind: 'lumes'; qty: number };

export const TRADE = {
  /** taxa para abrir um pedido (Lumes; não volta) */
  fee: 5,
  /** pedidos abertos ao mesmo tempo por Companion */
  maxOpen: 5,
  /** horas até o pedido vencer (a garantia volta) */
  hours: 72,
  maxQty: 999,
  maxLumes: 1_000_000,
} as const;

const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

export function cleanOffer(v: unknown): TradeOffer | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.kind === 'lumes') { const q = int(o.qty, 1, TRADE.maxLumes); return q ? { kind: 'lumes', qty: q } : null; }
  if (o.kind === 'material') { const q = int(o.qty, 1, TRADE.maxQty); return q && typeof o.key === 'string' && parseBatchKey(o.key) ? { kind: 'material', key: o.key, qty: q } : null; }
  return null;
}
export function cleanWant(v: unknown): TradeWant | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.kind === 'lumes') { const q = int(o.qty, 1, TRADE.maxLumes); return q ? { kind: 'lumes', qty: q } : null; }
  if (o.kind !== 'material' || typeof o.material !== 'string' || !(o.material in MATERIALS)) return null;
  const q = int(o.qty, 1, TRADE.maxQty); if (!q) return null;
  const w: TradeWant = { kind: 'material', material: o.material, qty: q };
  if (typeof o.prop === 'string' && o.prop in MATERIALS[o.material].ranges && (o.min === 'media' || o.min === 'alta' || o.min === 'baixa')) { w.prop = o.prop as PropKey; w.min = o.min; }
  return w;
}
/** Um pedido precisa trocar alguma coisa por outra (Lumes por Lumes não vale). */
export const tradeValid = (o: TradeOffer | null, w: TradeWant | null): o is TradeOffer => !!o && !!w && !(o.kind === 'lumes' && w.kind === 'lumes');

/** O lote serve para o que foi pedido? */
export function wantFits(w: TradeWant, key: string): boolean {
  if (w.kind !== 'material') return false;
  const b = parseBatchKey(key);
  return !!b && b.material === w.material && (!w.prop || !w.min || atLeast(b.bands[w.prop], w.min));
}

/** Escolhe lotes da mochila que somam o pedido (os de qualidade mais baixa que ainda servem primeiro). */
export function pickForWant(w: TradeWant, bag: { key: string; qty: number }[]): { key: string; qty: number }[] | null {
  if (w.kind !== 'material') return null;
  const rank = (k: string) => Object.values(parseBatchKey(k)?.bands ?? {}).reduce((t, b) => t + ({ baixa: 0, media: 1, alta: 2 }[b as Band] ?? 0), 0);
  const fit = bag.filter((b) => b.qty > 0 && wantFits(w, b.key)).sort((a, b) => rank(a.key) - rank(b.key));
  const out: { key: string; qty: number }[] = [];
  let left = w.qty;
  for (const b of fit) { if (left <= 0) break; const t = Math.min(left, b.qty); out.push({ key: b.key, qty: t }); left -= t; }
  return left > 0 ? null : out;
}
/** Confere as escolhas de quem aceita (servidor): somam o pedido e cada lote serve. */
export function checkPicks(w: TradeWant, picks: { key: string; qty: number }[]): { key: string; qty: number }[] | null {
  if (w.kind !== 'material') return null;
  const merged = new Map<string, number>();
  for (const p of picks.slice(0, 20)) { const q = Math.round(Number(p.qty)); if (q > 0 && typeof p.key === 'string') merged.set(p.key, (merged.get(p.key) ?? 0) + q); }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total !== w.qty || [...merged.keys()].some((k) => !wantFits(w, k))) return null;
  return [...merged].map(([key, qty]) => ({ key, qty }));
}

const bandsText = (key: string) => { const b = parseBatchKey(key); return b ? Object.entries(b.bands).map(([p, v]) => `${PROP_LABEL[p as PropKey].toLowerCase()} ${BAND_LABEL[v as Band]}`).join(', ') : ''; };
export function offerText(o: TradeOffer): string {
  if (o.kind === 'lumes') return `${o.qty} Lumes`;
  const b = parseBatchKey(o.key); const m = b && MATERIALS[b.material];
  return m ? `${o.qty}× ${CATEGORIES[m.category].icon} ${m.name}${bandsText(o.key) ? ` (${bandsText(o.key)})` : ''}` : `${o.qty}× ${o.key}`;
}
export function wantText(w: TradeWant): string {
  if (w.kind === 'lumes') return `${w.qty} Lumes`;
  const m = MATERIALS[w.material];
  return `${w.qty}× ${CATEGORIES[m.category].icon} ${m.name}${w.prop && w.min ? ` (${PROP_LABEL[w.prop].toLowerCase()} ${BAND_LABEL[w.min]} ou mais)` : ''}`;
}
/** Tipo do pedido, para a interface. */
export const tradeKind = (o: TradeOffer, w: TradeWant) => (o.kind === 'lumes' ? 'compra' : w.kind === 'lumes' ? 'venda' : 'troca') as 'compra' | 'venda' | 'troca';
