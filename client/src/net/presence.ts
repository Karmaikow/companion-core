/**
 * Presença no Companion World e em Áster (MMO, fase 1 — docs/MMO_SOCIAL.md): cada jogo manda a posição do próprio
 * Companion e o mapa em que está, e recebe a dos outros; quem está no mesmo mapa aparece na mesma tela. Só visual:
 * não colidem, não lutam juntos, nada vai para o banco.
 *
 * Transporte: canal de broadcast do Supabase Realtime (online). No dev, `?eco` usa um BroadcastChannel do navegador
 * (duas abas do mesmo site se veem), para testar sem servidor.
 *
 * Mensagens:
 * - `hello` (ficha): id, nome, cor, modelo — na entrada, a cada ~30 s e quando alguém novo aparece ou pede;
 * - `pose`: id, x, z, yaw, caído — ~4×/s (só quando mudou; parado, a cada 3 s, ou 5 s com a aba oculta);
 * - `bye`: ao sair do mundo.
 * Quem fica 8 s sem mandar nada some.
 */
import { create } from 'zustand';
import { supabase } from '../backend/online';
import type { CompanionModelFiles } from '../backend/types';
import { companionFocus, companionPose } from '../scene/world';
import { vitals } from '../scene/vitals';

export interface RemoteInfo { id: string; name: string; color: string; model: CompanionModelFiles | null; pronoun?: string; /** clipes escolhidos no Administrador para parado/andando/correndo ({ idle: "anim:<arquivo>|<clipe>" }) */ slots?: Record<string, string> }
export interface RemotePose { x: number; z: number; yaw: number; down: boolean; t: number; /** vida 0–1 (para o painel do grupo) */ hp?: number }
/** Mapa compartilhado onde cada um está (quem não diz — versão antiga do jogo — está no Companion World). */
export type PresenceMap = 'world' | 'arredores' | 'cidade';
const MAPS: PresenceMap[] = ['world', 'arredores', 'cidade'];
const mapOf = (v: unknown): PresenceMap => (MAPS.includes(v as PresenceMap) ? (v as PresenceMap) : 'world');
interface Hello { type: 'hello'; info: RemoteInfo; ask?: boolean; map?: PresenceMap }
interface Pose { type: 'pose'; id: string; x: number; z: number; yaw: number; down: boolean; hp?: number; map?: PresenceMap }
/** "mudou algo social com você": quem recebe atualiza o painel na hora (sem esperar a próxima consulta) */
interface Poke { type: 'poke'; from: string; to: string[] | '*' }
interface Bye { type: 'bye'; id: string }
/** "quem está aí?": todos respondem com a ficha (quem só observa, sem entrar no mundo) */
interface Ask { type: 'ask' }
type Msg = Hello | Pose | Bye | Poke | Ask;

interface Transport { send(m: Msg): void; close(): void }

/**
 * `others`: ficha de quem está no mesmo mapa (a lista muda só quando alguém entra ou sai: a cena re-renderiza pouco).
 * `all`: todo mundo conectado e em que mapa está (painel GOD).
 */
export const usePresence = create<{ others: RemoteInfo[]; all: { info: RemoteInfo; map: PresenceMap }[]; online: boolean }>(() => ({ others: [], all: [], online: false }));
type Tracked = RemotePose & { px: number; pz: number; pt: number };
/** Últimas posições de quem está no mesmo mapa (lidas a cada quadro pela cena, sem React). */
export const remotePoses = new Map<string, Tracked>();
/** Posições de quem está em outro mapa (só o painel GOD usa). */
export const farPoses = new Map<string, Tracked>();

const STALE_MS = 8000;
let current: { t: Transport; id: string } | null = null;
const pokeHandlers = new Set<() => void>();
/** Avisa os outros jogos (todos ou só alguns Companions) que algo social mudou para eles. */
export function pokeOthers(to: string[] | '*' = '*') { if (current) current.t.send({ type: 'poke', from: current.id, to }); }
export function onPoke(cb: () => void) { pokeHandlers.add(cb); return () => { pokeHandlers.delete(cb); }; }
const POSE_MS = 250;
/** Parado, a posição vai só como sinal de vida: bem abaixo dos 8 s em que quem se cala some. */
const IDLE_MS = 3000, IDLE_HIDDEN_MS = 5000;
/** A ficha completa (com os endereços do modelo) é a mensagem mais pesada; quem chega ou não conhece alguém já a pede na hora. */
const HELLO_MS = 30000;

