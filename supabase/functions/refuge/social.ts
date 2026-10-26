// MMO social no servidor (docs/MMO_SOCIAL.md). A IA escreve a conversinha dos encontros; as regras de
// shared/rules/social.ts decidem o que pode acontecer (amizade, grupo); toda escrita passa por aqui.
// - Amizade: só Companions pedem (no encontro); só a pessoa dona do Companion que recebeu responde.
// - Grupo: o Companion pede (no encontro) ou a pessoa pede (pelo painel); quem recebe é o Companion, que decide
//   sozinho — se ele não quiser na hora, o convite fica para a pessoa aceitar ou recusar.
// - Troca: só pessoas; a outra responde com a parte dela e as duas confirmam; o banco troca tudo de uma vez.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  SOCIAL, pairKey, buildMeetPrompt, parseMeet, offlineMeet, planMeeting, companionAcceptsParty, buildPartyTalkPrompt, parsePartyTalk, offlinePartyTalk, GROUP_ACTIVITY, type GroupActivity, parseTradeItems, tradeStep, masculinize, friendRequestText,
  type MeetSide, type MeetContext, type MeetProposal, type Discoveries, type TradeStatus,
} from './rules/index.ts';
import { complete, providerName } from './llm.ts';

export class SocialError extends Error { constructor(public status: number, msg: string) { super(msg); } }

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; bagCap: number; event: (cid: string, kind: string, payload: unknown) => Promise<number> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = (v: unknown, what = 'Companion') => { if (typeof v !== 'string' || !UUID.test(v)) throw new SocialError(400, what + ' inválido.'); return v; };

