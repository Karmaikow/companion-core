/**
 * MMO social no cliente (docs/MMO_SOCIAL.md):
 * - encontros: quando outro Companion fica perto (presença) por alguns segundos, avisa o servidor (`social.near`);
 *   quando os dois lados avisaram, o servidor gera a conversinha e as memórias, e as falas aparecem nos balões dos
 *   dois, uma de cada vez;
 * - painel: amigos, pedidos de amizade (a pessoa aceita ou recusa), grupo, convites e trocas (`social.state`,
 *   revisto a cada 20 s), com avisos quando chega algo novo.
 */
import { pollWhenVisible } from './pollWhenVisible';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useGame } from '../store';
import { remotePoses, usePresence, pokeOthers, onPoke } from './presence';
import { companionFocus, socialHold } from '../scene/world';
import { SOCIAL, groupActivity, type GroupActivity } from '@rules';

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
function sayRemote(cid: string, text: string, ms?: number) {
  const id = ++speechSeq;
  useRemoteSpeech.setState({ [cid]: { text, id } });
  window.setTimeout(() => { if (useRemoteSpeech.getState()[cid]?.id === id) useRemoteSpeech.setState((s) => { const n = { ...s }; delete n[cid]; return n; }); }, ms ?? Math.max(3200, text.length * 70));
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __social: unknown }).__social = { useRemoteSpeech, remotePoses, usePresence, useSocial: null as unknown };

export const useSocial = create<{ data: SocialState | null; busy: boolean; error: string | null; available: boolean; /** o que o grupo está fazendo agora (mesmo valor em todas as telas) */ group: { activity: GroupActivity; role: 'leader' | 'member' } | null }>(() => ({ data: null, busy: false, error: null, available: false, group: null }));

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

/** Mostra a conversa do encontro nos balões, uma fala de cada vez. */
function playMeeting(m: MeetingView, me: string) {
  if (seen.meetings.has(m.id)) return;
  seen.meetings.add(m.id);
  const g = useGame.getState();
  // As duas telas seguem o MESMO relógio: a fala i sai em (hora do encontro no servidor + 2 s + i × 3,4 s). Antes cada
  // jogo começava quando recebia o encontro (o segundo recebe alguns segundos depois) e cada tela mostrava outra fala.
  const step = 3400, now = Date.now();
  let t0 = Date.parse(m.at) + 2000;
  // relógio do aparelho muito diferente do servidor (tudo "já passou"): toca do começo agora
  if (!Number.isFinite(t0) || t0 + m.lines.length * step < now - 90_000) t0 = now + 600;
  const at = (i: number) => t0 + i * step - now;
  const other = m.with ? remotePoses.get(m.with.id) : undefined;
  const end = at(m.lines.length);
  if (other && Number.isFinite(other.x) && end > 0) Object.assign(socialHold, { until: performance.now() + end + 1200, x: other.x, z: other.z });
  m.lines.forEach((l, i) => {
    const wait = at(i);
    if (wait < -step) return; // essa fala já passou
    // cada fala fica só o tempo dela (a próxima já é do outro): assim nunca aparecem duas ao mesmo tempo
    window.setTimeout(() => { if (l.cid === me) useGame.getState().sayBark(l.text, step - 200); else sayRemote(l.cid, l.text, step - 200); }, Math.max(0, wait));
  });
  if (m.with) g.toast(`${m.lines.find((l) => l.cid === me)?.name ?? 'Seu Companion'} conversou com ${m.with.name} ✨`, 'soft');
}

/**
 * Laço social: estado a cada 60 s com a aba à vista (online, depois do despertar; antes era a cada 12 s, o que gastava a cota da função) e, no mundo, os encontros com quem está perto.
 */
