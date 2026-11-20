/**
 * MMO social no cliente (docs/MMO_SOCIAL.md):
 * - encontros: quando outro Companion fica perto (presença) por alguns segundos, avisa o servidor (`social.near`);
 *   quando os dois lados avisaram, o servidor gera a conversinha e as memórias, e as falas aparecem nos balões dos
 *   dois, uma de cada vez;
 * - grupo: se já estão no mesmo grupo, conversam como equipe e decidem juntos o que fazer (caçar, coletar, completar
 *   missão, explorar), ou seguem a decisão do líder ("Vamos caçar!", "Vamos coletar!", etc.);
 * - painel: amigos, pedidos de amizade (a pessoa aceita ou recusa), grupo, convites e trocas (`social.state`).
 */
import { pollWhenVisible } from './pollWhenVisible';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useGame } from '../store';
import { useEcos } from '../ecos/ecosStore';
import { remotePoses, usePresence, pokeOthers, onPoke, sendExtra, onExtra } from './presence';
import { companionFocus, socialHold } from '../scene/world';
import { SOCIAL, GROUP_ACTIVITY, DEFAULT_INTENT, groupActivity, type GroupActivity } from '@rules';

export interface SocialCard { id: string; name: string; color: string; pronoun: 'ela' | 'ele'; stage: string; form: string | null }
export interface MeetingView { id: number; at: string; with: SocialCard | null; lines: { cid: string; name: string; text: string }[] }
export interface TradeItemView { kind: 'material'; key: string; qty: number }
export interface TradeEquipView { kind: 'equipment'; id: string }
export interface TradeView { id: string; mine: boolean; from: SocialCard; to: SocialCard; give: (TradeItemView | TradeEquipView)[]; take: (TradeItemView | TradeEquipView)[]; status: 'proposed' | 'countered'; fromOk: boolean; toOk: boolean; at: string }
export interface SocialState {
  me: string;
  friends: SocialCard[];
  known: SocialCard[];
  friendRequests: { id: string; from: SocialCard; at: string; text: string }[];
  friendRequestsSent: { id: string; to: SocialCard; at: string }[];
  party: { id: string; leader: string; members: (SocialCard & { art?: string | null; traits?: string[] })[] } | null;
  partyInvites: { id: string; from: SocialCard; by: 'companion' | 'player'; at: string }[];
  partyInvitesSent: { id: string; to: SocialCard; by: 'companion' | 'player'; at: string }[];
  trades: TradeView[];
  meetings: MeetingView[];
  inventory: { bag: { key: string; qty: number }[]; equipment: { id: string; blueprint: string; kind: string; durability: number; max: number }[] };
  limits: { maxParty: number; maxTradeLines: number };
}

/** Fala de um Companion de outro jogador (balão sobre ele na cena). */
export const useRemoteSpeech = create<Record<string, { text: string; id: number }>>(() => ({}));
let speechSeq = 0;
export function sayRemote(cid: string, text: string, ms?: number) {
  const id = ++speechSeq;
  useRemoteSpeech.setState({ [cid]: { text, id } });
  window.setTimeout(() => { if (useRemoteSpeech.getState()[cid]?.id === id) useRemoteSpeech.setState((s) => { const n = { ...s }; delete n[cid]; return n; }); }, ms ?? Math.max(3200, text.length * 70));
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __social: unknown }).__social = { useRemoteSpeech, remotePoses, usePresence, useSocial: null as unknown };

export const useSocial = create<{
  data: SocialState | null;
  busy: boolean;
  error: string | null;
  available: boolean;
  /** o que o grupo está fazendo agora (mesmo valor em todas as telas; `custom` = decidido pelo líder) */
  group: { activity: GroupActivity; role: 'leader' | 'member'; custom?: boolean } | null;
}>(() => ({ data: null, busy: false, error: null, available: false, group: null }));

/** Escolha manual do líder do grupo (vale até o líder voltar para o automático ou o grupo mudar). */
let leaderOverride: { partyId: string; activity: GroupActivity; until: number } | null = null;