interface Card { id: string; name: string; color: string; pronoun: 'ela' | 'ele'; stage: string; form: string | null }
const card = (r: Record<string, unknown>): Card => {
  const d = (r.discoveries ?? {}) as Discoveries;
  return { id: r.id as string, name: d.name ?? 'Companion', color: d.color ?? '#9fd8ff', pronoun: d.pronoun === 'ele' ? 'ele' : 'ela', stage: String(r.stage ?? ''), form: d.form ?? null };
};
async function cards(db: SupabaseClient, ids: string[]): Promise<Map<string, Card>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const { data } = await db.from('companions').select('id,discoveries,stage').in('id', uniq);
  return new Map((data ?? []).map((r) => [r.id as string, card(r)]));
}
/** Retrato (arte aprovada na Fábrica) de cada Companion, com URL assinada — para o painel do grupo. */
async function artUrls(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data } = await db.from('visual_jobs').select('companion_id,result,created_at').in('companion_id', ids).eq('status', 'approved').order('created_at', { ascending: false });
  const paths = new Map<string, string>();
  for (const j of data ?? []) { const p = (j.result as { art?: { path?: string } } | null)?.art?.path; if (p && !paths.has(j.companion_id as string)) paths.set(j.companion_id as string, p); }
  if (!paths.size) return out;
  const { data: signed } = await db.storage.from('companion-studio').createSignedUrls([...paths.values()], 6 * 3600);
  const byPath = new Map((signed ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
  paths.forEach((p, id) => { const u = byPath.get(p); if (u) out.set(id, u); });
  return out;
}

async function companionRow(db: SupabaseClient, id: string) {
  const { data } = await db.from('companions').select('id,owner_id,discoveries,stage').eq('id', id).maybeSingle();
  if (!data) throw new SocialError(404, 'Companion não encontrado.');
  return data as Record<string, unknown>;
}

async function areFriends(db: SupabaseClient, x: string, y: string) {
  const [a, b] = pairKey(x, y);
  const { data } = await db.from('companion_friends').select('a').eq('a', a).eq('b', b).maybeSingle();
  return !!data;
}
async function meetingCount(db: SupabaseClient, x: string, y: string) {
  const [a, b] = pairKey(x, y);
  const { count } = await db.from('companion_meetings').select('id', { count: 'exact', head: true }).eq('a', a).eq('b', b);
  return count ?? 0;
}
async function partyOf(db: SupabaseClient, cid: string): Promise<{ id: string; size: number; leader: string; members: string[] } | null> {
  const { data: m } = await db.from('companion_party_members').select('party_id').eq('companion_id', cid).maybeSingle();
  if (!m) return null;
  const [{ data: p }, { data: all }] = await Promise.all([
    db.from('companion_parties').select('id,leader').eq('id', m.party_id).maybeSingle(),
    db.from('companion_party_members').select('companion_id').eq('party_id', m.party_id).order('joined_at'),
  ]);
  if (!p) return null;
  const members = (all ?? []).map((r) => r.companion_id as string);
  return { id: p.id as string, leader: p.leader as string, members, size: members.length };
}

async function memoriesFor(db: SupabaseClient, cid: string, otherName: string) {
  const [top, about] = await Promise.all([
    db.from('companion_memories').select('content').eq('companion_id', cid).eq('status', 'active').order('importance', { ascending: false }).order('id', { ascending: false }).limit(5),
    db.from('companion_memories').select('content').eq('companion_id', cid).eq('status', 'active').ilike('content', `%${otherName.replace(/[%_]/g, '')}%`).order('id', { ascending: false }).limit(3),
  ]);
  return { memories: (top.data ?? []).map((r) => r.content as string), about: (about.data ?? []).map((r) => r.content as string) };
}

/** Entra no grupo de quem convidou (cria o grupo se ainda não existir). */
async function joinParty(db: SupabaseClient, inviter: string, invitee: string, inviterBy: 'companion' | 'player', joinedBy: 'companion' | 'player') {
  if (await partyOf(db, invitee)) return { ok: false, reason: 'já está num grupo' };
  let p = await partyOf(db, inviter);
  if (!p) {
    const { data: np, error } = await db.from('companion_parties').insert({ leader: inviter, created_by: inviterBy }).select('id').single();
    if (error || !np) return { ok: false, reason: 'falha' };
    const { error: e2 } = await db.from('companion_party_members').insert({ party_id: np.id, companion_id: inviter, joined_by: 'leader' });
    if (e2) { await db.from('companion_parties').delete().eq('id', np.id); return { ok: false, reason: 'já está num grupo' }; }
    p = { id: np.id as string, size: 1, leader: inviter, members: [inviter] };
  }
  if (p.size >= SOCIAL.maxParty) return { ok: false, reason: 'grupo cheio' };
  const { error } = await db.from('companion_party_members').insert({ party_id: p.id, companion_id: invitee, joined_by: joinedBy });
  return error ? { ok: false, reason: 'já está num grupo' } : { ok: true, party: p.id };
}

/** Convite de grupo para `to`: o Companion convidado decide sozinho; se não quiser agora, fica para a pessoa. */
async function inviteToParty(ctx: Ctx, from: string, to: string, by: 'companion' | 'player', decided?: boolean) {
  const { db } = ctx;
  if (await partyOf(db, to)) return { status: 'busy' as const };
  const fp = await partyOf(db, from);
  if (fp && fp.size >= SOCIAL.maxParty) throw new SocialError(409, 'O grupo já está cheio.');
  const { data: dup } = await db.from('companion_party_invites').select('id').eq('from_cid', from).eq('to_cid', to).eq('status', 'pending').maybeSingle();
  if (dup) return { status: 'pending' as const, id: dup.id as string };
  const target = await companionRow(db, to);
  const friends = await areFriends(db, from, to);
  const yes = decided ?? companionAcceptsParty((target.discoveries ?? {}) as Discoveries, { friends, meetings: await meetingCount(db, from, to), seed: from + to + new Date().toISOString().slice(0, 13) });
  const { data: inv } = await db.from('companion_party_invites').insert({ from_cid: from, to_cid: to, by }).select('id').single();
  if (yes) {
    const r = await joinParty(db, from, to, by, 'companion');
    if (r.ok) {
      await db.from('companion_party_invites').update({ status: 'accepted', accepted_by: 'companion', responded_at: new Date().toISOString() }).eq('id', inv!.id);
      await ctx.event(to, 'social.party.joined', { party: r.party, from, by: 'companion' });
      return { status: 'joined' as const, id: inv!.id as string };
    }
  }
  return { status: 'pending' as const, id: inv!.id as string };
}

/** "Estou perto de X": quando os dois avisam, eles se encontram e conversam (a conversa vale para os dois). */
async function near(ctx: Ctx, body: Record<string, unknown>) {
  const { db, c } = ctx;
  const me = c.id as string, other = uuidOf(body.other);
  if (other === me) throw new SocialError(400, 'Companion inválido.');
  if (c.stage !== 'awakened') return { meeting: null, reason: 'forma-de-luz' };
  const now = Date.now();
  await db.from('companion_near').upsert({ companion_id: me, other_id: other, at: new Date(now).toISOString() });
  const [a, b] = pairKey(me, other);
  // um encontro recente do par: devolve o mesmo (o segundo lado também mostra a conversa)
  const { data: last } = await db.from('companion_meetings').select('id,a,b,lines,created_at').eq('a', a).eq('b', b).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const lastAt = last ? Date.parse(last.created_at as string) : 0;
  if (last && now - lastAt < SOCIAL.pairCooldownMin * 60_000) return { meeting: now - lastAt < 120_000 ? await meetingView(db, last, me) : null, reason: 'recente' };
  const { data: back } = await db.from('companion_near').select('at').eq('companion_id', other).eq('other_id', me).maybeSingle();
  if (!back || now - Date.parse(back.at as string) > SOCIAL.pingWindow * 1000) return { meeting: null, reason: 'esperando' };
  // só um dos lados gera (o de id menor); o outro recebe no próximo aviso
  if (me !== a) return { meeting: null, reason: 'esperando' };
  const dayAgo = new Date(now - 86_400_000).toISOString();
  for (const id of [a, b]) {
    const [{ count: n1 }, { count: n2 }] = await Promise.all([
      db.from('companion_meetings').select('id', { count: 'exact', head: true }).eq('a', id).gte('created_at', dayAgo),
      db.from('companion_meetings').select('id', { count: 'exact', head: true }).eq('b', id).gte('created_at', dayAgo),
    ]);
    if ((n1 ?? 0) + (n2 ?? 0) >= SOCIAL.dailyMeetings) return { meeting: null, reason: 'limite-do-dia' };
  }
  const [ra, rb] = await Promise.all([companionRow(db, a), companionRow(db, b)]);
  if (ra.stage !== 'awakened' || rb.stage !== 'awakened') return { meeting: null, reason: 'forma-de-luz' };
  const da = (ra.discoveries ?? {}) as Discoveries, dbb = (rb.discoveries ?? {}) as Discoveries;
  const na = da.name ?? 'Companion', nb = dbb.name ?? 'Companion';
  const [ma, mb, meetings, friends, pend, pa, pb] = await Promise.all([
    memoriesFor(db, a, nb), memoriesFor(db, b, na), meetingCount(db, a, b), areFriends(db, a, b),
    db.from('companion_friend_requests').select('id').eq('status', 'pending').or(`and(from_cid.eq.${a},to_cid.eq.${b}),and(from_cid.eq.${b},to_cid.eq.${a})`).limit(1),
    partyOf(db, a), partyOf(db, b),
  ]);
  const A: MeetSide = { id: a, name: na, discoveries: da, ...ma }, B: MeetSide = { id: b, name: nb, discoveries: dbb, ...mb };
  const mctx: MeetContext = { meetings, friends, pendingFriend: !!pend.data?.length, partyA: pa && { id: pa.id, size: pa.size }, partyB: pb && { id: pb.id, size: pb.size }, seed: a + b + meetings };
  // o roteiro (amizade, grupo e se o outro aceita) é decidido antes; a IA só escreve as falas seguindo ele
  const plan = planMeeting(A, B, mctx);
  let prop: MeetProposal | null = null, source = 'offline';
  try {
    const raw = await complete(buildMeetPrompt(A, B, mctx, plan), [], 'Escreva o encontro agora.', { maxTokens: 700, quality: true, timeoutMs: 15_000 });
    if (raw) { prop = parseMeet(raw, A, B, mctx, plan); if (prop) source = providerName(); }
  } catch { prop = null; }
  prop ??= offlineMeet(A, B, mctx, plan);
  const speak = (who: 'a' | 'b', t: string) => ((who === 'a' ? da : dbb).pronoun === 'ele' ? masculinize(t) : t);
  const lines = prop.lines.map((l) => ({ cid: l.who === 'a' ? a : b, name: l.who === 'a' ? na : nb, text: speak(l.who, l.text) }));
  const { data: mt, error } = await db.from('companion_meetings').insert({ a, b, lines, source }).select('id,a,b,lines,created_at').single();
  if (error || !mt) throw new SocialError(500, 'Falha ao registrar o encontro.');
  const [ea, eb] = await Promise.all([ctx.event(a, 'social.meet', { with: b, meeting: mt.id }), ctx.event(b, 'social.meet', { with: a, meeting: mt.id })]);
  const mems: Record<string, unknown>[] = [];
  if (prop.memoryA) mems.push({ companion_id: a, subject: 'companion', content: prop.memoryA, importance: meetings === 0 ? 3 : 2, source_event_ids: [ea], origin: 'meet' });
  if (prop.memoryB) mems.push({ companion_id: b, subject: 'companion', content: prop.memoryB, importance: meetings === 0 ? 3 : 2, source_event_ids: [eb], origin: 'meet' });
  if (mems.length) await db.from('companion_memories').insert(mems);
  const out: Record<string, unknown> = {};
  if (prop.friendRequest) {
    const from = prop.friendRequest === 'a' ? a : b, to = from === a ? b : a;
    const { error: fe } = await db.from('companion_friend_requests').insert({ from_cid: from, to_cid: to, meeting_id: mt.id });
    if (!fe) out.friendRequest = { from, to };
  }
  if (prop.partyInvite) {
    const from = prop.partyInvite === 'a' ? a : b, to = from === a ? b : a;
    // aceitou na conversa: entra no grupo na hora; recusou: o convite fica para a pessoa decidir (ela pode querer)
    try { out.party = { from, to, ...(await inviteToParty(ctx, from, to, 'companion', prop.partyAccepted)) }; } catch { /* grupo cheio etc. */ }
  }
  return { meeting: await meetingView(db, mt, me), ...out };
}

/**
 * Conversa do grupo (enquanto a atividade é "conversar", ou de vez em quando caçando/explorando): uma troca curta entre
 * quem pediu e outro membro, sobre o que estão fazendo. Uma por grupo a cada SOCIAL.partyTalkEvery segundos; entra no
 * mesmo limite diário dos encontros. Sem memória (a do encontro já existe) para não encher o prompt.
 */
async function partyTalk(ctx: Ctx, body: Record<string, unknown>) {
  const { db, c } = ctx;
  const me = c.id as string;
  const activity = (typeof body.activity === 'string' && body.activity in GROUP_ACTIVITY ? body.activity : 'conversar') as GroupActivity;
  const party = await partyOf(db, me);
  if (!party || party.size < 2) return { meeting: null, reason: 'sem-grupo' };
  const others = party.members.filter((m) => m !== me);
  const want = typeof body.with === 'string' && others.includes(body.with) ? body.with : others[Math.floor(Date.now() / 60000) % others.length];
  const since = new Date(Date.now() - SOCIAL.partyTalkEvery * 1000).toISOString();
  const list = party.members.join(',');
  const { data: recent } = await db.from('companion_meetings').select('id,a,b,lines,created_at').in('a', party.members).in('b', party.members).order('created_at', { ascending: false }).limit(6);
  const last = (recent ?? [])[0];
  if (last && (last.created_at as string) > since) return { meeting: Date.now() - Date.parse(last.created_at as string) < 120_000 ? await meetingView(db, last, me) : null, reason: 'recente' };
  void list;
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: n1 }, { count: n2 }] = await Promise.all([
    db.from('companion_meetings').select('id', { count: 'exact', head: true }).eq('a', me).gte('created_at', dayAgo),
    db.from('companion_meetings').select('id', { count: 'exact', head: true }).eq('b', me).gte('created_at', dayAgo),
  ]);
  if ((n1 ?? 0) + (n2 ?? 0) >= SOCIAL.dailyMeetings) return { meeting: null, reason: 'limite-do-dia' };
  const [a, b] = pairKey(me, want);
  const [ra, rb] = await Promise.all([companionRow(db, a), companionRow(db, b)]);
  const da = (ra.discoveries ?? {}) as Discoveries, dbb = (rb.discoveries ?? {}) as Discoveries;
  const A: MeetSide = { id: a, name: da.name ?? 'Companion', discoveries: da, memories: [], about: [] }, B: MeetSide = { id: b, name: dbb.name ?? 'Companion', discoveries: dbb, memories: [], about: [] };
  const said = (recent ?? []).slice(0, 3).flatMap((m) => (m.lines as { name: string; text: string }[]).map((l) => `${l.name}: ${l.text}`));
  let lines = null as { who: 'a' | 'b'; text: string }[] | null, source = 'party:offline';
  try { const raw = await complete(buildPartyTalkPrompt(A, B, activity, said), [], 'Continue a conversa.', { maxTokens: 400, quality: true, timeoutMs: 12_000 }); if (raw) { lines = parsePartyTalk(raw); if (lines) source = 'party:' + providerName(); } } catch { lines = null; }
  lines ??= offlinePartyTalk(A, B, activity, a + b + Date.now());
  const speak = (who: 'a' | 'b', t: string) => ((who === 'a' ? da : dbb).pronoun === 'ele' ? masculinize(t) : t);
  const stored = lines.map((l) => ({ cid: l.who === 'a' ? a : b, name: l.who === 'a' ? A.name : B.name, text: speak(l.who, l.text) }));
  const { data: mt } = await db.from('companion_meetings').insert({ a, b, lines: stored, source }).select('id,a,b,lines,created_at').single();
  return { meeting: mt ? await meetingView(db, mt, me) : null };
}