function supabaseTransport(onMsg: (m: Msg) => void): Transport {
  const ch = supabase().channel('mundo', { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload as Msg));
  let ready = false;
  const queue: Msg[] = [];
  ch.subscribe((status) => {
    usePresence.setState({ online: status === 'SUBSCRIBED' });
    if (status === 'SUBSCRIBED') { ready = true; queue.splice(0).forEach((m) => void ch.send({ type: 'broadcast', event: 'm', payload: m })); }
  });
  return {
    send(m) { if (!ready) { if (m.type === 'hello' || m.type === 'ask') queue.push(m); return; } void ch.send({ type: 'broadcast', event: 'm', payload: m }); },
    close() { void supabase().removeChannel(ch); usePresence.setState({ online: false }); },
  };
}

function localTransport(onMsg: (m: Msg) => void): Transport {
  const bc = new BroadcastChannel('cc-mundo');
  bc.onmessage = (e) => onMsg(e.data as Msg);
  usePresence.setState({ online: true });
  return { send(m) { bc.postMessage(m); }, close() { bc.close(); usePresence.setState({ online: false }); } };
}

/** Modelo com endereços absolutos (um caminho relativo do teste vale para quem recebe no mesmo site). */
const absolute = (m: CompanionModelFiles | null, slots: Record<string, string> = {}): CompanionModelFiles | null => {
  if (!m) return null;
  const abs = (u: string) => { try { return new URL(u, location.href).href; } catch { return u; } };
  // só o que a presença usa: corpo + parado/andando/correndo
  return { url: abs(m.url), anims: m.anims.filter((a) => a.url === m.url || ['idle', 'walk', 'run'].includes(a.kind) || Object.values(slots).some((v) => v.startsWith('anim:' + a.name + '|'))).map((a) => ({ ...a, url: abs(a.url) })) };
};

/**
 * Entra num mapa compartilhado (Companion World ou Áster) e devolve a função para sair. Todos os mapas usam o
 * mesmo canal: cada mensagem diz o mapa, e só quem está no mesmo aparece na cena. `local`: BroadcastChannel (dev).
 */
export function joinWorld(me: RemoteInfo, local = false, map: PresenceMap = 'world'): () => void {
  return connect({ ...me, model: absolute(me.model, me.slots) }, local, map);
}

/** Só observa quem está nos mapas (o Administrador no Refúgio, para o teleporte): não manda posição nem ficha. */
export function watchWorld(local = false): () => void {
  return connect(null, local, null);
}