const MEMBER_REPLIES: Record<GroupActivity, string[]> = {
  cacar: ['Vamos caçar! Estou logo atrás de você!', 'Bora! Eu ajudo a derrubar!', 'Combinado, foco na caçada! ✨'],
  coletar: ['Vamos coletar! Eu ajudo a juntar tudo!', 'Boa! Vamos encher a mochila!', 'Bora coletar juntos! ✨'],
  missao: ['Vamos completar a missão! Estou com você!', 'Bora! Juntos a gente termina rapidinho!', 'Deixa comigo, foco na missão! ✨'],
  explorar: ['Vamos explorar! Eu sigo você!', 'Bora ver o que tem mais adiante!', 'Indo junto com você! ✨'],
  conversar: ['Claro! Vamos conversar um pouco.', 'Estou aqui do seu lado!', 'Vamos decidir o próximo passo! ✨'],
};

/**
 * Define o que o grupo vai fazer (chamado pelo líder no painel Social, no chat ou após conversa dos Companions).
 * Transmite na hora para todos os membros no mapa e aciona as falas de chamada e resposta.
 */
export function setGroupDecision(activity: GroupActivity | null, opts: { announce?: boolean } = {}) {
  const party = useSocial.getState().data?.party;
  const me = useSocial.getState().data?.me;
  if (!party || !me) return;
  const role: 'leader' | 'member' = party.leader === me ? 'leader' : 'member';
  if (!activity) {
    leaderOverride = null;
    sendExtra('party', { partyId: party.id, activity: null, from: me });
    const autoAct = groupActivity(party.id, Date.now(), party.members.map((m) => m.traits ?? []));
    useSocial.setState({ group: { activity: autoAct, role, custom: false } });
    return;
  }
  leaderOverride = { partyId: party.id, activity, until: Date.now() + 30 * 60_000 };
  socialHold.pausedUntil = 0;
  useSocial.setState({ group: { activity, role, custom: true } });
  applyGroupActivityBehavior(activity);
  if (opts.announce !== false) {
    const call = GROUP_ACTIVITY[activity].call;
    useGame.getState().sayBark(call, 3600);
    sendExtra('party', { partyId: party.id, activity, call, from: me });
  }
}

function applyGroupActivityBehavior(activity: GroupActivity) {
  const eco = useEcos.getState();
  const g = useGame.getState();
  if (activity === 'coletar') {
    if (g.backend?.ecos && g.snap?.companion?.stage === 'awakened' && !eco.auto.on) {
      eco.startIntent({ ...DEFAULT_INTENT, mode: 'explorar', target: null });
    }
  } else if (activity === 'cacar' || activity === 'conversar') {
    if (eco.auto.on) eco.stopIntent();
  }
}

const seen = { requests: new Set<string>(), invites: new Set<string>(), trades: new Set<string>(), meetings: new Set<number>(), first: true };

function absorb(data: SocialState) {
  const g = useGame.getState();
  if (!seen.first) {
    for (const r of data.friendRequests) if (!seen.requests.has(r.id)) g.toast(`💌 ${r.text} (Amigos e grupo)`, 'gold');
    for (const i of data.partyInvites) if (!seen.invites.has(i.id)) g.toast(`${i.from.name} chamou seu Companion para um grupo. (Amigos e grupo)`, 'soft');
    for (const t of data.trades) if (!t.mine && !seen.trades.has(t.id)) g.toast(`A pessoa de ${t.from.name} quer trocar itens. (Amigos e grupo)`, 'soft');
  }
  data.friendRequests.forEach((r) => seen.requests.add(r.id));
  data.partyInvites.forEach((i) => seen.invites.add(i.id));
  data.trades.forEach((t) => seen.trades.add(t.id));
  // encontros/conversas novas que chegaram pelo estado (feitas pelo outro jogo): tocam se ainda estão acontecendo
  for (const m of data.meetings) if (!seen.meetings.has(m.id)) { if (!seen.first && Date.now() - Date.parse(m.at) < 60_000) playMeeting(m, data.me); else seen.meetings.add(m.id); }
  seen.first = false;
  useSocial.setState({ data, error: null });
}

