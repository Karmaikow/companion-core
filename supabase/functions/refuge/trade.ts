// Mural de trocas (Casa dos Ecos): abrir, aceitar e cancelar pedidos. Regras em shared/rules/trade.ts; a garantia,
// a troca e a devolução são atômicas no banco (trade_post, trade_fill, trade_cancel, trade_expire).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { TRADE, cleanOffer, cleanWant, tradeValid, checkPicks, cleanRequestId, offerText, wantText, type Discoveries, type TradeOffer, type TradeWant } from './rules/index.ts';

export class TradeError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const REASON: Record<string, string> = {
  'muitos-pedidos': `Você já tem ${TRADE.maxOpen} pedidos abertos no mural. Cancele um ou espere aceitarem.`,
  'sem-lumes': 'Lumes insuficientes.',
  'faltam-materiais': 'Faltam esses materiais na mochila.',
  'pedido-sumiu': 'Esse pedido não existe mais.',
  'pedido-fechado': 'Esse pedido já foi fechado (aceito, cancelado ou vencido).',
  'proprio': 'Esse pedido é seu: para tirar do mural, cancele.',
};

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; event: (cid: string, kind: string, payload: unknown) => Promise<number> }

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new TradeError(500, 'Falha no servidor (mural).');
  const r = data as { ok: boolean; reason?: string; repeat?: boolean; owner?: string };
  if (!r.ok) throw new TradeError(409, REASON[r.reason ?? ''] ?? 'Não deu certo.');
  return r;
}

export async function tradeBoard(db: SupabaseClient, cid: string) {
  await db.rpc('trade_expire');
  const [open, mine] = await Promise.all([
    db.from('trade_orders').select('id,companion_id,offer,want,created_at,expires_at').eq('status', 'aberta').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(80),
    db.from('trade_orders').select('id,status,offer,want,created_at,expires_at,closed_at').eq('companion_id', cid).order('created_at', { ascending: false }).limit(20),
  ]);
  const owners = [...new Set((open.data ?? []).map((r) => r.companion_id as string))];
  const { data: who } = owners.length ? await db.from('companions').select('id,discoveries').in('id', owners) : { data: [] };
  const name = new Map((who ?? []).map((w) => [w.id as string, ((w.discoveries as Discoveries)?.name as string | undefined) ?? 'Um Companion']));
  return {
    rules: { fee: TRADE.fee, maxOpen: TRADE.maxOpen, hours: TRADE.hours },
    open: (open.data ?? []).filter((r) => r.companion_id !== cid).map((r) => ({ id: r.id as string, owner: name.get(r.companion_id as string) ?? 'Um Companion', offer: r.offer as TradeOffer, want: r.want as TradeWant, createdAt: r.created_at as string, expiresAt: r.expires_at as string })),
    mine: (mine.data ?? []).map((r) => ({ id: r.id as string, status: r.status as string, offer: r.offer as TradeOffer, want: r.want as TradeWant, createdAt: r.created_at as string, expiresAt: r.expires_at as string, closedAt: (r.closed_at as string | null) ?? null })),
  };
}

export async function tradeAction(action: string, body: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown>> {
  const { db, c } = ctx, cid = c.id as string;
  if (c.stage !== 'awakened') throw new TradeError(409, 'O mural é para Companions despertos.');
  if (action === 'trade.board') return { board: await tradeBoard(db, cid) };

  if (action === 'trade.post') {
    const id = cleanRequestId(body.id); if (!id) throw new TradeError(400, 'Pedido inválido.');
    const offer = cleanOffer(body.offer), want = cleanWant(body.want);
    if (!tradeValid(offer, want)) throw new TradeError(400, 'Monte o pedido: o que você oferece e o que quer em troca.');
    await rpc(db, 'trade_post', { p_id: id, p_cid: cid, p_offer: offer, p_want: want, p_fee: TRADE.fee, p_hours: TRADE.hours, p_max_open: TRADE.maxOpen });
    await ctx.event(cid, 'trade.posted', { id, offer: offerText(offer), want: wantText(want!) });
    return { posted: id, board: await tradeBoard(db, cid) };
  }

  if (action === 'trade.fill') {
    const id = cleanRequestId(body.id); if (!id) throw new TradeError(400, 'Pedido inválido.');
    const { data: o } = await db.from('trade_orders').select('want,offer').eq('id', id).maybeSingle();
    if (!o) throw new TradeError(404, REASON['pedido-sumiu']);
    const want = cleanWant(o.want);
    if (!want) throw new TradeError(409, REASON['pedido-sumiu']);
    let picks: { key: string; qty: number }[] = [];
    if (want.kind === 'material') {
      const ok = checkPicks(want, Array.isArray(body.picks) ? (body.picks as { key: string; qty: number }[]) : []);
      if (!ok) throw new TradeError(409, 'Esses materiais não servem para esse pedido.');
      picks = ok;
    }
    const r = await rpc(db, 'trade_fill', { p_order: id, p_cid: cid, p_picks: picks });
    if (r.owner) await ctx.event(r.owner, 'trade.filled', { id, by: cid, offer: offerText(cleanOffer(o.offer)!), want: wantText(want) });
    return { filled: id, board: await tradeBoard(db, cid) };
  }

  if (action === 'trade.cancel') {
    const id = cleanRequestId(body.id); if (!id) throw new TradeError(400, 'Pedido inválido.');
    await rpc(db, 'trade_cancel', { p_order: id, p_cid: cid });
    return { cancelled: id, board: await tradeBoard(db, cid) };
  }

  throw new TradeError(404, 'Ação desconhecida.');
}
