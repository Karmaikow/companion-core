/**
 * MMO social no cliente (docs/MMO_SOCIAL.md):
 * - encontros: quando outro Companion fica perto (presença) por alguns segundos, avisa o servidor (`social.near`);
 *   quando os dois lados avisaram, o servidor gera a conversinha e as memórias, e as falas aparecem nos balões dos
 *   dois, uma de cada vez;
 * - painel: amigos, pedidos de amizade (a pessoa aceita ou recusa), grupo, convites e trocas (`social.state`,
 *   revisto a cada 20 s), com avisos quando chega algo novo.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { useGame } from '../store';
import { remotePoses, usePresence } from './presence';
import { companionFocus, socialHold } from '../scene/world';
import { SOCIAL } from '@rules';

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
  party: { id: string; leader: string; members: SocialCard[] } | null;
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

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __social: unknown }).__social = { useRemoteSpeech, remotePoses, usePresence };

export const useSocial = create<{ data: SocialState | null; busy: boolean; error: string | null; available: boolean }>(() => ({ data: null, busy: false, error: null, available: false }));

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
  data.meetings.forEach((m) => seen.meetings.add(m.id));
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
 * Laço social: estado a cada 20 s (online, depois do despertar) e, no mundo, os encontros com quem está perto.
 */
export function useSocialLoop(opts: { on: boolean; inWorld: boolean; me: string | null }) {
  const { on, inWorld, me } = opts;
  useEffect(() => {
    useSocial.setState({ available: on });
    if (!on) return;
    void socialCall('social.state');
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void socialCall('social.state'); }, 20_000);
    return () => window.clearInterval(t);
  }, [on]);
  useEffect(() => {
    if (!on || !inWorld || !me) return;
    const since = new Map<string, number>(), lastPing = new Map<string, number>();
    let inflight = false;
    const t = window.setInterval(async () => {
      const now = performance.now();
      // grupo: quem não é o líder vai junto com ele (caçar e coletar perto dele)
      const party = useSocial.getState().data?.party;
      const lp = party && party.leader !== me ? remotePoses.get(party.leader) : undefined;
      socialHold.follow = lp && Number.isFinite(lp.x) && !lp.down ? { x: lp.x, z: lp.z, t: now } : null;
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
          void socialCall('social.state');
        }
      } catch { /* sem encontro agora */ } finally { inflight = false; }
    }, 1000);
    return () => { window.clearInterval(t); socialHold.follow = null; socialHold.until = 0; };
  }, [on, inWorld, me]);
}