/** Chama uma ação social e atualiza o painel. */
export async function socialCall(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
  const b = useGame.getState().backend;
  if (!b?.social) return null;
  useSocial.setState({ busy: true });
  try {
    const r = await b.social(action, body);
    if (r.social) absorb(r.social as SocialState);
    // mudou algo social: avisa os outros jogos para atualizarem na hora (amizade, grupo, troca)
    if (action !== 'social.state') pokeOthers('*');
    return r;
  } catch (e) {
    const msg = (e as Error).message;
    useSocial.setState({ error: msg });
    useGame.getState().toast(msg, 'warn');
    return null;
  } finally { useSocial.setState({ busy: false }); }
}

/** Detecta se uma conversa de encontro/grupo decidiu uma atividade ("vamos caçar", "vamos coletar", "missão"). */
function inferActivityFromLines(lines: { text: string }[]): GroupActivity | null {
  const last = lines.slice(-2).map((l) => l.text.toLowerCase()).join(' ');
  if (/ca[cç]ar|bruma|monstro|acalmar|lutar/.test(last)) return 'cacar';
  if (/coletar|colher|recurso|erva|madeira|min[eé]rio|flor/.test(last)) return 'coletar';
  if (/miss[aã]o|miss[oõ]es|quest/.test(last)) return 'missao';
  if (/explorar|regi[aã]o|caminho|pedra-guia/.test(last)) return 'explorar';
  return null;
}

/** Mostra a conversa do encontro nos balões, uma fala de cada vez. */
function playMeeting(m: MeetingView, me: string) {
  if (seen.meetings.has(m.id)) return;
  seen.meetings.add(m.id);
  const g = useGame.getState();
  const step = 3400, now = Date.now();
  let t0 = Date.parse(m.at) + 2000;
  if (!Number.isFinite(t0) || t0 + m.lines.length * step < now - 90_000) t0 = now + 600;
  const at = (i: number) => t0 + i * step - now;
  const other = m.with ? remotePoses.get(m.with.id) : undefined;
  const end = at(m.lines.length);
  if (other && Number.isFinite(other.x) && end > 0) Object.assign(socialHold, { until: performance.now() + end + 1200, x: other.x, z: other.z });
  m.lines.forEach((l, i) => {
    const wait = at(i);
    if (wait < -step) return;
    window.setTimeout(() => { if (l.cid === me) useGame.getState().sayBark(l.text, step - 200); else sayRemote(l.cid, l.text, step - 200); }, Math.max(0, wait));
  });
  // se estão em grupo e combinaram uma atividade na conversa (e o líder não fixou outra manualmente), aplica a decisão!
  const party = useSocial.getState().data?.party;
  if (party && (!leaderOverride || leaderOverride.partyId !== party.id) && end > 0) {
    const decided = inferActivityFromLines(m.lines);
    if (decided) {
      window.setTimeout(() => {
        const curParty = useSocial.getState().data?.party;
        if (!curParty || (leaderOverride && leaderOverride.partyId === curParty.id)) return;
        leaderOverride = { partyId: curParty.id, activity: decided, until: Date.now() + 5 * 60_000 };
        const role: 'leader' | 'member' = curParty.leader === me ? 'leader' : 'member';
        useSocial.setState({ group: { activity: decided, role, custom: false } });
        applyGroupActivityBehavior(decided);
      }, Math.max(0, end));
    }
  }
  if (m.with) g.toast(`${m.lines.find((l) => l.cid === me)?.name ?? 'Seu Companion'} conversou com ${m.with.name} ✨`, 'soft');
}

/**
 * Laço social: estado a cada 60 s com a aba à vista (online, depois do despertar) e, no mundo, os encontros com quem está perto.
 */
