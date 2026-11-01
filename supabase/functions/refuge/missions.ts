// Missões no servidor: catálogo publicado (Admin → Missões), requisitos, progresso calculado com o que o próprio
// servidor registrou (coletas confirmadas, abates, fabricações e preparos) e prêmios entregues uma vez só.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  sanitizeMission, missionPeriod, missionBlock, missionProgress, missionComplete, batchFits, cleanRequestId, parseBatchKey, levelForXp,
  cleanSchools, worldNodeById, categoryOf, MAX_ACTIVE_MISSIONS,
  type MissionDef, type MissionLog, type GameConfig, type CreatureDef, type ItemDef, type ItemCategory,
} from './rules/index.ts';
import { classInfo, lumes } from './pacto.ts';
import { grantBond, worldNow } from './ecos.ts';

export class MissionError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const REASON: Record<string, string> = {
  'missao-inativa': 'Essa missão não está em andamento.',
  'ja-completo': 'Essa parte da missão já está completa.',
  'faltam-materiais': 'Faltam esses materiais na mochila.',
};

interface Ctx {
  db: SupabaseClient; c: Record<string, unknown>; cfg: GameConfig; admin: boolean;
  event: (kind: string, payload: unknown) => Promise<number>;
  creatures: () => Promise<CreatureDef[]>;
  items: () => Promise<ItemDef[]>;
  addToBag: (adds: { key: string; qty: number; label: string; category: ItemCategory | string }[]) => Promise<unknown>;
}

interface Row { mission: string; period: string; status: 'ativa' | 'concluida' | 'abandonada'; accepted_at: string; delivered: number[]; completed_at: string | null }