function connect(info: RemoteInfo | null, local: boolean, map: PresenceMap | null): () => void {
  const infos = new Map<string, RemoteInfo>(), maps = new Map<string, PresenceMap>();
  const near = (id: string) => map !== null && maps.get(id) === map;
  const poses = (id: string) => (near(id) ? remotePoses : farPoses);
  const publish = () => usePresence.setState({
    others: [...infos.values()].filter((i) => near(i.id)),
    all: [...infos.values()].map((i) => ({ info: i, map: maps.get(i.id) ?? 'world' })),
  });
  /** guarda o mapa de alguém; se mudou, a posição antiga (de outro mapa) não vale mais */
  const setMap = (id: string, m: PresenceMap) => {
    if (maps.get(id) === m) return false;
    maps.set(id, m); remotePoses.delete(id); farPoses.delete(id);
    return true;
  };
  const askFor = (): Msg => (info ? { type: 'hello', info, ask: true, map: map! } : { type: 'ask' });
  const onMsg = (m: Msg) => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ask') { if (info) t.send({ type: 'hello', info, map: map! }); return; }
    if (m.type === 'hello') {
      if (!m.info?.id || m.info.id === info?.id) return;
      const id = m.info.id, moved = setMap(id, mapOf(m.map)), known = infos.has(id);
      infos.set(id, { id, name: String(m.info.name ?? '').slice(0, 40) || 'Companion', color: /^#[0-9a-f]{6}$/i.test(m.info.color) ? m.info.color : '#9fd8ff', model: m.info.model ?? null, pronoun: m.info.pronoun, slots: m.info.slots && typeof m.info.slots === 'object' ? m.info.slots : undefined });
      if (!known || moved) publish();
      if (m.ask && info) t.send({ type: 'hello', info, map: map! }); // alguém novo pediu as fichas: responde com a minha
      const P = poses(id);
      if (!P.has(id)) P.set(id, { x: NaN, z: NaN, yaw: 0, down: false, t: performance.now(), px: NaN, pz: NaN, pt: 0 });
      P.get(id)!.t = performance.now();
    } else if (m.type === 'pose') {
      if (m.id === info?.id || ![m.x, m.z, m.yaw].every(Number.isFinite)) return;
      const moved = setMap(m.id, mapOf(m.map)), P = poses(m.id);
      const cur = P.get(m.id), now = performance.now();
      if (cur) Object.assign(cur, { px: Number.isFinite(cur.x) ? cur.x : m.x, pz: Number.isFinite(cur.z) ? cur.z : m.z, pt: cur.t, x: m.x, z: m.z, yaw: m.yaw, down: !!m.down, t: now, hp: Number.isFinite(m.hp) ? m.hp : cur.hp });
      else P.set(m.id, { x: m.x, z: m.z, yaw: m.yaw, down: !!m.down, t: now, px: m.x, pz: m.z, pt: now, hp: Number.isFinite(m.hp) ? m.hp : undefined });
      if (!infos.has(m.id)) t.send(askFor()); // posição de quem eu ainda não conheço: pede a ficha
      else if (moved) publish();
    } else if (m.type === 'poke') {
      if (info && m.from !== info.id && (m.to === '*' || (Array.isArray(m.to) && m.to.includes(info.id)))) pokeHandlers.forEach((f) => f());
    } else if (m.type === 'bye') {
      infos.delete(m.id); maps.delete(m.id); remotePoses.delete(m.id); farPoses.delete(m.id); publish();
    }
  };
  const t = local ? localTransport(onMsg) : supabaseTransport(onMsg);
  if (info) current = { t, id: info.id };
  t.send(askFor());
  let last = { x: NaN, z: NaN, yaw: NaN, down: false, at: 0, hp: -1 };
  const poseTimer = window.setInterval(() => {
    const now = performance.now();
    if (info) {
      const x = +companionFocus.x.toFixed(2), z = +companionFocus.z.toFixed(2), yaw = +companionPose.yaw.toFixed(2), down = companionPose.down;
      const hp = +(vitals.hp / Math.max(1, vitals.hpMax)).toFixed(2);
      const moved = Math.hypot(x - last.x, z - last.z) > 0.03 || Math.abs(yaw - last.yaw) > 0.05 || down !== last.down || Math.abs(hp - last.hp) > 0.02;
      if (moved || now - last.at > (document.hidden ? IDLE_HIDDEN_MS : IDLE_MS)) { t.send({ type: 'pose', id: info.id, x, z, yaw, down, hp, map: map! }); last = { x, z, yaw, down, at: now, hp }; }
    }
    // some quem parou de mandar
    let gone = false;
    for (const P of [remotePoses, farPoses]) P.forEach((p, id) => { if (now - p.t > STALE_MS) { P.delete(id); infos.delete(id); maps.delete(id); gone = true; } });
    if (gone) publish();
  }, POSE_MS);
  const helloTimer = window.setInterval(() => { if (info) t.send({ type: 'hello', info, map: map! }); }, HELLO_MS);
  const leave = () => { if (info) t.send({ type: 'bye', id: info.id }); };
  window.addEventListener('pagehide', leave);
  return () => {
    window.clearInterval(poseTimer); window.clearInterval(helloTimer); window.removeEventListener('pagehide', leave);
    leave(); t.close(); if (current?.t === t) current = null;
    infos.clear(); maps.clear(); remotePoses.clear(); farPoses.clear(); publish();
  };
}
