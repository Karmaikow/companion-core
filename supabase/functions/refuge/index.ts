// Edge Function `refuge` — servidor autoritativo do MVP 1.
// A IA propõe; as regras de shared/rules decidem. Toda escrita passa por aqui.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  resolveConfig, levelForXp, levelProgress, initialQuests, applyTurn, parseModelTurn, buildChatSystemPrompt,
  offlineTurn, assistDiscoveries, buildDreamPrompt, parseDream, checkAwakening, buildIdentityContract, gameTime, companionDay, clampText,
  QUESTS, QUEST_REWARDS, validateSetup, evaluateSecrets, isQuestionAboutCompanion, buildMusePrompt,
  SECRET_BY_KEY, SECRET_XP, SECRET_BOOST_TURNS, buildArtPrompt, ANIM_KINDS, SPECIES, DEFAULT_CREATURES, sanitizeCreature, recordKill, combatMemoryLines, combatMemoryText,
  masculinize, secretBonus, resolveBalance, type BalanceConfig, budget, deriveStats, progressionStage,
  BANK_EVENTS, MOMENT_EVENTS, withXpMultiplier, combatXp, resolveEcos, type EcosConfig, resolvePacto, type PactoConfig, buildBarkBankPrompt, parseBarkBank, buildMomentPrompt, parseMoment, dossier, type BarkEvent,
  type BestiaryEntry, type CreatureDef, type SecretKey, type GameConfig, type IdentityContractV1, type QuestState, type Discoveries, type MemoryLite, type ChatLine,
} from './rules/index.ts';
import { complete, providerName } from './llm.ts';
import { ecosAction, EcosError } from './ecos.ts';
import { pactoAction, PactoError } from './pacto.ts';
import { buildAction, BuildError, loadBuild } from './build.ts';
import { socialAction, SocialError } from './social.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = (() => {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (keys.default) return keys.default as string;
  } catch { /* ignore */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function loadConfig(db: SupabaseClient): Promise<GameConfig & { dailyChatLimit: number; maxCompanions: number; ecos: EcosConfig; pacto: PactoConfig; constellation: BalanceConfig }> {
  const { data } = await db.from('game_config').select('values').eq('id', 1).maybeSingle();
  const v = (data?.values ?? {}) as Record<string, number>;
  return { ...withXpMultiplier(resolveConfig(v)), ecos: resolveEcos((data?.values as Record<string, unknown> | undefined)?.ecos), pacto: resolvePacto((data?.values as Record<string, unknown> | undefined)?.pacto), constellation: resolveBalance((data?.values as Record<string, unknown> | undefined)?.constellation), dailyChatLimit: Number(v.dailyChatLimit) > 0 ? Number(v.dailyChatLimit) : 300, maxCompanions: Number(v.maxCompanions) > 0 ? Number(v.maxCompanions) : 1 };
}

async function event(db: SupabaseClient, companionId: string, actor: 'player' | 'companion' | 'system', kind: string, payload: unknown): Promise<number> {
  const { data, error } = await db.from('companion_events').insert({ companion_id: companionId, actor, kind, payload }).select('id').single();
  if (error) throw new HttpError(500, 'Falha ao registrar evento.');
  return data.id as number;
}

async function getCompanion(db: SupabaseClient, userId: string, companionId?: string) {
  let q = db.from('companions').select('*').eq('owner_id', userId).order('created_at', { ascending: true }).limit(1);
  if (companionId) q = db.from('companions').select('*').eq('owner_id', userId).eq('id', companionId).limit(1);
  const { data } = await q;
  return data?.[0] ?? null;
}

async function loadQuests(db: SupabaseClient, cid: string): Promise<QuestState[]> {
  const { data } = await db.from('companion_quests').select('quest_key,status,completed_at,source_event_id').eq('companion_id', cid);
  const map = new Map((data ?? []).map((r) => [r.quest_key, r]));
  return QUESTS.map((q) => {
    const r = map.get(q.key);
    return { key: q.key, status: (r?.status ?? 'active') as 'active' | 'done', completedAt: r?.completed_at ?? undefined, sourceEventId: r?.source_event_id ?? undefined };
  });
}

const ART_BUCKET = 'companion-studio';

interface StudioResult { art?: { path?: string }; model?: { path: string; uploadedAt?: string }; anims?: { path: string; kind: string; name: string }[] }
const ANIM_KIND_SET = new Set([...ANIM_KINDS.map((a) => a.kind), 'special']);

async function sign(db: SupabaseClient, path: string | undefined, seconds: number) {
  if (!path) return undefined;
  return (await db.storage.from(ART_BUCKET).createSignedUrl(path, seconds)).data?.signedUrl ?? undefined;
}
/** Modelo .GLB + animações (cada uma num .GLB do mesmo rig), com URLs assinadas. */
async function signedModel(db: SupabaseClient, r: StudioResult, seconds: number) {
  if (!r.model?.path) return undefined;
  const url = await sign(db, r.model.path, seconds);
  if (!url) return undefined;
  const anims = [];
  for (const a of r.anims ?? []) { const u = await sign(db, a.path, seconds); if (u) anims.push({ url: u, kind: a.kind, name: a.name }); }
  return { url, anims };
}

/** Arte e modelo ficam num bucket privado; o dono do Companion recebe URLs assinadas temporárias. */
async function withArtUrl(db: SupabaseClient, job: Record<string, unknown> | null) {
  if (!job) return null;
  const r = (job.result as StudioResult | null) ?? {};
  const out: Record<string, unknown> = { id: job.id, status: job.status, contract_version: job.contract_version, created_at: job.created_at, updated_at: job.updated_at };
  if (job.status === 'approved') {
    const artUrl = await sign(db, r.art?.path, 6 * 3600);
    if (artUrl) out.artUrl = artUrl;
    const model = await signedModel(db, r, 6 * 3600);
    if (model) out.model = model;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fábrica de Companions (painel do ADM)
// ---------------------------------------------------------------------------

async function isAdmin(db: SupabaseClient, userId: string) {
  const { data } = await db.from('studio_admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

async function adminJobs(db: SupabaseClient) {
  const { data: jobs } = await db.from('visual_jobs').select('id,companion_id,contract_version,contract,status,result,error,created_at,updated_at').order('created_at', { ascending: false }).limit(60);
  const ids = [...new Set((jobs ?? []).map((j) => j.companion_id as string))];
  const { data: comps } = ids.length ? await db.from('companions').select('id,discoveries,stage,bond_xp').in('id', ids) : { data: [] };
  const byId = new Map((comps ?? []).map((c) => [c.id as string, c]));
  const out = [];
  for (const j of jobs ?? []) {
    const r = (j.result as StudioResult | null) ?? {};
    const comp = byId.get(j.companion_id as string);
    out.push({
      id: j.id, companionId: j.companion_id, status: j.status, createdAt: j.created_at, updatedAt: j.updated_at, contractVersion: j.contract_version,
      name: (comp?.discoveries as Discoveries | undefined)?.name ?? (j.contract as IdentityContractV1).identity?.name,
      contract: j.contract, prompt: buildArtPrompt(j.contract as IdentityContractV1),
      artUrl: await sign(db, r.art?.path, 3600), artPath: r.art?.path ?? null,
      model: await signedModel(db, r, 3600), modelPath: r.model?.path ?? null, animPaths: (r.anims ?? []).map((a) => ({ path: a.path, kind: a.kind, name: a.name })),
      error: j.error,
    });
  }
  return { jobs: out };
}

/** O Administrador: todos os Companions (para a galeria de ícones). */
async function adminCompanions(db: SupabaseClient, cfg: GameConfig) {
  const { data: comps } = await db.from('companions').select('id,owner_id,stage,discoveries,bond_xp,identity_contract,created_at,updated_at').order('created_at', { ascending: false }).limit(300);
  const ids = (comps ?? []).map((c) => c.id as string);
  const { data: jobs } = ids.length ? await db.from('visual_jobs').select('companion_id,status,result,created_at').in('companion_id', ids).order('created_at', { ascending: false }) : { data: [] };
  const lastJob = new Map<string, { status: string; art?: string }>();
  for (const j of jobs ?? []) if (!lastJob.has(j.companion_id as string)) lastJob.set(j.companion_id as string, { status: j.status as string, art: (j.result as StudioResult | null)?.art?.path });
  const paths = [...lastJob.values()].map((j) => j.art).filter((x): x is string => !!x);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(ART_BUCKET).createSignedUrls(paths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }
  return {
    companions: (comps ?? []).map((c) => {
      const d = (c.discoveries ?? {}) as Discoveries, j = lastJob.get(c.id as string);
      const p = levelProgress(Number(c.bond_xp) || 0, cfg);
      return {
        id: c.id, owner: String(c.owner_id).slice(0, 8), name: d.name ?? (c.identity_contract as IdentityContractV1 | null)?.identity?.name ?? 'Sem nome', stage: c.stage,
        form: d.form ?? null, element: d.element ?? null, color: d.color ?? '#9fb4ff', pronoun: d.pronoun ?? 'ela',
        level: p.level, xp: p.xp, createdAt: c.created_at, updatedAt: c.updated_at,
        job: j ? j.status : null, artUrl: j?.art ? signed.get(j.art) ?? null : null,
      };
    }),
  };
}

/** Ficha de um Companion: identidade, progressão, coleta (Ecos), Pacto, build e os pedidos de arte. */
async function adminCompanion(db: SupabaseClient, cfg: GameConfig & { constellation: BalanceConfig }, cid: string) {
  if (!/^[0-9a-f-]{36}$/i.test(cid)) throw new HttpError(400, 'Companion inválido.');
  const { data: c } = await db.from('companions').select('*').eq('id', cid).maybeSingle();
  if (!c) throw new HttpError(404, 'Companion não encontrado.');
  const count = async (table: string, status?: string) => {
    let q = db.from(table).select('*', { count: 'exact', head: true }).eq('companion_id', cid);
    if (status) q = q.eq('status', status);
    return (await q).count ?? 0;
  };
  const [quests, memories, diary, recipes, secrets, best, bag, ecosProf, pacto, equip, lastEv, events, build] = await Promise.all([
    loadQuests(db, cid),
    count('companion_memories', 'active'),
    count('companion_diary'), count('companion_recipes'), count('companion_secrets'),
    db.from('companion_bestiary').select('name,kills,particles').eq('companion_id', cid).order('kills', { ascending: false }),
    db.from('ecos_bag').select('batch_key,qty').eq('companion_id', cid).gt('qty', 0).order('qty', { ascending: false }),
    db.from('ecos_profile').select('tools,known_materials,techniques').eq('companion_id', cid).maybeSingle(),
    db.from('pacto_profile').select('lumes,test_class').eq('companion_id', cid).maybeSingle(),
    db.from('pacto_equipment').select('blueprint,kind,durability,max_durability,status').eq('owner', cid),
    db.from('companion_events').select('kind,created_at').eq('companion_id', cid).order('id', { ascending: false }).limit(1),
    count('companion_events'),
    loadBuild(db, c, cfg, cfg.constellation).catch(() => null),
  ]);
  const d = (c.discoveries ?? {}) as Discoveries;
  const p = levelProgress(Number(c.bond_xp) || 0, cfg);
  const stage = progressionStage(p.level);
  const bagRows = (bag.data ?? []) as { batch_key: string; qty: number }[];
  const derived = build ? deriveStats({ alloc: build.active.alloc, stage, species: (d.form ?? null) as never, resonance: build.active.resonance, cfg: cfg.constellation }) : null;
  const jobs = (await adminJobs(db)).jobs.filter((j) => j.companionId === cid);
  return {
    companion: {
      id: c.id, owner: String(c.owner_id).slice(0, 8), stage: c.stage, discoveries: d, contract: c.identity_contract, createdAt: c.created_at, awakenedAt: c.awakened_at, updatedAt: c.updated_at,
      lastActivity: lastEv.data?.[0]?.created_at ?? null, lastEvent: lastEv.data?.[0]?.kind ?? null,
    },
    progress: {
      level: p.level, xp: p.xp, from: p.from, to: p.to, boost: c.xp_boost ?? 0,
      questsDone: quests.filter((q) => q.status === 'done').length, questsTotal: quests.length, quests,
      memories, diary, recipes, secrets, events,
      kills: ((best.data ?? []) as { kills: number }[]).reduce((t, b) => t + (b.kills ?? 0), 0), species: (best.data ?? []).length,
    },
    gathering: {
      totalItems: bagRows.reduce((t, b) => t + b.qty, 0), stacks: bagRows.length, bag: bagRows,
      tools: (ecosProf.data?.tools as string[] | undefined) ?? [], knownMaterials: (ecosProf.data?.known_materials as string[] | undefined)?.length ?? 0,
      techniques: (ecosProf.data?.techniques as string[] | undefined) ?? [],
    },
    pacto: { lumes: Number(pacto.data?.lumes ?? 0), testClass: pacto.data?.test_class ?? null, equipment: equip.data ?? [] },
    build: build ? { ...build, stage, budget: budget(stage, cfg.constellation, secretBonus(secrets).constellationPoints), derived } : null,
    jobs,
  };
}

const JOB_STATUSES = new Set(['queued', 'generating', 'review', 'approved', 'failed']);

async function adminUpdate(db: SupabaseClient, body: Record<string, unknown>) {
  const jobId = String(body.jobId ?? '');
  const status = String(body.status ?? '');
  if (!JOB_STATUSES.has(status)) throw new HttpError(400, 'Status inválido.');
  const { data: job } = await db.from('visual_jobs').select('id,companion_id,result').eq('id', jobId).maybeSingle();
  if (!job) throw new HttpError(404, 'Pedido de arte não encontrado.');
  const r: StudioResult & Record<string, unknown> = { ...((job.result as Record<string, unknown>) ?? {}) };
  // todo arquivo precisa estar na pasta do próprio Companion e existir no bucket
  const checkPath = async (path: unknown) => {
    if (typeof path !== 'string' || !path.startsWith(`companions/${job.companion_id}/`) || path.includes('..')) throw new HttpError(400, 'Caminho de arquivo inválido.');
    const { error } = await db.storage.from(ART_BUCKET).createSignedUrl(path, 60);
    if (error) throw new HttpError(400, 'Arquivo não encontrado no bucket.');
    return path;
  };
  const now = new Date().toISOString();
  if (typeof body.artPath === 'string' && body.artPath) r.art = { path: await checkPath(body.artPath), uploadedAt: now } as StudioResult['art'];
  if (typeof body.modelPath === 'string' && body.modelPath) r.model = { path: await checkPath(body.modelPath), uploadedAt: now };
  if (Array.isArray(body.addAnims)) {
    const anims = [...(r.anims ?? [])];
    for (const a of body.addAnims.slice(0, 20) as { path?: unknown; kind?: unknown; name?: unknown }[]) {
      const path = await checkPath(a.path);
      const kind = ANIM_KIND_SET.has(String(a.kind)) ? String(a.kind) : 'special';
      anims.push({ path, kind, name: clampText(String(a.name ?? ''), 80) });
    }
    r.anims = anims.slice(-30);
  }
  if (body.setAnim && typeof body.setAnim === 'object') {
    const { path, kind } = body.setAnim as { path?: string; kind?: string };
    r.anims = (r.anims ?? []).map((a) => a.path === path && ANIM_KIND_SET.has(String(kind)) ? { ...a, kind: String(kind) } : a);
  }
  if (typeof body.removeAnim === 'string') r.anims = (r.anims ?? []).filter((a) => a.path !== body.removeAnim);
  if (status === 'approved' && !r.art?.path && !r.model?.path) throw new HttpError(400, 'Envie a arte ou o modelo antes de aprovar.');
  await db.from('visual_jobs').update({ status, result: r, error: typeof body.error === 'string' ? body.error.slice(0, 300) : null, updated_at: now }).eq('id', jobId);
  if (status === 'approved') await event(db, job.companion_id as string, 'system', 'companion.art', { jobId, art: r.art?.path ?? null, model: r.model?.path ?? null, anims: (r.anims ?? []).length });
  return adminJobs(db);
}

// ---------------------------------------------------------------------------
// Corpo e Memórias de Combate (o que entra no prompt depois do despertar)

/** Criaturas do Invocador (publicadas) ou as de reserva. */
async function creatureDefs(db: SupabaseClient): Promise<CreatureDef[]> {
  const { data } = await db.from('creatures').select('slug,name,data').eq('status', 'published');
  const list = (data ?? []).map((r) => sanitizeCreature({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is CreatureDef => !!x);
  return list.length ? list : DEFAULT_CREATURES;
}

const bestiaryRow = (r: Record<string, unknown>): BestiaryEntry => ({ slug: r.creature_slug as string, name: r.name as string, kills: r.kills as number, particles: r.particles as number, firstAt: r.first_at as string, lastAt: r.last_at as string });

async function loadBestiary(db: SupabaseClient, cid: string): Promise<BestiaryEntry[]> {
  const { data } = await db.from('companion_bestiary').select('creature_slug,name,kills,particles,first_at,last_at').eq('companion_id', cid).order('last_at', { ascending: false }).limit(200);
  return (data ?? []).map(bestiaryRow);
}

/** Forma depois do despertar (classe e descrição do contrato) e Memórias de Combate, para o prompt. */
async function bodyAndCombat(db: SupabaseClient, c: Record<string, unknown>) {
  if (c.stage !== 'awakened') return { body: { awakened: false }, combat: [] as string[] };
  const contract = c.identity_contract as IdentityContractV1 | null;
  const fam = contract?.species?.family as keyof typeof SPECIES | undefined;
  const sp = fam ? SPECIES[fam] : null;
  const [entries, defs] = await Promise.all([loadBestiary(db, c.id as string), creatureDefs(db)]);
  return {
    body: { awakened: true, formLabel: sp ? `humanoide da classe ${sp.label} (${sp.lineage})` : 'humanoide', formDescription: contract?.species?.description || undefined, hasModel: true },
    combat: combatMemoryLines(entries, defs),
  };
}

/** Derrota de uma criatura no mundo: bestiário, partículas e as Memórias de Combate. */
async function actCombatKill(db: SupabaseClient, c: Record<string, unknown>, body: Record<string, unknown>, cfg: GameConfig) {
  const cid = c.id as string;
  if (c.stage !== 'awakened') throw new HttpError(409, 'Só depois do despertar.');
  const slug = typeof body.slug === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(body.slug) ? body.slug : null;
  if (!slug) throw new HttpError(400, 'Criatura inválida.');
  const level = Math.max(1, Math.min(60, Math.round(Number(body.level) || 1)));
  // freio contra spam: no máximo 40 derrotas por minuto
  const { count } = await db.from('companion_events').select('id', { count: 'exact', head: true }).eq('companion_id', cid).eq('kind', 'combat.kill').gte('created_at', new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= 40) throw new HttpError(429, 'Calma! 🌙');
  const defs = await creatureDefs(db);
  const def = defs.find((d) => d.slug === slug) ?? DEFAULT_CREATURES.find((d) => d.slug === slug) ?? null;
  const name = def?.name ?? slug;
  const all = await loadBestiary(db, cid);
  const prev = all.find((e) => e.slug === slug) ?? null;
  const now = new Date().toISOString();
  const r = recordKill(prev, all, { slug, name, level }, now);
  await db.from('companion_bestiary').upsert({ companion_id: cid, creature_slug: slug, name, kills: r.entry.kills, particles: r.entry.particles, first_at: r.entry.firstAt, last_at: now });
  const ev = await event(db, cid, 'system', 'combat.kill', { slug, level, first: r.first, analyzed: r.analyzedNow });
  const me = (c.discoveries as Discoveries).name ?? 'O Companion';
  const mems: { subject: string; content: string; importance: number; source_event_ids: number[]; origin: string; companion_id: string }[] = [];
  if (r.first) mems.push({ companion_id: cid, subject: 'companion', content: combatMemoryText('first', me, def, name, level), importance: 3, source_event_ids: [ev], origin: 'combat' });
  if (r.analyzedNow) mems.push({ companion_id: cid, subject: 'companion', content: combatMemoryText('analyzed', me, def, name, level), importance: 4, source_event_ids: [ev], origin: 'combat' });
  if (mems.length) await db.from('companion_memories').insert(mems);
  // XP de vínculo pela luta (com o multiplicador do Admin)
  const xp = combatXp(cfg, level, r.first, r.analyzedNow);
  let levelUp: number | null = null;
  if (xp > 0) {
    const before = c.bond_xp as number, after = before + xp;
    const { error } = await db.from('companions').update({ bond_xp: after }).eq('id', cid).eq('bond_xp', before);
    if (!error) {
      c.bond_xp = after;
      await event(db, cid, 'system', 'bond.xp', { total: xp, reason: 'combate', parts: { message: 0, discoveries: 0, memories: 0, combat: xp }, meaningful: false, slug });
      const lb = levelForXp(before, cfg), la = levelForXp(after, cfg);
      if (la > lb) levelUp = la;
    }
  }
  return { entry: r.entry, first: r.first, analyzed: r.analyzedNow, analyzedCount: r.analyzedCount, milestone: r.milestone, xp, levelUp };
}

/** Falas geradas pela IA: estoque por evento ("bank") ou uma fala de momento com contexto ("moment"). Não grava nada além do registro de uso. */
async function actBarks(db: SupabaseClient, c: Record<string, unknown>, body: Record<string, unknown>) {
  const cid = c.id as string;
  if (c.stage !== 'awakened') throw new HttpError(409, 'Só depois do despertar.');
  const mode = body.mode === 'moment' ? 'moment' : 'bank';
  // freio: estoque até 8 pedidos a cada 10 min; momentos até 10 por minuto
  const since = new Date(Date.now() - (mode === 'bank' ? 600_000 : 60_000)).toISOString();
  const { count } = await db.from('companion_events').select('id', { count: 'exact', head: true }).eq('companion_id', cid).eq('kind', 'barks.ai').eq('payload->>mode', mode).gte('created_at', since);
  if ((count ?? 0) >= (mode === 'bank' ? 8 : 10)) throw new HttpError(429, 'Calma! 🌙');
  const d = c.discoveries as Discoveries;
  const contract = c.identity_contract as IdentityContractV1 | null;
  const fam = contract?.species?.family as keyof typeof SPECIES | undefined;
  const persona = { discoveries: d, formLabel: fam && SPECIES[fam] ? `humanoide da classe ${SPECIES[fam].label}` : undefined };
  await event(db, cid, 'system', 'barks.ai', { mode });
  if (mode === 'bank') {
    const asked = Array.isArray(body.events) ? (body.events as unknown[]).filter((e): e is BarkEvent => typeof e === 'string' && BANK_EVENTS.includes(e as BarkEvent)).slice(0, 8) : [];
    if (!asked.length) return { lines: {} };
    const recent = Array.isArray(body.recent) ? (body.recent as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 80)).slice(0, 20) : [];
    let raw: string | null = null;
    const prompt = buildBarkBankPrompt(persona, asked, 5, recent);
    try { raw = await complete(prompt, [], 'Escreva as falas agora.', { maxTokens: 1400, timeoutMs: 20_000, quality: true }); } catch {
      try { raw = await complete(prompt, [], 'Escreva as falas agora.', { maxTokens: 1400, timeoutMs: 20_000 }); } catch { /* sem modelo */ }
    }
    return { lines: parseBarkBank(raw, asked) };
  }
  const ev = typeof body.event === 'string' && MOMENT_EVENTS.includes(body.event as BarkEvent) ? body.event as BarkEvent : null;
  if (!ev) throw new HttpError(400, 'Momento inválido.');
  const v = (body.vars ?? {}) as Record<string, unknown>;
  const vars = { m: clampText(v.m, 40) || undefined, p: clampText(v.p, 40) || undefined, n: Number.isFinite(Number(v.n)) ? Math.round(Number(v.n)) : undefined, t: Number.isFinite(Number(v.t)) ? Math.round(Number(v.t)) : undefined };
  let facts = '';
  const slug = typeof body.slug === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(body.slug) ? body.slug : null;
  if (slug) {
    const [defs, entries] = await Promise.all([creatureDefs(db), loadBestiary(db, cid)]);
    const def = defs.find((x) => x.slug === slug) ?? DEFAULT_CREATURES.find((x) => x.slug === slug);
    const e = entries.find((x) => x.slug === slug);
    if (def) {
      const z = dossier(def, e ?? { slug, name: def.name, kills: 0, particles: 0, firstAt: '', lastAt: '' }, (s) => s);
      facts = [z.description, z.temperament && `temperamento ${z.temperament}`, z.weakTo?.length && `fraca contra ${z.weakTo.join(', ')}`, z.resists?.length && `resiste a ${z.resists.join(', ')}`, z.drops?.length && `solta ${z.drops.join(', ')}`].filter(Boolean).join('; ');
    }
  }
  let raw: string | null = null;
  const prompt = buildMomentPrompt(persona, ev, vars, facts);
  try { raw = await complete(prompt, [], 'Fale agora.', { maxTokens: 300, timeoutMs: 8_000, quality: true }); } catch {
    try { raw = await complete(prompt, [], 'Fale agora.', { maxTokens: 300, timeoutMs: 6_000 }); } catch { /* sem modelo */ }
  }
  return { line: parseMoment(raw) };
}

async function snapshot(db: SupabaseClient, c: Record<string, unknown>, cfg: GameConfig) {
  const cid = c.id as string;
  const [quests, mem, diary, inv, chat, job, secrets, recipes, bestiary] = await Promise.all([
    loadQuests(db, cid),
    db.from('companion_memories').select('id,subject,content,importance,source_event_ids,origin,created_at').eq('companion_id', cid).eq('status', 'active').order('id', { ascending: false }).limit(60),
    db.from('companion_diary').select('id,game_day,body,source_event_ids,created_at').eq('companion_id', cid).order('id', { ascending: false }).limit(30),
    db.from('companion_inventory').select('item_key,qty,meta,acquired_at').eq('companion_id', cid).order('acquired_at'),
    db.from('companion_events').select('id,actor,kind,payload,created_at').eq('companion_id', cid).in('kind', ['chat.player', 'chat.companion', 'quest.completed', 'identity.renamed', 'secret.found', 'recipe.added', 'bond.level', 'companion.awakened']).order('id', { ascending: false }).limit(60),
    db.from('visual_jobs').select('id,status,contract_version,created_at,updated_at,result').eq('companion_id', cid).order('created_at', { ascending: false }).limit(1),
    db.from('companion_secrets').select('secret_key,achieved_at').eq('companion_id', cid).order('achieved_at'),
    db.from('companion_recipes').select('id,name,description,ingredients,created_at').eq('companion_id', cid).order('id', { ascending: false }).limit(50),
    loadBestiary(db, cid),
  ]);
  const d = c.discoveries as Discoveries;
  const level = levelForXp(c.bond_xp as number, cfg);
  return {
    companion: {
      id: cid, stage: c.stage, discoveries: d, bondXp: c.bond_xp, bond: levelProgress(c.bond_xp as number, cfg),
      identityContract: c.identity_contract, awakenedAt: c.awakened_at, lastDreamAt: c.last_dream_at, createdAt: c.created_at,
    },
    quests,
    awakening: checkAwakening(quests, d, level, cfg),
    memories: mem.data ?? [],
    diary: diary.data ?? [],
    inventory: inv.data ?? [],
    timeline: (chat.data ?? []).reverse(),
    visualJob: await withArtUrl(db, job.data?.[0] ?? null),
    secrets: (secrets.data ?? []).map((r) => ({ key: r.secret_key, achievedAt: r.achieved_at })),
    recipes: recipes.data ?? [],
    bestiary,
    boost: (c.xp_boost as number) ?? 0,
    config: cfg,
    provider: providerName(),
  };
}

// ---------------------------------------------------------------------------

async function actCreate(db: SupabaseClient, userId: string, cfg: Awaited<ReturnType<typeof loadConfig>>, rawSetup: unknown) {
  const { count } = await db.from('companions').select('id', { count: 'exact', head: true }).eq('owner_id', userId);
  if ((count ?? 0) >= cfg.maxCompanions) {
    const existing = await getCompanion(db, userId);
    return existing;
  }
  // Ritual de criação (opcional): nome, pronome, como a pessoa se chama e personalidade.
  const setup = rawSetup ? validateSetup(rawSetup) : null;
  if (setup && !setup.ok) throw new HttpError(400, setup.error);
  const discoveries = setup?.ok ? setup.discoveries : {};
  const { data: c, error } = await db.from('companions').insert({ owner_id: userId, discoveries }).select('*').single();
  if (error) {
    console.error('create', error.code, error.message);
    throw new HttpError(500, 'Não foi possível criar o Companion.');
  }
  const preDone = setup?.ok ? new Set(['identity', 'traits']) : new Set<string>();
  const now = new Date().toISOString();
  await db.from('companion_quests').insert(initialQuests().map((q) => ({ companion_id: c.id, quest_key: q.key, status: preDone.has(q.key) ? 'done' : q.status, completed_at: preDone.has(q.key) ? now : null })));
  const born = await event(db, c.id, 'system', 'companion.born', { stage: 'particles', ritual: !!setup });
  if (setup?.ok) {
    const d = setup.discoveries;
    for (const key of ['identity', 'traits'] as const) {
      const patch = key === 'identity' ? { name: d.name } : { traits: d.traits };
      const evId = await event(db, c.id, 'system', 'quest.completed', { quest: key, patch, evidence: 'ritual de criação', sources: [born] });
      await db.from('companion_quests').update({ source_event_id: evId }).eq('companion_id', c.id).eq('quest_key', key);
      const reward = QUEST_REWARDS[key];
      await db.from('companion_inventory').upsert({ companion_id: c.id, item_key: reward.item, qty: 1, meta: { label: reward.label, description: reward.description, quest: key, ...patch } });
    }
    await db.from('companion_memories').insert({ companion_id: c.id, subject: 'player', content: `A pessoa se chama ${d.playerName}.`, importance: 5, source_event_ids: [born], origin: 'conversation' });
  }
  return c;
}

/** Concede segredos: evento, item raro, XP imediato e impulso. Retorna o XP/impulso ganho. */
async function grantSecrets(db: SupabaseClient, cid: string, keys: SecretKey[], sources: number[]) {
  let xp = 0, boost = 0;
  for (const key of keys) {
    const def = SECRET_BY_KEY[key];
    const { error } = await db.from('companion_secrets').insert({ companion_id: cid, secret_key: key });
    if (error) continue; // já conquistado (corrida) — não concede de novo
    const evId = await event(db, cid, 'system', 'secret.found', { secret: key, title: def.title, story: def.story, item: def.item.item, xp: SECRET_XP, boost: SECRET_BOOST_TURNS, sources });
    await db.from('companion_secrets').update({ source_event_id: evId }).eq('companion_id', cid).eq('secret_key', key);
    await db.from('companion_inventory').upsert({ companion_id: cid, item_key: def.item.item, qty: 1, meta: { label: def.item.label, description: def.item.description, secret: key, rare: true } });
    xp += SECRET_XP; boost += SECRET_BOOST_TURNS;
  }
  return { xp, boost };
}

async function achievedSecrets(db: SupabaseClient, cid: string): Promise<Set<string>> {
  const { data } = await db.from('companion_secrets').select('secret_key').eq('companion_id', cid);
  return new Set((data ?? []).map((r) => r.secret_key as string));
}

async function actChat(db: SupabaseClient, c: Record<string, unknown>, message: string, cfg: Awaited<ReturnType<typeof loadConfig>>) {
  const cid = c.id as string;
  if (c.stage !== 'particles' && c.stage !== 'awakened') throw new HttpError(409, 'Estado inválido.');
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: today } = await db.from('companion_events').select('id', { count: 'exact', head: true }).eq('companion_id', cid).eq('kind', 'chat.player').gte('created_at', since);
  if ((today ?? 0) >= cfg.dailyChatLimit) throw new HttpError(429, 'Seu Companion precisa descansar um pouco. Volte mais tarde. 🌙');

  const [quests, recent, mems, meaningfulRes, recipeRows, questionRes, achieved] = await Promise.all([
    loadQuests(db, cid),
    db.from('companion_events').select('id,kind,payload').eq('companion_id', cid).in('kind', ['chat.player', 'chat.companion']).order('id', { ascending: false }).limit(16),
    db.from('companion_memories').select('id,subject,content,importance').eq('companion_id', cid).eq('status', 'active').order('importance', { ascending: false }).order('id', { ascending: false }).limit(40),
    db.from('companion_events').select('id', { count: 'exact', head: true }).eq('companion_id', cid).eq('kind', 'bond.xp').eq('payload->>meaningful', 'true').gte('created_at', since),
    db.from('companion_recipes').select('name').eq('companion_id', cid).order('id', { ascending: false }).limit(50),
    db.from('companion_events').select('id', { count: 'exact', head: true }).eq('companion_id', cid).eq('kind', 'chat.player').eq('payload->>askedCompanion', 'true'),
    achievedSecrets(db, cid),
  ]);
  const recipeNames = (recipeRows.data ?? []).map((r) => r.name as string);
  const askedCompanion = isQuestionAboutCompanion(message);
  const history: ChatLine[] = (recent.data ?? []).reverse().map((e) => ({ role: e.kind === 'chat.player' ? 'player' : 'companion', text: String((e.payload as { text?: string }).text ?? '') }));
  const recentPlayer = (recent.data ?? []).filter((e) => e.kind === 'chat.player').slice(0, 8).map((e) => String((e.payload as { text?: string }).text ?? ''));
  const memories = (mems.data ?? []) as MemoryLite[];
  const d = c.discoveries as Discoveries;
  const level = levelForXp(c.bond_xp as number, cfg);

  const playerEventId = await event(db, cid, 'player', 'chat.player', { text: message, ...(askedCompanion ? { askedCompanion: true } : {}) });

  const phase = gameTime(Date.now()).phase;
  const bc = await bodyAndCombat(db, c);
  const system = buildChatSystemPrompt({ discoveries: d, quests, bondLevel: level, memories, history, gamePhase: phase, firstMeeting: history.length === 0, recipes: recipeNames, seed: playerEventId, body: bc.body, combat: bc.combat });
  let model;
  let source: string = providerName();
  let diag: string | undefined;
  try {
    const raw = await complete(system, history, message);
    model = raw ? parseModelTurn(raw) : null;
    if (!raw) diag = 'sem resposta';
  } catch (e) {
    diag = (e as Error).message.slice(0, 60);
    console.error('llm', diag);
    model = null;
  }
  const lastCompanion = [...history].reverse().find((h) => h.role === 'companion')?.text ?? '';
  if (!model) {
    source = 'offline';
    model = offlineTurn(message, d, quests, Date.now(), recentPlayer, lastCompanion);
  } else {
    model = assistDiscoveries(message, model, d, quests, recentPlayer, lastCompanion);
    if (d.pronoun === 'ele') model = { ...model, reply: masculinize(model.reply) }; // "ele": fala de si no masculino
  }

  const plan = applyTurn({
    playerMessage: message, model, discoveries: d, quests, bondXp: c.bond_xp as number, existingMemories: memories,
    recentPlayerMessages: recentPlayer, meaningfulToday: meaningfulRes.count ?? 0, cfg,
    boost: (c.xp_boost as number) ?? 0, existingRecipes: recipeNames,
  });

  const replyEventId = await event(db, cid, 'companion', 'chat.companion', { text: model.reply, mood: model.mood, source });
  for (const comp of plan.completed) {
    const proposal = model.discoveries.find((p) => p.quest === comp.key);
    const evId = await event(db, cid, 'system', 'quest.completed', { quest: comp.key, patch: comp.patch, evidence: proposal?.evidence ?? '', sources: [playerEventId, replyEventId] });
    await db.from('companion_quests').update({ status: 'done', completed_at: new Date().toISOString(), source_event_id: evId }).eq('companion_id', cid).eq('quest_key', comp.key);
    const reward = QUEST_REWARDS[comp.key];
    await db.from('companion_inventory').upsert({ companion_id: cid, item_key: reward.item, qty: 1, meta: { label: reward.label, description: reward.description, quest: comp.key, ...comp.patch } });
  }
  if (plan.rejected.length) await event(db, cid, 'system', 'quest.rejected', { items: plan.rejected });
  if (plan.renamed) await event(db, cid, 'system', 'identity.renamed', { from: d.name ?? null, to: plan.renamed, sources: [playerEventId, replyEventId] });
  if (plan.newMemories.length) {
    await db.from('companion_memories').insert(plan.newMemories.map((m) => ({ companion_id: cid, subject: m.subject, content: m.content, importance: m.importance, source_event_ids: [playerEventId, replyEventId], origin: 'conversation' })));
  }
  // Livro de receitas
  const addedRecipes: string[] = [];
  for (const r of plan.recipes) {
    const { error } = await db.from('companion_recipes').insert({ companion_id: cid, name: r.name, description: r.description, ingredients: r.ingredients, source_event_ids: [playerEventId, replyEventId] });
    if (error) continue;
    await event(db, cid, 'system', 'recipe.added', { name: r.name, sources: [playerEventId, replyEventId] });
    addedRecipes.push(r.name);
  }
  // Quests secretas (sinais determinísticos)
  const secretKeys = evaluateSecrets({
    message, meaningful: plan.xp.meaningful, phase, renamed: !!plan.renamed,
    recipesTotal: recipeNames.length + addedRecipes.length, questionsAboutCompanion: (questionRes.count ?? 0) + (askedCompanion ? 1 : 0),
  }, achieved);
  const bonus = await grantSecrets(db, cid, secretKeys, [playerEventId, replyEventId]);
  const bondXp = plan.bondXp + bonus.xp;
  const levelAfter = levelForXp(bondXp, cfg);
  await event(db, cid, 'system', 'bond.xp', { ...plan.xp, secretXp: bonus.xp, before: c.bond_xp, after: bondXp });
  if (levelAfter > plan.levelBefore) await event(db, cid, 'system', 'bond.level', { level: levelAfter });
  const { data: updated } = await db.from('companions').update({ discoveries: plan.discoveries, bond_xp: bondXp, xp_boost: plan.boostLeft + bonus.boost, updated_at: new Date().toISOString() }).eq('id', cid).select('*').single();

  return { companion: updated, turn: { reply: model.reply, mood: model.mood, source, diag, renamed: plan.renamed, xp: plan.xp, completed: plan.completed.map((x) => x.key), rejected: plan.rejected, newMemories: plan.newMemories.length, levelUp: levelAfter > plan.levelBefore ? levelAfter : null, awakeningReady: checkAwakening(plan.quests, plan.discoveries, levelAfter, cfg).ready, secrets: secretKeys, recipes: addedRecipes } };
}

async function actDream(db: SupabaseClient, c: Record<string, unknown>) {
  const cid = c.id as string;
  const since = (c.last_dream_at as string) ?? (c.created_at as string);
  const { data: evs } = await db.from('companion_events').select('id,kind,payload,created_at').eq('companion_id', cid).gt('created_at', since).in('kind', ['chat.player', 'chat.companion', 'quest.completed', 'bond.level']).order('id').limit(80);
  const events = evs ?? [];
  if (events.length < 4) return { dreamed: false, reason: 'Ainda há pouco para sonhar. Conversem mais um pouco.' };
  const name = (c.discoveries as Discoveries).name;
  const lines = events.map((e) => {
    const p = e.payload as Record<string, unknown>;
    const text = e.kind === 'chat.player' ? `A pessoa disse: "${clampText(p.text, 240)}"`
      : e.kind === 'chat.companion' ? `Eu respondi: "${clampText(p.text, 240)}"`
      : e.kind === 'quest.completed' ? `Descobri algo sobre mim (${p.quest}): ${JSON.stringify(p.patch)}`
      : `Nosso vínculo chegou ao nível ${p.level}`;
    return { id: e.id as number, text };
  });
  const { data: mems } = await db.from('companion_memories').select('subject,content,importance').eq('companion_id', cid).eq('status', 'active').order('importance', { ascending: false }).limit(12);
  let out;
  try {
    const raw = await complete(buildDreamPrompt(name, lines, (mems ?? []) as MemoryLite[]), [], 'Escreva o diário agora.');
    out = raw ? parseDream(raw, new Set(lines.map((l) => l.id))) : null;
  } catch { out = null; }
  if (!out || !out.diary) {
    const quests = events.filter((e) => e.kind === 'quest.completed').length;
    const talks = events.filter((e) => e.kind === 'chat.player').length;
    out = { diary: `Hoje conversamos ${talks} ${talks === 1 ? 'vez' : 'vezes'}${quests ? ` e eu descobri ${quests} ${quests === 1 ? 'coisa' : 'coisas'} sobre mim` : ''}. Guardei tudo no meu núcleo antes de descansar.`, insights: [] };
  }
  const ids = lines.map((l) => l.id);
  let memoryIds: number[] = [];
  if (out.insights.length) {
    const { data } = await db.from('companion_memories').insert(out.insights.map((i) => ({ companion_id: cid, subject: i.subject, content: i.content, importance: i.importance, source_event_ids: i.sources, origin: 'dream' }))).select('id');
    memoryIds = (data ?? []).map((r) => r.id as number);
  }
  await db.from('companion_diary').insert({ companion_id: cid, game_day: companionDay(Date.parse(c.created_at as string), Date.now()), body: out.diary, source_event_ids: ids, memory_ids: memoryIds });
  await event(db, cid, 'system', 'companion.dreamed', { events: ids.length, insights: memoryIds });
  const { count: diaryTotal } = await db.from('companion_diary').select('id', { count: 'exact', head: true }).eq('companion_id', cid);
  const secretKeys = evaluateSecrets({ diaryTotal: diaryTotal ?? 0 }, await achievedSecrets(db, cid));
  const bonus = await grantSecrets(db, cid, secretKeys, ids.slice(-2));
  await db.from('companions').update({ last_dream_at: new Date().toISOString(), bond_xp: (c.bond_xp as number) + bonus.xp, xp_boost: ((c.xp_boost as number) ?? 0) + bonus.boost }).eq('id', cid);
  return { dreamed: true, secrets: secretKeys };
}

/** O Companion puxa assunto sozinho quando a pessoa fica em silêncio (no máximo uma vez por silêncio). */
async function actMuse(db: SupabaseClient, c: Record<string, unknown>, cfg: Awaited<ReturnType<typeof loadConfig>>) {
  const cid = c.id as string;
  const { data: recent } = await db.from('companion_events').select('id,kind,payload,created_at').eq('companion_id', cid).in('kind', ['chat.player', 'chat.companion']).order('id', { ascending: false }).limit(16);
  const rows = recent ?? [];
  // só depois de uma resposta do Companion, e nunca duas vezes seguidas sem a pessoa falar
  if (!rows.length || rows[0].kind !== 'chat.companion' || (rows[0].payload as { muse?: boolean }).muse) return { mused: false };
  if (Date.now() - Date.parse(rows[0].created_at as string) < 45_000) return { mused: false };
  const history: ChatLine[] = rows.reverse().map((e) => ({ role: e.kind === 'chat.player' ? 'player' : 'companion', text: String((e.payload as { text?: string }).text ?? '') }));
  const [quests, mems, recipeRows] = await Promise.all([
    loadQuests(db, cid),
    db.from('companion_memories').select('id,subject,content,importance').eq('companion_id', cid).eq('status', 'active').order('importance', { ascending: false }).limit(20),
    db.from('companion_recipes').select('name').eq('companion_id', cid).limit(20),
  ]);
  const d = c.discoveries as Discoveries;
  const bc = await bodyAndCombat(db, c);
  const system = buildMusePrompt({ discoveries: d, quests, bondLevel: levelForXp(c.bond_xp as number, cfg), memories: (mems.data ?? []) as MemoryLite[], history, gamePhase: gameTime(Date.now()).phase, firstMeeting: false, recipes: (recipeRows.data ?? []).map((r) => r.name as string), seed: Date.now() >> 16, body: bc.body, combat: bc.combat });
  let reply = '', mood = 'curiosa';
  try {
    const raw = await complete(system, history, '(a pessoa está em silêncio há um tempo)');
    if (raw) { const t = parseModelTurn(raw); reply = t.reply; mood = t.mood; }
  } catch { /* sem modelo: não puxa assunto */ }
  if (!reply || reply === '…') return { mused: false };
  if ((c.discoveries as Discoveries | null)?.pronoun === 'ele') reply = masculinize(reply);
  await event(db, cid, 'companion', 'chat.companion', { text: reply, mood, source: providerName(), muse: true });
  return { mused: true, reply, mood };
}

async function actAwaken(db: SupabaseClient, c: Record<string, unknown>, cfg: GameConfig) {
  const cid = c.id as string;
  if (c.stage === 'awakened') return { awakened: true };
  const quests = await loadQuests(db, cid);
  const d = c.discoveries as Discoveries;
  const level = levelForXp(c.bond_xp as number, cfg);
  const check = checkAwakening(quests, d, level, cfg);
  if (!check.ready) throw new HttpError(409, 'Ainda não é hora de despertar: ' + check.missing.join(', '));
  const contract = buildIdentityContract(cid, d as Required<Discoveries>, level, d.pronoun ?? 'ela');
  const version = (c.identity_version as number) + 1;
  const evId = await event(db, cid, 'system', 'companion.awakened', { contractVersion: version });
  await db.from('companions').update({ stage: 'awakened', identity_contract: contract, identity_version: version, awakened_at: new Date().toISOString() }).eq('id', cid);
  // Fábrica de personagens: forma procedural já é exibida; arte final entra na fila do Studio.
  await db.from('visual_jobs').insert({ companion_id: cid, contract_version: version, contract, status: 'queued', result: { fallback: 'procedural-v1', event: evId } });
  return { awakened: true };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(URL_, ANON || SERVICE, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!u?.user) return json(401, { error: 'Faça login para entrar no Refúgio.' });
    const userId = u.user.id;
    const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'state');
    const cfg = await loadConfig(db);
    if (action.startsWith('admin.')) {
      if (!(await isAdmin(db, userId))) return json(403, { error: 'Esta conta não é administradora.' });
      if (action === 'admin.jobs') return json(200, await adminJobs(db));
      if (action === 'admin.update') return json(200, await adminUpdate(db, body));
      if (action === 'admin.companions') return json(200, await adminCompanions(db, cfg));
      if (action === 'admin.companion') return json(200, await adminCompanion(db, cfg, String(body.companionId ?? '')));
      return json(404, { error: 'Ação desconhecida.' });
    }
    let c = await getCompanion(db, userId, typeof body.companionId === 'string' ? body.companionId : undefined);

    if (action === 'create') {
      c = c ?? (await actCreate(db, userId, cfg, body.setup));
      return json(200, await snapshot(db, c!, cfg));
    }
    if (!c) return json(200, { companion: null, config: cfg, provider: providerName() });

    if (action === 'state') return json(200, await snapshot(db, c, cfg));
    if (action === 'chat') {
      const message = clampText(body.message, 1000);
      if (!message) return json(400, { error: 'Mensagem vazia.' });
      const r = await actChat(db, c, message, cfg);
      return json(200, { ...(await snapshot(db, r.companion ?? c, cfg)), turn: r.turn });
    }
    if (action === 'dream') {
      const r = await actDream(db, c);
      const fresh = await getCompanion(db, userId, c.id);
      return json(200, { ...(await snapshot(db, fresh ?? c, cfg)), dream: r });
    }
    if (action === 'muse') {
      const r = await actMuse(db, c, cfg);
      const snap = await snapshot(db, c, cfg);
      return json(200, r.mused ? { ...snap, turn: { reply: r.reply, mood: r.mood, source: 'muse', xp: { total: 0, parts: { message: 0, discoveries: 0, memories: 0 }, reason: 'muse', meaningful: false }, completed: [], rejected: [], newMemories: 0, levelUp: null, awakeningReady: snap.awakening.ready } } : snap);
    }
    if (action === 'combat.kill') {
      const r = await actCombatKill(db, c, body, cfg);
      return json(200, { ...(await snapshot(db, c, cfg)), combat: r });
    }
    if (action === 'barks') return json(200, await actBarks(db, c, body));
    if (action.startsWith('ecos.')) {
      const cc = c;
      return json(200, await ecosAction(action, body, { db, c: cc, cfg, ecfg: cfg.ecos, pcfg: cfg.pacto, admin: await isAdmin(db, userId), event: (kind, payload) => event(db, cc.id as string, 'system', kind, payload) }));
    }
    if (action.startsWith('pacto.')) {
      const cc = c;
      return json(200, await pactoAction(action, body, { db, c: cc, admin: await isAdmin(db, userId), pcfg: cfg.pacto, ecfg: cfg.ecos, event: (kind, payload) => event(db, cc.id as string, 'system', kind, payload) }));
    }
    if (action.startsWith('build.')) {
      const cc = c;
      return json(200, await buildAction(action, body, { db, c: cc, cfg, bcfg: cfg.constellation, event: (kind, payload) => event(db, cc.id as string, 'system', kind, payload) }));
    }
    if (action.startsWith('social.')) {
      return json(200, await socialAction(action, body, { db, c, bagCap: cfg.ecos.bag, event: (cid, kind, payload) => event(db, cid, 'system', kind, payload) }));
    }
    if (action === 'awaken') {
      await actAwaken(db, c, cfg);
      const fresh = await getCompanion(db, userId, c.id);
      return json(200, await snapshot(db, fresh ?? c, cfg));
    }
    return json(404, { error: 'Ação desconhecida.' });
  } catch (e) {
    if (e instanceof HttpError || e instanceof EcosError || e instanceof PactoError || e instanceof BuildError || e instanceof SocialError) return json(e.status, { error: e.message });
    console.error('refuge', (e as Error).message);
    return json(500, { error: 'O Refúgio está instável agora. Tente de novo.' });
  }
});