async function catalog(db: SupabaseClient): Promise<MissionDef[]> {
  const { data } = await db.from('missions').select('slug,name,data').eq('status', 'published');
  return (data ?? []).map((r) => sanitizeMission({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is MissionDef => !!x);
}

/** O que o servidor registrou desde `since` (coletas, abates, fabricações e preparos). */
async function logSince(ctx: Ctx, since: string): Promise<(acceptedAt: string) => MissionLog> {
  const { db, c } = ctx, cid = c.id as string;
  const [g, k, f] = await Promise.all([
    db.from('ecos_actions').select('node_id,result,created_at').eq('companion_id', cid).eq('kind', 'gather').eq('status', 'done').gte('created_at', since).order('created_at').limit(1000),
    db.from('companion_events').select('payload,created_at').eq('companion_id', cid).eq('kind', 'combat.kill').gte('created_at', since).order('created_at').limit(2000),
    db.from('companion_events').select('kind,payload,created_at').eq('companion_id', cid).in('kind', ['ecos.craft', 'escola.preparo']).gte('created_at', since).order('created_at').limit(1000),
  ]);
  const w = (await worldNow(db)).w;
  const fam = new Map((await ctx.creatures()).map((d) => [d.slug, d.family?.id ?? null]));
  const gathers = (g.data ?? []).map((r) => ({ at: r.created_at as string, biome: (r.node_id && worldNodeById(w, r.node_id as string)?.biome) || null, items: (((r.result as { items?: { key: string; qty: number }[] })?.items) ?? []).map((i) => ({ key: String(i.key), qty: Number(i.qty) || 0 })) }));
  const kills = (k.data ?? []).map((r) => { const p = r.payload as { slug?: string; level?: number }; return { at: r.created_at as string, slug: String(p?.slug ?? ''), level: Number(p?.level) || 1, family: fam.get(String(p?.slug ?? '')) ?? null }; });
  const crafts = (f.data ?? []).map((r) => { const p = r.payload as { recipe?: string; brew?: string; times?: number }; return { at: r.created_at as string, recipe: String((r.kind === 'ecos.craft' ? p?.recipe : p?.brew) ?? ''), times: r.kind === 'ecos.craft' ? 1 : Math.max(1, Number(p?.times) || 1) }; });
  return (acceptedAt) => ({ gathers: gathers.filter((x) => x.at >= acceptedAt), kills: kills.filter((x) => x.at >= acceptedAt), crafts: crafts.filter((x) => x.at >= acceptedAt) });
}

async function who(ctx: Ctx, rows: Row[]) {
  const { db, c, cfg, admin } = ctx;
  const [cls, prof] = await Promise.all([classInfo(db, c, admin), db.from('pacto_profile').select('schools').eq('companion_id', c.id).maybeSingle()]);
  return {
    done: new Set(rows.filter((r) => r.status === 'concluida').map((r) => r.mission)),
    bondLevel: levelForXp(Number(c.bond_xp) || 0, cfg),
    schools: cleanSchools(prof.data?.schools),
    forms: cls.forms,
    essence: cls.essence,
  };
}

export async function missionState(ctx: Ctx) {
  const { db, c } = ctx, cid = c.id as string, now = Date.now();
  const [defs, rowsQ] = await Promise.all([catalog(db), db.from('companion_missions').select('mission,period,status,accepted_at,delivered,completed_at').eq('companion_id', cid).order('accepted_at', { ascending: false }).limit(500)]);
  const rows = (rowsQ.data ?? []) as Row[];
  const w = await who(ctx, rows);
  const active = rows.filter((r) => r.status === 'ativa');
  const since = active.reduce((m, r) => (r.accepted_at < m ? r.accepted_at : m), new Date(now).toISOString());
  const logFor = active.length ? await logSince(ctx, since) : null;
  const names = (s: string) => defs.find((d) => d.slug === s)?.name ?? s;
  const list = defs.map((def) => {
    const period = missionPeriod(def.repeat, now);
    const act = active.find((r) => r.mission === def.slug);
    if (act) {
      const progress = missionProgress(def, logFor!(act.accepted_at), act.delivered ?? []);
      return { def, period: act.period, status: missionComplete(def, progress) ? 'pronta' : 'ativa', progress, acceptedAt: act.accepted_at, block: null };
    }
    const here = rows.find((r) => r.mission === def.slug && r.period === period);
    if (here?.status === 'concluida') return { def, period, status: 'concluida', progress: def.objectives.map((o) => o.qty), acceptedAt: here.accepted_at, completedAt: here.completed_at, block: null };
    const block = missionBlock(def, w, names);
    return { def, period, status: block ? 'bloqueada' : 'disponivel', progress: def.objectives.map(() => 0), acceptedAt: null, block };
  });
  return { serverNow: now, missions: list, active: active.length, maxActive: MAX_ACTIVE_MISSIONS };
}
export type MissionState = Awaited<ReturnType<typeof missionState>>;

export async function missionAction(action: string, body: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown>> {
  const { db, c } = ctx, cid = c.id as string;
  if (c.stage !== 'awakened') throw new MissionError(409, 'As missões começam depois do despertar.');
  if (action === 'missions.state') return { missions: await missionState(ctx) };

  const slug = typeof body.mission === 'string' ? body.mission : '';
  const def = (await catalog(db)).find((d) => d.slug === slug);
  if (!def) throw new MissionError(404, 'Missão não encontrada.');
  const activeRow = async () => (await db.from('companion_missions').select('mission,period,status,accepted_at,delivered,completed_at').eq('companion_id', cid).eq('mission', slug).eq('status', 'ativa').maybeSingle()).data as Row | null;

  if (action === 'missions.accept') {
    if (await activeRow()) return { missions: await missionState(ctx) };
    const { data: rows } = await db.from('companion_missions').select('mission,period,status,accepted_at,delivered,completed_at').eq('companion_id', cid).limit(500);
    const all = (rows ?? []) as Row[];
    if (all.filter((r) => r.status === 'ativa').length >= MAX_ACTIVE_MISSIONS) throw new MissionError(409, `Você já tem ${MAX_ACTIVE_MISSIONS} missões em andamento. Conclua ou largue uma.`);
    const block = missionBlock(def, await who(ctx, all));
    if (block) throw new MissionError(403, block);
    const period = missionPeriod(def.repeat, Date.now());
    const prev = all.find((r) => r.mission === slug && r.period === period);
    if (prev?.status === 'concluida') throw new MissionError(409, def.repeat === 'unica' ? 'Você já concluiu essa missão.' : def.repeat === 'diaria' ? 'Já concluída hoje. Volte amanhã.' : 'Já concluída nesta semana.');
    const { error } = await db.from('companion_missions').upsert({ companion_id: cid, mission: slug, period, status: 'ativa', accepted_at: new Date().toISOString(), delivered: [], completed_at: null });
    if (error) throw new MissionError(500, 'Não consegui aceitar a missão.');
    await ctx.event('mission.accepted', { mission: slug, period });
    return { missions: await missionState(ctx) };
  }

  if (action === 'missions.abandon') {
    const r = await activeRow();
    if (r) await db.from('companion_missions').update({ status: 'abandonada' }).eq('companion_id', cid).eq('mission', slug).eq('period', r.period).eq('status', 'ativa');
    return { missions: await missionState(ctx) };
  }

  if (action === 'missions.deliver') {
    const request = cleanRequestId(body.request); if (!request) throw new MissionError(400, 'Pedido inválido.');
    const idx = Math.round(Number(body.objective)), o = def.objectives[idx];
    if (!o || o.kind !== 'entregar') throw new MissionError(400, 'Objetivo inválido.');
    const key = String(body.key ?? '');
    if (!parseBatchKey(key) || !batchFits(o, key)) throw new MissionError(409, 'Esse material não serve para esse objetivo.');
    const r = await activeRow();
    if (!r) throw new MissionError(409, REASON['missao-inativa']);
    const qty = Math.max(1, Math.min(999, Math.round(Number(body.qty) || 1)));
    const { data, error } = await db.rpc('mission_deliver', { p_request: request, p_cid: cid, p_mission: slug, p_period: r.period, p_idx: idx, p_key: key, p_qty: qty, p_goal: o.qty });
    if (error) throw new MissionError(500, 'Falha no servidor (entrega).');
    const res = data as { ok: boolean; reason?: string; accepted?: number };
    if (!res.ok) throw new MissionError(409, REASON[res.reason ?? ''] ?? 'Não deu certo.');
    return { delivered: { accepted: res.accepted ?? 0 }, missions: await missionState(ctx) };
  }

  if (action === 'missions.claim') {
    const r = await activeRow();
    if (!r) throw new MissionError(409, REASON['missao-inativa']);
    const log = (await logSince(ctx, r.accepted_at))(r.accepted_at);
    if (!missionComplete(def, missionProgress(def, log, r.delivered ?? []))) throw new MissionError(409, 'Ainda faltam objetivos.');
    const { data, error } = await db.rpc('mission_complete', { p_cid: cid, p_mission: slug, p_period: r.period, p_unlock: def.rewards.unlock ?? null });
    if (error) throw new MissionError(500, 'Falha no servidor (conclusão).');
    if (!(data as { ok: boolean }).ok) throw new MissionError(409, REASON['missao-inativa']);
    // prêmios: a transição ativa → concluída acontece uma vez só, então cada prêmio sai uma vez
    const rw = def.rewards;
    if (rw.lumes) await lumes(db, `mission:${cid}:${slug}:${r.period}`, cid, rw.lumes, 'missao', slug);
    const bond = rw.bond ? await grantBond({ db, cfg: ctx.cfg }, cid, rw.bond, 'missao') : null;
    if (rw.materials.length) await db.rpc('ecos_bag_add', { p_cid: cid, p_items: rw.materials, p_sign: 1 });
    if (rw.items.length) {
      const cat = await ctx.items();
      const adds = rw.items.map((x) => { const it = cat.find((i) => i.slug === x.item); return it ? { key: it.slug, qty: x.qty, label: it.name, category: categoryOf(it.type) } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
      if (adds.length) await ctx.addToBag(adds);
    }
    await ctx.event('mission.done', { mission: slug, period: r.period, rarity: def.rarity });
    return { claimed: { mission: slug, name: def.name, rewards: rw }, bond, missions: await missionState(ctx) };
  }

  throw new MissionError(404, 'Ação desconhecida.');
}
