// Baús de drop (o monstro derrotado deixa um baú; abrir põe tudo na bolsa) e a reconstrução de Áster (entregas na
// Torre Central, meta do servidor inteiro). Regras em shared/rules/chests.ts; as gravações são atômicas no banco.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  CHEST_TTL_MS, CHEST_OPEN_TTL_MS, CHEST_REACH, CRYSTAL_KEY, CRYSTAL_LABEL, rebuildFits, cleanProgress, cleanRequestId, parseBatchKey,
  type AsterConfig, type ChestContents, type ChestTier, type GameConfig,
} from './rules/index.ts';
import { lumes } from './pacto.ts';
import { grantBond } from './ecos.ts';

export class ChestError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const REASON: Record<string, string> = {
  'cidade-de-pe': 'Áster está de pé: a Torre não precisa de nada agora.',
  'rodada-mudou': 'A reconstrução acabou de mudar — veja o que falta agora.',
  'ja-completo': 'Essa parte da reconstrução já está completa.',
  'faltam-cristais': 'Faltam Cristais Ápice na bolsa.',
  'sem-lumes': 'Lumes insuficientes.',
  'faltam-materiais': 'Faltam esses materiais na mochila.',
  'pedido-invalido': 'Pedido inválido.',
};
type AddToBag = (cid: string, adds: { key: string; qty: number; label: string; category: string }[]) => Promise<unknown>;

/** Um baú novo para o monstro derrotado (o conteúdo já sorteado). */
export async function createChest(db: SupabaseClient, cid: string, creature: string, tier: ChestTier, pos: { x: number; z: number }, contents: ChestContents) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.from('companion_chests').insert({ id, companion_id: cid, creature, tier, x: pos.x, z: pos.z, contents, created_at: new Date(now).toISOString(), expires_at: new Date(now + CHEST_TTL_MS).toISOString() });
  return { id, tier, x: pos.x, z: pos.z, expiresAt: now + CHEST_TTL_MS, crystals: contents.crystals, state: 'fechado' as const, drops: [] };
}

/**
 * Abre (uma vez só: quem marca primeiro leva): Lumes e Cristais Ápice vão na hora; os itens ficam no baú aberto
 * (com ouro) até o Companion pegar — por CHEST_OPEN_TTL_MS. Devolve o conteúdo inteiro (para mostrar).
 */
async function reveal(db: SupabaseClient, cid: string, id: string, addToBag: AddToBag): Promise<ChestContents | null> {
  const now = Date.now();
  const { data } = await db.from('companion_chests').update({ opened_at: new Date(now).toISOString(), expires_at: new Date(now + CHEST_OPEN_TTL_MS).toISOString() })
    .eq('id', id).eq('companion_id', cid).is('opened_at', null).gt('expires_at', new Date(now).toISOString()).select('contents,creature').maybeSingle();
  if (!data) return null;
  const c = data.contents as ChestContents;
  if (c.crystals) await addToBag(cid, [{ key: CRYSTAL_KEY, qty: c.crystals, label: CRYSTAL_LABEL, category: 'material' }]);
  if (c.lumes) await lumes(db, `chest:${id}`, cid, c.lumes, 'monstro', data.creature as string);
  return c;
}

