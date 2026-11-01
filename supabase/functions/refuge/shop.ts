// Lojas e escolas de Áster no servidor (matrícula e bancada da Escola do Veneno): preço, estoque e o que entra/sai vêm das regras (shared/rules/shop.ts); a gravação é
// uma transação só (`shop_trade`), idempotente pelo request_id. O cliente nunca diz quanto custa.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  goodById, shopKey, valeSellPrice, bagSellPrice, blueprintById, cleanRequestId, SHOP_KINDS, MAX_BUY, categoryOf,
  entryBuyCheck, entryInfo, materialsTake, shopDay, shopListing,
  isCitySchool, schoolBlock, cleanSchools, studiesAt, brewById, brewCheck,
  type ItemDef, type ShopConfig,
} from './rules/index.ts';
import { PactoError, classInfo } from './pacto.ts';

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; admin: boolean; shop: ShopConfig; catalog: () => Promise<ItemDef[]>; state: () => Promise<unknown> }

const REASON: Record<string, string> = {
  'sem-lumes': 'Lumes insuficientes.',
  'esgotado': 'Esgotado hoje.',
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
  const trade = async (delta: number, ref: string, inv: unknown[], bag: unknown[], equip: unknown, why: string | null = null, stock: unknown = null) => {
    const { data, error } = await db.rpc('shop_trade', { p_request: request, p_cid: cid, p_delta: delta, p_ref: ref, p_inv: inv, p_bag: bag, p_equip: equip, p_reason: why, p_stock: stock });
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

  // compra pela configuração do ADM (aba Lojas): preço, limite, estoque do dia e requisitos vêm de lá
  if (action === 'pacto.shop.buy') {
    const cfg = ctx.shop, day = shopDay();
    const e = cfg.entries.find((x) => x.id === String(body.entry ?? '')) ?? null;
    const [{ data: prof }, { data: bag }, { data: st }] = await Promise.all([
      db.from('pacto_profile').select('*').eq('companion_id', cid).maybeSingle(),
      db.from('ecos_bag').select('batch_key,qty').eq('companion_id', cid),
      e ? db.from('shop_stock').select('sold').eq('day', day).eq('entry', e.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const vale = (bag ?? []).map((b) => ({ key: b.batch_key as string, qty: b.qty as number }));
    const fail = entryBuyCheck(e, qty, { lumes: Number(prof?.lumes ?? 0), sold: Number(st?.sold ?? 0), schools: cleanSchools(prof?.schools), bag: vale, listed: !!e && shopListing(cfg, e.shop, day).some((x) => x.id === e.id) });
    if (fail) throw new PactoError(409, fail);
    const entry = e!, info = entryInfo(entry, await ctx.catalog());
    if (!info) throw new PactoError(409, 'Esse item não existe mais.');
    const cost = -entry.price * qty, take = materialsTake(entry, qty, vale) ?? [];
    const stock = entry.stock > 0 ? { day, entry: entry.id, qty, max: entry.stock } : null;
    if (entry.ref.kind === 'loja' && info.kind === 'ferramenta') {
      const g = goodById(entry.ref.good)!;
      const durability = blueprintById(g.blueprint ?? '')?.durability ?? 50;
      const data = { name: g.name, rarity: 'comum', history: [{ at: new Date().toISOString(), what: `comprado na ${SHOP_KINDS[entry.shop].label}` }] };
      return trade(cost, entry.id, [], take, { id: crypto.randomUUID(), blueprint: g.blueprint, tool: g.tool, durability, data }, null, stock);
    }
    const inv = entry.ref.kind === 'loja'
      ? { key: shopKey(entry.ref.good), qty, meta: { label: info.name, description: info.description, category: 'diversos', shop: entry.ref.good } }
      : { key: info.item!.slug, qty, meta: { label: info.name, category: categoryOf(info.item!.type) } };
    return trade(cost, entry.id, [inv], take, null, null, stock);
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
    const price = bagSellPrice(key, (row.meta ?? {}) as Record<string, unknown>, await ctx.catalog(), ctx.shop);
    if (price == null) throw new PactoError(409, 'A loja não compra isso.');
    return trade(price * qty, key, [{ key, qty: -qty }], [], null);
  }

  // ---- escolas de Áster
  if (action === 'pacto.school.join') {
    const school = body.school;
    if (!isCitySchool(school)) throw new PactoError(400, 'Escola inexistente.');
    const cls = await classInfo(db, c, ctx.admin);
    const block = schoolBlock(school, cls.forms, cls.essences);
    if (block) throw new PactoError(403, block);
    const { data: prof } = await db.from('pacto_profile').select('*').eq('companion_id', cid).maybeSingle();
    const schools = cleanSchools(prof?.schools);
    if (!schools.includes(school)) {
      const { error } = await db.from('pacto_profile').update({ schools: [...schools, school], updated_at: new Date().toISOString() }).eq('companion_id', cid);
      if (error) throw new PactoError(500, 'Falha no servidor (matrícula).');
    }
    return { school: { ok: true, school }, pacto: await ctx.state() };
  }

  if (action === 'pacto.school.brew') {
    const cls = await classInfo(db, c, ctx.admin);
    const { data: prof } = await db.from('pacto_profile').select('*').eq('companion_id', cid).maybeSingle();
    if (!studiesAt('veneno', cleanSchools(prof?.schools), cls.forms, cls.essences)) throw new PactoError(403, 'Só quem estuda na Escola do Veneno prepara poções e comidas.');
    const recipe = brewById(String(body.recipe ?? ''));
    const { data: bag } = await db.from('ecos_bag').select('batch_key,qty').eq('companion_id', cid);
    const chk = brewCheck(recipe, Math.round(Number(body.times) || 1), (bag ?? []).map((b) => ({ key: b.batch_key as string, qty: b.qty as number })));
    if (!chk.ok) throw new PactoError(409, chk.reason);
    const g = goodById(recipe!.good)!;
    const r = await trade(0, 'escola:' + recipe!.id, [{ key: shopKey(g.id), qty: chk.give, meta: { label: g.name, description: g.description, category: 'diversos', shop: g.id } }], chk.consume, null, 'escola-preparo');
    return { ...r, brewed: { good: g.id, qty: chk.give, bonus: chk.bonus } };
  }

  throw new PactoError(404, 'Ação desconhecida.');
}
