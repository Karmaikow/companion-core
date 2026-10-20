// Edge Function `refuge` — servidor autoritativo do MVP 1.
// A IA propõe; as regras de shared/rules decidem. Toda escrita passa por aqui.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  resolveConfig, levelForXp, levelProgress, initialQuests, applyTurn, parseModelTurn, buildChatSystemPrompt,
  offlineTurn, assistDiscoveries, buildDreamPrompt, parseDream, checkAwakening, buildIdentityContract, gameTime, companionDay, clampText,
  QUESTS, QUEST_REWARDS, validateSetup, evaluateSecrets, isQuestionAboutCompanion, buildMusePrompt,
  SECRET_BY_KEY, SECRET_XP, SECRET_BOOST_TURNS, type SecretKey, type GameConfig, type QuestState, type Discoveries, type MemoryLite, type ChatLine,
} from './rules/index.ts';
import { complete, providerName } from './llm.ts';

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

async function loadConfig(db: SupabaseClient): Promise<GameConfig & { dailyChatLimit: number; maxCompanions: number }> {
  const { data } = await db.from('game_config').select('values').eq('id', 1).maybeSingle();
  const v = (data?.values ?? {}) as Record<string, number>;
  return { ...resolveConfig(v), dailyChatLimit: Number(v.dailyChatLimit) > 0 ? Number(v.dailyChatLimit) : 300, maxCompanions: Number(v.maxCompanions) > 0 ? Number(v.maxCompanions) : 1 };
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

async function snapshot(db: SupabaseClient, c: Record<string, unknown>, cfg: GameConfig) {
  const cid = c.id as string;
  const [quests, mem, diary, inv, chat, job, secrets, recipes] = await Promise.all([
    loadQuests(db, cid),
    db.from('companion_memories').select('id,subject,content,importance,source_event_ids,origin,created_at').eq('companion_id', cid).eq('status', 'active').order('id', { ascending: false }).limit(60),
    db.from('companion_diary').select('id,game_day,body,source_event_ids,created_at').eq('companion_id', cid).order('id', { ascending: false }).limit(30),
    db.from('companion_inventory').select('item_key,qty,meta,acquired_at').eq('companion_id', cid).order('acquired_at'),
    db.from('companion_events').select('id,actor,kind,payload,created_at').eq('companion_id', cid).in('kind', ['chat.player', 'chat.companion', 'quest.completed', 'identity.renamed', 'secret.found', 'recipe.added', 'bond.level', 'companion.awakened']).order('id', { ascending: false }).limit(60),
    db.from('visual_jobs').select('id,status,contract_version,created_at,updated_at,result').eq('companion_id', cid).order('created_at', { ascending: false }).limit(1),
    db.from('companion_secrets').select('secret_key,achieved_at').eq('companion_id', cid).order('achieved_at'),
    db.from('companion_recipes').select('id,name,description,ingredients,created_at').eq('companion_id', cid).order('id', { ascending: false }).limit(50),
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
    visualJob: job.data?.[0] ?? null,
    secrets: (secrets.data ?? []).map((r) => ({ key: r.secret_key, achievedAt: r.achieved_at })),
    recipes: recipes.data ?? [],
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
  const system = buildChatSystemPrompt({ discoveries: d, quests, bondLevel: level, memories, history, gamePhase: phase, firstMeeting: history.length === 0, recipes: recipeNames, seed: playerEventId });
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
  const system = buildMusePrompt({ discoveries: d, quests, bondLevel: levelForXp(c.bond_xp as number, cfg), memories: (mems.data ?? []) as MemoryLite[], history, gamePhase: gameTime(Date.now()).phase, firstMeeting: false, recipes: (recipeRows.data ?? []).map((r) => r.name as string), seed: Date.now() >> 16 });
  let reply = '', mood = 'curiosa';
  try {
    const raw = await complete(system, history, '(a pessoa está em silêncio há um tempo)');
    if (raw) { const t = parseModelTurn(raw); reply = t.reply; mood = t.mood; }
  } catch { /* sem modelo: não puxa assunto */ }
  if (!reply || reply === '…') return { mused: false };
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
    if (action === 'awaken') {
      await actAwaken(db, c, cfg);
      const fresh = await getCompanion(db, userId, c.id);
      return json(200, await snapshot(db, fresh ?? c, cfg));
    }
    return json(404, { error: 'Ação desconhecida.' });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error('refuge', (e as Error).message);
    return json(500, { error: 'O Refúgio está instável agora. Tente de novo.' });
  }
});