/** Leva itens do baú aberto para a bolsa (só o que ainda está lá); o resto continua no baú. */
async function take(db: SupabaseClient, cid: string, id: string, want: { key: string; qty: number }[], addToBag: AddToBag) {
  const { data } = await db.from('companion_chests').select('contents,opened_at,expires_at').eq('id', id).eq('companion_id', cid).maybeSingle();
  if (!data?.opened_at || Date.parse(data.expires_at as string) <= Date.now()) return null;
  const c = data.contents as ChestContents;
  const left = (c.drops ?? []).map((d) => ({ ...d }));
  const adds: { key: string; qty: number; label: string; category: string }[] = [];
  for (const w of want) {
    const d = left.find((x) => x.key === w.key);
    const q = Math.min(d?.qty ?? 0, Math.max(0, Math.floor(Number(w.qty) || 0)));
    if (!d || q <= 0) continue;
    d.qty -= q; adds.push({ key: d.key, qty: q, label: d.label, category: d.category });
  }
  const rest = left.filter((d) => d.qty > 0);
  // só grava se o baú ainda estava como lido (outro pedido no meio não duplica)
  const { data: ok } = await db.from('companion_chests').update({ contents: { ...c, drops: rest }, ...(rest.length ? {} : { expires_at: new Date().toISOString() }) })
    .eq('id', id).eq('companion_id', cid).eq('contents', JSON.stringify(c)).select('id').maybeSingle();
  if (!ok) return null;
  if (adds.length) await addToBag(cid, adds);
  return { taken: adds.map(({ key, qty, label }) => ({ key, qty, label })), left: rest };
}

/** Baús à vista: fechados e abertos que ainda têm itens (os vencidos somem com o que tinha dentro). */
async function chestList(db: SupabaseClient, cid: string) {
  const { data } = await db.from('companion_chests').select('id,tier,x,z,expires_at,opened_at,contents').eq('companion_id', cid).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30);
  return (data ?? []).filter((r) => !r.opened_at || ((r.contents as ChestContents)?.drops ?? []).length > 0).map((r) => {
    const c = r.contents as ChestContents;
    return { id: r.id as string, tier: r.tier as ChestTier, x: Number(r.x), z: Number(r.z), expiresAt: Date.parse(r.expires_at as string), crystals: Number(c?.crystals) || 0,
      state: r.opened_at ? 'aberto' as const : 'fechado' as const, drops: r.opened_at ? c.drops ?? [] : [] };
  });
}

// ---------------------------------------------------------------------------
// Reconstrução
// ---------------------------------------------------------------------------

export async function cityState(db: SupabaseClient, city = 'aster') {
  const { data } = await db.from('city_rebuild').select('state,round,progress,destroyed_at,rebuilt_at').eq('city', city).maybeSingle();
  return { state: (data?.state as 'normal' | 'destruida') ?? 'normal', round: Number(data?.round) || 0, progress: cleanProgress(data?.progress), destroyedAt: (data?.destroyed_at as string | null) ?? null, rebuiltAt: (data?.rebuilt_at as string | null) ?? null };
}

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; cfg: GameConfig; aster: AsterConfig; addToBag: AddToBag; event: (cid: string, kind: string, payload: unknown) => Promise<number> }