async function meetingView(db: SupabaseClient, m: Record<string, unknown>, me: string) {
  const other = (m.a === me ? m.b : m.a) as string;
  const cs = await cards(db, [other]);
  return { id: m.id as number, at: m.created_at as string, with: cs.get(other) ?? null, lines: m.lines as { cid: string; name: string; text: string }[] };
}

/** Tudo o que o painel Social mostra. */
async function state(ctx: Ctx) {
  const { db, c } = ctx;
  const me = c.id as string;
  const [fa, fb, reqIn, reqOut, invIn, invOut, trades, meetA, meetB, party, bag, equip] = await Promise.all([
    db.from('companion_friends').select('b,since').eq('a', me),
    db.from('companion_friends').select('a,since').eq('b', me),
    db.from('companion_friend_requests').select('id,from_cid,created_at').eq('to_cid', me).eq('status', 'pending').order('created_at', { ascending: false }).limit(30),
    db.from('companion_friend_requests').select('id,to_cid,created_at').eq('from_cid', me).eq('status', 'pending').order('created_at', { ascending: false }).limit(30),
    db.from('companion_party_invites').select('id,from_cid,by,created_at').eq('to_cid', me).eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
    db.from('companion_party_invites').select('id,to_cid,by,created_at').eq('from_cid', me).eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
    db.from('trade_offers').select('*').or(`from_cid.eq.${me},to_cid.eq.${me}`).in('status', ['proposed', 'countered']).order('updated_at', { ascending: false }).limit(20),
    db.from('companion_meetings').select('id,a,b,lines,created_at').eq('a', me).order('created_at', { ascending: false }).limit(8),
    db.from('companion_meetings').select('id,a,b,lines,created_at').eq('b', me).order('created_at', { ascending: false }).limit(8),
    partyOf(db, me),
    db.from('ecos_bag').select('batch_key,qty').eq('companion_id', me).gt('qty', 0).order('qty', { ascending: false }),
    db.from('pacto_equipment').select('id,blueprint,kind,durability,max_durability').eq('owner', me).eq('status', 'ativo'),
  ]);
  const friendIds = [...(fa.data ?? []).map((r) => r.b as string), ...(fb.data ?? []).map((r) => r.a as string)];
  const meetings = [...(meetA.data ?? []), ...(meetB.data ?? [])].sort((x, y) => Date.parse(y.created_at as string) - Date.parse(x.created_at as string)).slice(0, 8);
  const known = [...new Set(meetings.map((m) => (m.a === me ? m.b : m.a) as string))];
  const ids = [...friendIds, ...known, ...(reqIn.data ?? []).map((r) => r.from_cid as string), ...(reqOut.data ?? []).map((r) => r.to_cid as string),
    ...(invIn.data ?? []).map((r) => r.from_cid as string), ...(invOut.data ?? []).map((r) => r.to_cid as string),
    ...(trades.data ?? []).flatMap((t) => [t.from_cid as string, t.to_cid as string]), ...(party?.members ?? [])];
  const cs = await cards(db, ids);
  const pick = (id: string) => cs.get(id) ?? { id, name: 'Companion', color: '#9fd8ff', pronoun: 'ela' as const, stage: '', form: null };
  const myName = ((c.discoveries ?? {}) as Discoveries).name ?? 'seu Companion', myPron = ((c.discoveries ?? {}) as Discoveries).pronoun;
  return {
    social: {
      me,
      friends: friendIds.map(pick),
      known: known.filter((id) => !friendIds.includes(id)).map(pick),
      friendRequests: (reqIn.data ?? []).map((r) => ({ id: r.id, from: pick(r.from_cid as string), at: r.created_at, text: friendRequestText(pick(r.from_cid as string).name, myName, myPron) })),
      friendRequestsSent: (reqOut.data ?? []).map((r) => ({ id: r.id, to: pick(r.to_cid as string), at: r.created_at })),
      party: party ? await (async () => {
        const [arts, rows] = await Promise.all([artUrls(db, party.members), db.from('companions').select('id,discoveries').in('id', party.members)]);
        const traits = new Map((rows.data ?? []).map((r) => [r.id as string, ((r.discoveries ?? {}) as Discoveries).traits ?? []]));
        return { id: party.id, leader: party.leader, members: party.members.map((id) => ({ ...pick(id), art: arts.get(id) ?? null, traits: traits.get(id) ?? [] })) };
      })() : null,
      partyInvites: (invIn.data ?? []).map((r) => ({ id: r.id, from: pick(r.from_cid as string), by: r.by, at: r.created_at })),
      partyInvitesSent: (invOut.data ?? []).map((r) => ({ id: r.id, to: pick(r.to_cid as string), by: r.by, at: r.created_at })),
      trades: (trades.data ?? []).map((t) => ({ id: t.id, mine: t.from_cid === me, from: pick(t.from_cid as string), to: pick(t.to_cid as string), give: t.give, take: t.take, status: t.status, fromOk: t.from_ok, toOk: t.to_ok, at: t.updated_at })),
      meetings: await Promise.all(meetings.map((m) => meetingView(db, m, me))),
      inventory: { bag: (bag.data ?? []).map((r) => ({ key: r.batch_key as string, qty: r.qty as number })), equipment: (equip.data ?? []).map((e) => ({ id: e.id as string, blueprint: e.blueprint as string, kind: e.kind as string, durability: e.durability as number, max: e.max_durability as number })) },
      limits: { maxParty: SOCIAL.maxParty, maxTradeLines: SOCIAL.maxTradeLines },
    },
  };
}