export function useSocialLoop(opts: { on: boolean; inWorld: boolean; me: string | null }) {
  const { on, inWorld, me } = opts;
  useEffect(() => {
    useSocial.setState({ available: on });
    if (!on) return;
    void socialCall('social.state');
    let pending = 0;
    const refresh = () => { window.clearTimeout(pending); pending = window.setTimeout(() => void socialCall('social.state'), 300); };
    const stop = pollWhenVisible(() => void socialCall('social.state'), 60_000);
    const offPoke = onPoke(refresh);
    window.addEventListener('focus', refresh);
    return () => { stop(); offPoke(); window.removeEventListener('focus', refresh); window.clearTimeout(pending); };
  }, [on]);
  useEffect(() => {
    if (!on || !inWorld || !me) return;
    // escuta decisões do líder do grupo em tempo real pelo canal do mapa
    const offParty = onExtra('party', (raw, from) => {
      const d = (raw ?? {}) as { partyId?: string; activity?: GroupActivity | null; call?: string };
      const party = useSocial.getState().data?.party;
      if (!party || d.partyId !== party.id || from !== party.leader) return;
      const role: 'leader' | 'member' = party.leader === me ? 'leader' : 'member';
      if (!d.activity || !(d.activity in GROUP_ACTIVITY)) {
        leaderOverride = null;
        const autoAct = groupActivity(party.id, Date.now(), party.members.map((m) => m.traits ?? []));
        useSocial.setState({ group: { activity: autoAct, role, custom: false } });
        return;
      }
      leaderOverride = { partyId: party.id, activity: d.activity, until: Date.now() + 30 * 60_000 };
      socialHold.pausedUntil = 0;
      useSocial.setState({ group: { activity: d.activity, role, custom: true } });
      applyGroupActivityBehavior(d.activity);
      if (d.call) sayRemote(from, d.call, 3400);
      const replies = MEMBER_REPLIES[d.activity] ?? MEMBER_REPLIES.explorar;
      const reply = replies[Math.floor(Math.random() * replies.length)];
      window.setTimeout(() => {
        useGame.getState().sayBark(reply, 3200);
        sendExtra('party-reply', { partyId: party.id, text: reply, from: me });
      }, 1400);
      useGame.getState().toast(`Líder do grupo: "${GROUP_ACTIVITY[d.activity].call}"`, 'gold');
    });
    const offReply = onExtra('party-reply', (raw, from) => {
      const d = (raw ?? {}) as { partyId?: string; text?: string };
      const party = useSocial.getState().data?.party;
      if (!party || d.partyId !== party.id || typeof d.text !== 'string') return;
      sayRemote(from, d.text, 3200);
    });

    const since = new Map<string, number>(), lastPing = new Map<string, number>();
    let inflight = false;
    const t = window.setInterval(async () => {
      const now = performance.now();
      groupTick(me, now);
      const party = useSocial.getState().data?.party;
      let target: string | null = null;
      remotePoses.forEach((p, id) => {
        // se já estão no mesmo grupo, quem coordena a conversa e a ação é o groupTick (não trava os dois como estranhos!)
        if (party?.members.some((m) => m.id === id)) { since.delete(id); return; }
        const d = Number.isFinite(p.x) ? Math.hypot(p.x - companionFocus.x, p.z - companionFocus.z) : Infinity;
        if (d <= SOCIAL.nearMeters && !p.down) {
          if (!since.has(id)) since.set(id, now);
          // só para e olha para o outro quando já está prestes a conversar e não está em cooldown
          const waitLeft = (lastPing.get(id) ?? -1e9) - now;
          if (waitLeft <= 0 && now - since.get(id)! >= (SOCIAL.nearSeconds - 1.5) * 1000 && socialHold.until < now + 2500) {
            Object.assign(socialHold, { until: now + 3000, x: p.x, z: p.z });
          }
        }
        else since.delete(id);
        const s = since.get(id);
        if (s !== undefined && now - s >= SOCIAL.nearSeconds * 1000 && now - (lastPing.get(id) ?? -1e9) > 6000 && !target) target = id;
      });
      if (!target || inflight) return;
      inflight = true; lastPing.set(target, now);
      try {
        const b = useGame.getState().backend;
        const r = b?.social ? await b.social('social.near', { other: target }) : null;
        const m = r?.meeting as MeetingView | null | undefined;
        if (m || ['recente', 'limite-do-dia', 'forma-de-luz'].includes(String(r?.reason))) lastPing.set(target, now + 9 * 60_000);
        if (m) {
          playMeeting(m, me);
          const fr = r?.friendRequest as { from: string; to: string } | undefined;
          if (fr?.from === me && m.with) useGame.getState().toast(`Seu Companion pediu ${m.with.name} em amizade 💌`, 'gold');
          const pt = r?.party as { from: string; to: string; status: string } | undefined;
          if (pt && m.with) useGame.getState().toast(pt.status === 'joined' ? (pt.from === me ? `${m.with.name} entrou no grupo do seu Companion!` : `Seu Companion entrou no grupo de ${m.with.name}!`) : pt.from === me ? `Seu Companion chamou ${m.with.name} para um grupo.` : `${m.with.name} chamou seu Companion para um grupo.`, 'soft');
          pokeOthers([target]);
          void socialCall('social.state');
        }
      } catch { /* sem encontro agora */ } finally { inflight = false; }
    }, 1000);
    return () => { offParty(); offReply(); window.clearInterval(t); socialHold.follow = null; socialHold.until = 0; socialHold.group = null; useSocial.setState({ group: null }); };
  }, [on, inWorld, me]);
}