export async function chestAction(action: string, body: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown>> {
  const { db, c } = ctx, cid = c.id as string;
  if (c.stage !== 'awakened') throw new ChestError(409, 'Só depois do despertar.');

  if (action === 'chest.list') return { chests: await chestList(db, cid) };

  if (action === 'chest.open') {
    const id = cleanRequestId(body.id); if (!id) throw new ChestError(400, 'Baú inválido.');
    const { data: ch } = await db.from('companion_chests').select('x,z,opened_at').eq('id', id).eq('companion_id', cid).maybeSingle();
    if (!ch) throw new ChestError(404, 'Esse baú não existe.');
    if (ch.opened_at) return { opened: null, chests: await chestList(db, cid) };
    const x = Number(body.x), z = Number(body.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - Number(ch.x), z - Number(ch.z)) > CHEST_REACH) throw new ChestError(409, 'Chegue mais perto do baú.');
    const got = await reveal(db, cid, id, ctx.addToBag);
    if (!got) throw new ChestError(409, 'Esse baú já sumiu.');
    return { opened: got, chests: await chestList(db, cid) };
  }

  if (action === 'chest.take') {
    const id = cleanRequestId(body.id); if (!id) throw new ChestError(400, 'Baú inválido.');
    const want = Array.isArray(body.items) ? (body.items as { key: unknown; qty: unknown }[]).slice(0, 40).map((w) => ({ key: String(w?.key ?? ''), qty: Number(w?.qty) || 0 })) : [];
    const { data: ch } = await db.from('companion_chests').select('x,z').eq('id', id).eq('companion_id', cid).maybeSingle();
    if (!ch) throw new ChestError(404, 'Esse baú não existe.');
    const x = Number(body.x), z = Number(body.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - Number(ch.x), z - Number(ch.z)) > CHEST_REACH + 2) throw new ChestError(409, 'Chegue mais perto do baú.');
    const got = await take(db, cid, id, want, ctx.addToBag);
    if (!got) throw new ChestError(409, 'Esse baú já sumiu.');
    return { took: got, chests: await chestList(db, cid) };
  }

  if (action === 'city.give') {
    const request = cleanRequestId(body.request); if (!request) throw new ChestError(400, 'Pedido inválido.');
    const kind = body.kind === 'cristal' || body.kind === 'lumes' || body.kind === 'material' ? body.kind : null;
    if (!kind) throw new ChestError(400, 'Pedido inválido.');
    const goals = ctx.aster.rebuild;
    const idx = Math.round(Number(body.idx) || 0), key = String(body.key ?? '');
    if (kind === 'material' && (!goals.materials[idx] || !parseBatchKey(key) || !rebuildFits(goals.materials[idx], key))) throw new ChestError(409, 'Esse material não serve para essa parte da reconstrução.');
    const st = await cityState(db);
    const qty = Math.max(1, Math.min(999_999, Math.round(Number(body.qty) || 1)));
    const { data, error } = await db.rpc('city_rebuild_give', {
      p_request: request, p_cid: cid, p_city: 'aster', p_round: st.round, p_kind: kind, p_idx: idx, p_key: key, p_qty: qty,
      p_goals: { crystals: goals.crystals, lumes: goals.lumes, materials: goals.materials.map((m) => m.qty) },
    });
    if (error) throw new ChestError(500, 'Falha no servidor (reconstrução).');
    const r = data as { ok: boolean; reason?: string; accepted?: number; done?: boolean; contributors?: string[]; repeat?: boolean };
    if (!r.ok) throw new ChestError(409, REASON[r.reason ?? ''] ?? 'Não deu certo.');
    let bond = null;
    if (r.done && !r.repeat) {
      // Áster de pé: todos que ajudaram são reconhecidos (vínculo, memória e um agradecimento em Lumes)
      for (const other of (r.contributors ?? []).slice(0, 500)) {
        const g = await grantBond({ db, cfg: ctx.cfg }, other, Math.round(ctx.cfg.discoveryXp), 'reconstrucao');
        if (other === cid) bond = g;
        await lumes(db, `rebuild:aster:${st.round}:${other}`, other, 50, 'reconstrucao', 'aster');
        await db.from('companion_memories').insert({ companion_id: other, subject: 'companion', content: 'A Torre Central de Áster voltou a brilhar: a cidade foi reconstruída com os cristais e os materiais que trouxemos, junto com muita gente.', importance: 4, source_event_ids: [], origin: 'aster' });
        await ctx.event(other, 'city.rebuilt', { city: 'aster', round: st.round });
      }
    }
    return { given: { accepted: r.accepted ?? 0, done: !!r.done }, bond, city: await cityState(db) };
  }

  throw new ChestError(404, 'Ação desconhecida.');
}

/** ADM: Áster cai (abre uma rodada nova de reconstrução) ou volta de pé na hora. */
export async function adminCity(db: SupabaseClient, body: Record<string, unknown>) {
  const st = await cityState(db);
  if (body.state === 'destruida') {
    await db.from('city_rebuild').update({ state: 'destruida', round: st.round + 1, progress: { crystals: 0, lumes: 0, materials: [] }, destroyed_at: new Date().toISOString(), rebuilt_at: null, updated_at: new Date().toISOString() }).eq('city', 'aster');
  } else if (body.state === 'normal') {
    await db.from('city_rebuild').update({ state: 'normal', rebuilt_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('city', 'aster');
  } else throw new ChestError(400, 'Estado inválido.');
  return { city: await cityState(db) };
}