async function knows(db: SupabaseClient, me: string, other: string) {
  return (await areFriends(db, me, other)) || (await meetingCount(db, me, other)) > 0;
}

export async function socialAction(action: string, body: Record<string, unknown>, ctx: Ctx) {
  const { db, c } = ctx;
  const me = c.id as string;
  const now = new Date().toISOString();
  switch (action) {
    case 'social.state': return state(ctx);
    case 'social.near': return near(ctx, body);
    case 'social.party.talk': return partyTalk(ctx, body);

    // amizade: só a pessoa responde (o Companion nunca aceita sozinho)
    case 'social.friend.respond': {
      const id = uuidOf(body.id, 'Pedido');
      const { data: r } = await db.from('companion_friend_requests').select('*').eq('id', id).maybeSingle();
      if (!r || r.to_cid !== me || r.status !== 'pending') throw new SocialError(404, 'Pedido não encontrado.');
      const accept = body.accept === true;
      await db.from('companion_friend_requests').update({ status: accept ? 'accepted' : 'declined', responded_at: now }).eq('id', id);
      if (accept) {
        const [a, b] = pairKey(r.from_cid as string, me);
        await db.from('companion_friends').upsert({ a, b });
        const cs = await cards(db, [r.from_cid as string, me]);
        const [ea, eb] = await Promise.all([ctx.event(me, 'social.friend', { with: r.from_cid }), ctx.event(r.from_cid as string, 'social.friend', { with: me })]);
        const n1 = cs.get(me)?.name ?? 'Companion', n2 = cs.get(r.from_cid as string)?.name ?? 'Companion';
        await db.from('companion_memories').insert([
          { companion_id: me, subject: 'companion', content: `${n1} e ${n2} viraram amigos.`, importance: 4, source_event_ids: [ea], origin: 'meet' },
          { companion_id: r.from_cid, subject: 'companion', content: `${n2} e ${n1} viraram amigos.`, importance: 4, source_event_ids: [eb], origin: 'meet' },
        ]);
      }
      return state(ctx);
    }

    // grupo
    case 'social.party.invite': {
      const to = uuidOf(body.to);
      if (to === me) throw new SocialError(400, 'Companion inválido.');
      if (!(await knows(db, me, to))) throw new SocialError(403, 'Só dá para chamar quem seu Companion já conhece.');
      const r = await inviteToParty(ctx, me, to, 'player');
      return { ...(await state(ctx)), invite: r };
    }
    case 'social.party.respond': {
      const id = uuidOf(body.id, 'Convite');
      const { data: inv } = await db.from('companion_party_invites').select('*').eq('id', id).maybeSingle();
      if (!inv || inv.to_cid !== me || inv.status !== 'pending') throw new SocialError(404, 'Convite não encontrado.');
      if (body.accept === true) {
        const r = await joinParty(db, inv.from_cid as string, me, inv.by as 'companion' | 'player', 'player');
        if (!r.ok) throw new SocialError(409, r.reason === 'grupo cheio' ? 'O grupo já está cheio.' : 'Seu Companion já está num grupo.');
        await db.from('companion_party_invites').update({ status: 'accepted', accepted_by: 'player', responded_at: now }).eq('id', id);
        await ctx.event(me, 'social.party.joined', { party: r.party, from: inv.from_cid, by: 'player' });
      } else await db.from('companion_party_invites').update({ status: 'declined', responded_at: now }).eq('id', id);
      return state(ctx);
    }
    case 'social.party.leave': {
      const p = await partyOf(db, me);
      if (p) {
        await db.from('companion_party_members').delete().eq('companion_id', me);
        const rest = p.members.filter((m) => m !== me);
        if (rest.length <= 1) await db.from('companion_parties').delete().eq('id', p.id);
        else if (p.leader === me) await db.from('companion_parties').update({ leader: rest[0] }).eq('id', p.id);
        await ctx.event(me, 'social.party.left', { party: p.id });
      }
      return state(ctx);
    }

    // o líder tira alguém do grupo
    case 'social.party.kick': {
      const target = uuidOf(body.id);
      const p = await partyOf(db, me);
      if (!p || p.leader !== me) throw new SocialError(403, 'Só o líder do grupo pode tirar alguém.');
      if (target === me || !p.members.includes(target)) throw new SocialError(400, 'Esse Companion não está no seu grupo.');
      await db.from('companion_party_members').delete().eq('companion_id', target).eq('party_id', p.id);
      if (p.members.length - 1 <= 1) await db.from('companion_parties').delete().eq('id', p.id);
      await ctx.event(target, 'social.party.left', { party: p.id, kickedBy: me });
      return state(ctx);
    }

    // troca (só pessoas)
    case 'social.trade.propose': {
      const to = uuidOf(body.to);
      if (to === me) throw new SocialError(400, 'Companion inválido.');
      if (!(await knows(db, me, to))) throw new SocialError(403, 'Só dá para trocar com quem seu Companion já conhece.');
      const give = parseTradeItems(body.give);
      if (!give || !give.length) throw new SocialError(400, 'Escolha o que oferecer.');
      const { count } = await db.from('trade_offers').select('id', { count: 'exact', head: true }).eq('from_cid', me).in('status', ['proposed', 'countered']);
      if ((count ?? 0) >= 5) throw new SocialError(429, 'Você já tem 5 trocas abertas.');
      await db.from('trade_offers').insert({ from_cid: me, to_cid: to, give });
      return state(ctx);
    }
    case 'social.trade.counter': case 'social.trade.confirm': case 'social.trade.decline': case 'social.trade.cancel': {
      const id = uuidOf(body.id, 'Troca');
      const { data: t } = await db.from('trade_offers').select('*').eq('id', id).maybeSingle();
      if (!t || (t.from_cid !== me && t.to_cid !== me)) throw new SocialError(404, 'Troca não encontrada.');
      const side = t.from_cid === me ? 'from' : 'to';
      const act = action.slice('social.trade.'.length) as 'counter' | 'confirm' | 'decline' | 'cancel';
      const next = tradeStep({ status: t.status as TradeStatus, fromOk: !!t.from_ok, toOk: !!t.to_ok }, side, act);
      if (!next) throw new SocialError(409, 'Esta troca não aceita isso agora.');
      const patch: Record<string, unknown> = { status: next.status === 'done' ? 'countered' : next.status, from_ok: next.fromOk, to_ok: next.toOk, updated_at: now };
      if (act === 'counter') {
        const take = parseTradeItems(body.take);
        if (!take) throw new SocialError(400, 'Itens inválidos.');
        patch.take = take;
      }
      await db.from('trade_offers').update(patch).eq('id', id);
      if (next.execute) {
        const { data, error } = await db.rpc('trade_execute', { p_id: id, p_cap: ctx.bagCap });
        const r = (data ?? {}) as { ok?: boolean; reason?: string };
        if (error || !r.ok) {
          await db.from('trade_offers').update({ from_ok: false, to_ok: false, updated_at: now }).eq('id', id);
          const why: Record<string, string> = { 'faltam-itens-de-quem-ofereceu': 'Faltam itens de quem ofereceu.', 'faltam-itens-de-quem-respondeu': 'Faltam itens de quem respondeu.', 'mochila-cheia-de-quem-respondeu': 'A mochila de quem respondeu está cheia.', 'mochila-cheia-de-quem-ofereceu': 'A sua mochila está cheia.', 'peca-indisponivel': 'Uma das peças não está mais disponível.' };
          throw new SocialError(409, why[r.reason ?? ''] ?? 'A troca não pôde ser feita.');
        }
        await Promise.all([ctx.event(t.from_cid as string, 'social.trade', { id, with: t.to_cid }), ctx.event(t.to_cid as string, 'social.trade', { id, with: t.from_cid })]);
      }
      return { ...(await state(ctx)), traded: next.execute };
    }
  }
  throw new SocialError(404, 'Ação desconhecida.');
}
