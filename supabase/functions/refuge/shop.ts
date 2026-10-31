// Lojas de Áster no servidor: preço, estoque e o que entra/sai vêm das regras (shared/rules/shop.ts); a gravação é
// uma transação só (`shop_trade`), idempotente pelo request_id. O cliente nunca diz quanto custa.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  goodById, buyCheck, shopKey, valeSellPrice, bagSellPrice, blueprintById, cleanRequestId, SHOP_KINDS, MAX_BUY,
  type ItemDef,
} from './rules/index.ts';
import { PactoError } from './pacto.ts';

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; admin: boolean; catalog: () => Promise<ItemDef[]>; state: () => Promise<unknown> }

const REASON: Record<string, string> = {
  'sem-lumes': 'Lumes insuficientes.',
  'faltam-materiais': 'Esse material não está mais na mochila.',
  'sem-item': 'Esse item não está mais na bolsa.',
};

export async function shopAction(action: string, body: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown>> {
  const { db, c } = ctx;
  const cid = c.id as string;
  if (c.stage !== 'awakened') throw new PactoError(409, 'As lojas abrem depois do despertar.');
  const request = cleanRequestId(body.request);
  if (!request) throw new PactoError(400, 'Pedido inválido.');
  const qty = Math.round(Number(body.qty) || 1);
  const trade = async (delta: number, ref: string, inv: unknown[], bag: unknown[], equip: unknown) => {
    const { data, error } = await db.rpc('shop_trade', { p_request: request, p_cid: cid, p_delta: delta, p_ref: ref, p_inv: inv, p_bag: bag, p_equip: equip });
    if (error) throw new PactoError(500, 'Falha no servidor (loja).');
    const r = data as { ok: boolean; reason?: string; repeat?: boolean };
    if (!r.ok) throw new PactoError(409, REASON[r.reason ?? ''] ?? 'Não deu certo.');
    return { shop: { ok: true, delta, repeat: !!r.repeat }, pacto: await ctx.state() };
  };

  // só ADM (Modo GOD): pôr Lumes na própria carteira para testar
  if (action === 'pacto.shop.grant') {
    if (!ctx.admin) throw new PactoError(403, 'Só o Administrador.');
    const amount = Math.max(1, Math.min(100000, Math.round(Number(body.amount) || 0)));
    const { error } = await db.rpc('pacto_lumes', { p_request: request, p_cid: cid, p_delta: amount, p_reason: 'teste-admin', p_ref: null });
    if (error) throw new PactoError(500, 'Falha no servidor (lumes).');
    return { shop: { ok: true, delta: amount }, pacto: await ctx.state() };
  }

  if (action === 'pacto.shop.buy') {
    const good = goodById(String(body.good ?? ''));
    const { data: prof } = await db.from('pacto_profile').select('lumes').eq('companion_id', cid).maybeSingle();
    const fail = buyCheck(good, qty, Number(prof?.lumes ?? 0));
    if (fail) throw new PactoError(409, fail);
    const g = good!;
    const cost = -g.price * qty;
    if (g.kind === 'ferramenta') {
      const durability = blueprintById(g.blueprint ?? '')?.durability ?? 50;
      const data = { name: g.name, rarity: 'comum', history: [{ at: new Date().toISOString(), what: `comprado na ${SHOP_KINDS[g.shop].label}` }] };
      return trade(cost, g.id, [], [], { id: crypto.randomUUID(), blueprint: g.blueprint, tool: g.tool, durability, data });
    }
    return trade(cost, g.id, [{ key: shopKey(g.id), qty, meta: { label: g.name, description: g.description, category: 'diversos', shop: g.id } }], [], null);
  }

  if (action === 'pacto.shop.sell') {
    const key = typeof body.key === 'string' ? body.key.slice(0, 120) : '';
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_BUY * 20) throw new PactoError(400, 'Quantidade inválida.');
    if (body.from === 'vale') {
      const price = valeSellPrice(key);
      if (price == null) throw new PactoError(409, 'A loja não compra isso.');
      return trade(price * qty, key, [], [{ key, qty }], null);
    }
    const { data: row } = await db.from('companion_inventory').select('qty,meta').eq('companion_id', cid).eq('item_key', key).maybeSingle();
    if (!row || row.qty < qty) throw new PactoError(409, 'Esse item não está na bolsa.');
    const price = bagSellPrice(key, (row.meta ?? {}) as Record<string, unknown>, await ctx.catalog());
    if (price == null) throw new PactoError(409, 'A loja não compra isso.');
    return trade(price * qty, key, [{ key, qty: -qty }], [], null);
  }

  throw new PactoError(404, 'Ação desconhecida.');
}