export function useSocialLoop(opts: { on: boolean; inWorld: boolean; me: string | null }) {
  const { on, inWorld, me } = opts;
  useEffect(() => {
    useSocial.setState({ available: on });
    if (!on) return;
    void socialCall('social.state');
    let pending = 0;
    const refresh = () => { window.clearTimeout(pending); pending = window.setTimeout(() => void socialCall('social.state'), 300); };
    // novidades chegam pelo canal em tempo real (onPoke); o relógio é só uma rede de segurança
    const stop = pollWhenVisible(() => void socialCall('social.state'), 60_000);
    const offPoke = onPoke(refresh);
    window.addEventListener('focus', refresh);
    return () => { stop(); offPoke(); window.removeEventListener('focus', refresh); window.clearTimeout(pending); };
  }, [on]);
  useEffect(() => {
    if (!on || !inWorld || !me) return;
    const since = new Map<string, number>(), lastPing = new Map<string, number>();
    let inflight = false;
    const t = window.setInterval(async () => {
      const now = performance.now();
      groupTick(me, now);
      let target: string | null = null;
      remotePoses.forEach((p, id) => {
        const d = Number.isFinite(p.x) ? Math.hypot(p.x - companionFocus.x, p.z - companionFocus.z) : Infinity;
        if (d <= SOCIAL.nearMeters && !p.down) {
          if (!since.has(id)) since.set(id, now);
          // notou o outro: para e olha para ele enquanto o encontro acontece (cada aviso segura mais um pouco)
          if (now - (lastPing.get(id) ?? -1e9) > 0 && socialHold.until < now + 2500) Object.assign(socialHold, { until: now + 3000, x: p.x, z: p.z });
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
        // depois de um encontro (ou sem encontro possível agora), não insiste com este Companion por um tempo
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
    return () => { window.clearInterval(t); socialHold.follow = null; socialHold.until = 0; socialHold.group = null; useSocial.setState({ group: null }); };
  }, [on, inWorld, me]);
}

/**
 * Grupo no piloto automático (até a pessoa mexer): a atividade sai do id do grupo e do relógio, então é a mesma em
 * todas as telas. Caçar: todos caçam perto do líder. Explorar: o líder explora e os outros vão junto. Conversar: ficam
 * juntos, de frente, e o líder pede ao servidor uma conversa nova a cada ~70 s (as outras telas recebem pelo aviso).
 */
let lastTalk = 0, talking = false;
function groupTick(me: string, now: number) {
  const party = useSocial.getState().data?.party;
  if (!party || party.members.length < 2) {
    socialHold.follow = null; socialHold.group = null;
    if (useSocial.getState().group) useSocial.setState({ group: null });
    return;
  }
  const role: 'leader' | 'member' = party.leader === me ? 'leader' : 'member';
  const activity = groupActivity(party.id, Date.now(), party.members.map((m) => m.traits ?? []));
  const g = useSocial.getState().group;
  if (!g || g.activity !== activity || g.role !== role) useSocial.setState({ group: { activity, role } });
  const paused = now < socialHold.pausedUntil;
  socialHold.group = paused ? null : { role, activity };
  if (paused) { socialHold.follow = null; return; }
  // quem não é líder segue o líder; o líder conversando fica de frente para o membro mais perto
  const lp = role === 'member' ? remotePoses.get(party.leader) : undefined;
  socialHold.follow = lp && Number.isFinite(lp.x) && !lp.down ? { x: lp.x, z: lp.z, t: now } : null;
  if (activity === 'conversar') {
    let near: { x: number; z: number; d: number } | null = null;
    for (const m of party.members) { if (m.id === me) continue; const p = remotePoses.get(m.id); if (!p || !Number.isFinite(p.x)) continue; const d = Math.hypot(p.x - companionFocus.x, p.z - companionFocus.z); if (!near || d < near.d) near = { x: p.x, z: p.z, d }; }
    if (near && near.d < 4.5) Object.assign(socialHold, { until: Math.max(socialHold.until, now + 1500), x: near.x, z: near.z });
  }
  // o líder puxa a conversa do grupo (mais vezes quando a atividade é conversar)
  const every = (activity === 'conversar' ? SOCIAL.partyTalkEvery : SOCIAL.partyTalkEvery * 2.5) * 1000;
  if (role === 'leader' && !talking && now - lastTalk > every) {
    const together = party.members.some((m) => { if (m.id === me) return false; const p = remotePoses.get(m.id); return !!p && Number.isFinite(p.x) && Math.hypot(p.x - companionFocus.x, p.z - companionFocus.z) < 12; });
    if (!together) return;
    lastTalk = now; talking = true;
    const b = useGame.getState().backend;
    void (b?.social ? b.social('social.party.talk', { activity }) : Promise.resolve(null)).then((r) => {
      const m = r?.meeting as MeetingView | null | undefined;
      if (m) { playMeeting(m, me); pokeOthers(party.members.map((x) => x.id).filter((x) => x !== me)); }
    }).catch(() => {}).finally(() => { talking = false; });
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __social: Record<string, unknown> }).__social.useSocial = useSocial;