/**
 * Grupo em ação: segue o que o líder decidiu (ou o que os Companions decidiram conversando).
 * - Caçar: todos caçam perto do líder.
 * - Coletar: o líder e os membros coletam recursos próximos e seguem juntos.
 * - Completar missão: caçam e coletam o que serve às missões acompanhando o líder.
 * - Explorar: o líder explora o mapa e os membros acompanham.
 * - Conversar: ficam perto e conversam para decidir o próximo passo.
 */
let lastTalk = 0, talking = false, metTogether = false;
function groupTick(me: string, now: number) {
  const party = useSocial.getState().data?.party;
  if (!party || party.members.length < 2) {
    socialHold.follow = null; socialHold.group = null; metTogether = false;
    if (useSocial.getState().group) useSocial.setState({ group: null });
    return;
  }
  const role: 'leader' | 'member' = party.leader === me ? 'leader' : 'member';
  const hasOverride = leaderOverride && leaderOverride.partyId === party.id && Date.now() < leaderOverride.until;
  const activity = hasOverride ? leaderOverride!.activity : groupActivity(party.id, Date.now(), party.members.map((m) => m.traits ?? []));
  const g = useSocial.getState().group;
  if (!g || g.activity !== activity || g.role !== role || !!g.custom !== !!hasOverride) {
    useSocial.setState({ group: { activity, role, custom: !!hasOverride } });
    applyGroupActivityBehavior(activity);
  }
  const paused = now < socialHold.pausedUntil;
  socialHold.group = paused ? null : { role, activity };
  if (paused) { socialHold.follow = null; return; }
  // se a atividade do grupo é coletar e a Companion ficou livre, retoma a coleta perto do grupo
  if (activity === 'coletar' && !useEcos.getState().auto.on && !useEcos.getState().run) {
    applyGroupActivityBehavior('coletar');
  }
  // quem não é líder segue o líder; o líder conversando fica de frente para o membro mais perto
  const lp = role === 'member' ? remotePoses.get(party.leader) : undefined;
  socialHold.follow = lp && Number.isFinite(lp.x) && !lp.down ? { x: lp.x, z: lp.z, t: now } : null;
  let near: { x: number; z: number; d: number } | null = null;
  for (const m of party.members) {
    if (m.id === me) continue;
    const p = remotePoses.get(m.id);
    if (!p || !Number.isFinite(p.x)) continue;
    const d = Math.hypot(p.x - companionFocus.x, p.z - companionFocus.z);
    if (!near || d < near.d) near = { x: p.x, z: p.z, d };
  }
  if (activity === 'conversar' && near && near.d < 4.5) {
    Object.assign(socialHold, { until: Math.max(socialHold.until, now + 1500), x: near.x, z: near.z });
  }
  // assim que os membros do grupo se encontram de perto pela primeira vez na sessão, o líder puxa uma conversa rápida para combinarem o que fazer!
  const together = !!near && near.d < 10;
  const firstMeetUp = together && !metTogether;
  if (together) metTogether = true;
  const every = (activity === 'conversar' ? SOCIAL.partyTalkEvery : SOCIAL.partyTalkEvery * 2) * 1000;
  if (role === 'leader' && !talking && together && (firstMeetUp || now - lastTalk > every)) {
    lastTalk = now; talking = true;
    const b = useGame.getState().backend;
    void (b?.social ? b.social('social.party.talk', { activity }) : Promise.resolve(null)).then((r) => {
      const m = r?.meeting as MeetingView | null | undefined;
      if (m) { playMeeting(m, me); pokeOthers(party.members.map((x) => x.id).filter((x) => x !== me)); }
    }).catch(() => {}).finally(() => { talking = false; });
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __social: Record<string, unknown> }).__social.useSocial = useSocial;
