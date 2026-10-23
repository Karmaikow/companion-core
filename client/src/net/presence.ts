/**
 * Presença no Companion World (MMO, fase 1 — docs/MMO_SOCIAL.md): cada jogo manda a posição do próprio Companion e
 * recebe a dos outros, para eles aparecerem na mesma tela. Só visual: não colidem, não lutam juntos, nada vai para o
 * banco.
 *
 * Transporte: canal de broadcast do Supabase Realtime (online). No dev, `?eco` usa um BroadcastChannel do navegador
 * (duas abas do mesmo site se veem), para testar sem servidor.
 *
 * Mensagens:
 * - `hello` (ficha): id, nome, cor, modelo — na entrada, a cada ~10 s e quando alguém novo aparece;
 * - `pose`: id, x, z, yaw, caído — ~4×/s (só quando mudou, ou a cada 2 s parado);
 * - `bye`: ao sair do mundo.
 * Quem fica 8 s sem mandar nada some.
 */
import { create } from 'zustand';
import { supabase } from '../backend/online';
import type { CompanionModelFiles } from '../backend/types';
import { companionFocus, companionPose } from '../scene/world';

export interface RemoteInfo { id: string; name: string; color: string; model: CompanionModelFiles | null; pronoun?: string }
export interface RemotePose { x: number; z: number; yaw: number; down: boolean; t: number }
interface Hello { type: 'hello'; info: RemoteInfo; ask?: boolean }
interface Pose { type: 'pose'; id: string; x: number; z: number; yaw: number; down: boolean }
interface Bye { type: 'bye'; id: string }
type Msg = Hello | Pose | Bye;

interface Transport { send(m: Msg): void; close(): void }

/** Ficha de quem está por perto (a lista muda só quando alguém entra ou sai: a cena re-renderiza pouco). */
export const usePresence = create<{ others: RemoteInfo[]; online: boolean }>(() => ({ others: [], online: false }));
/** Últimas posições (lidas a cada quadro pela cena, sem React). */
export const remotePoses = new Map<string, RemotePose & { px: number; pz: number; pt: number }>();

const STALE_MS = 8000;
const POSE_MS = 250;
const HELLO_MS = 10000;

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
    send(m) { if (!ready) { if (m.type === 'hello') queue.push(m); return; } void ch.send({ type: 'broadcast', event: 'm', payload: m }); },
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
const absolute = (m: CompanionModelFiles | null): CompanionModelFiles | null => {
  if (!m) return null;
  const abs = (u: string) => { try { return new URL(u, location.href).href; } catch { return u; } };
  // só o que a presença usa: corpo + parado/andando/correndo
  return { url: abs(m.url), anims: m.anims.filter((a) => a.url === m.url || ['idle', 'walk', 'run'].includes(a.kind)).map((a) => ({ ...a, url: abs(a.url) })) };
};

/**
 * Entra no mundo compartilhado e devolve a função para sair. `local`: BroadcastChannel (testes no dev).
 */
export function joinWorld(me: RemoteInfo, local = false): () => void {
  const info: RemoteInfo = { ...me, model: absolute(me.model) };
  const infos = new Map<string, RemoteInfo>();
  const publish = () => usePresence.setState({ others: [...infos.values()] });
  const onMsg = (m: Msg) => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'hello') {
      if (!m.info?.id || m.info.id === info.id) return;
      const known = infos.has(m.info.id);
      infos.set(m.info.id, { id: m.info.id, name: String(m.info.name ?? '').slice(0, 40) || 'Companion', color: /^#[0-9a-f]{6}$/i.test(m.info.color) ? m.info.color : '#9fd8ff', model: m.info.model ?? null, pronoun: m.info.pronoun });
      if (!known) publish();
      if (m.ask) t.send({ type: 'hello', info }); // alguém novo pediu as fichas: responde com a minha
      if (!remotePoses.has(m.info.id)) remotePoses.set(m.info.id, { x: NaN, z: NaN, yaw: 0, down: false, t: performance.now(), px: NaN, pz: NaN, pt: 0 });
      remotePoses.get(m.info.id)!.t = performance.now();
    } else if (m.type === 'pose') {
      if (m.id === info.id || ![m.x, m.z, m.yaw].every(Number.isFinite)) return;
      const cur = remotePoses.get(m.id), now = performance.now();
      if (cur) Object.assign(cur, { px: Number.isFinite(cur.x) ? cur.x : m.x, pz: Number.isFinite(cur.z) ? cur.z : m.z, pt: cur.t, x: m.x, z: m.z, yaw: m.yaw, down: !!m.down, t: now });
      else remotePoses.set(m.id, { x: m.x, z: m.z, yaw: m.yaw, down: !!m.down, t: now, px: m.x, pz: m.z, pt: now });
      if (!infos.has(m.id)) t.send({ type: 'hello', info, ask: true }); // posição de quem eu ainda não conheço: pede a ficha
    } else if (m.type === 'bye') {
      infos.delete(m.id); remotePoses.delete(m.id); publish();
    }
  };
  const t = local ? localTransport(onMsg) : supabaseTransport(onMsg);
  t.send({ type: 'hello', info, ask: true });
  let last = { x: NaN, z: NaN, yaw: NaN, down: false, at: 0 };
  const poseTimer = window.setInterval(() => {
    const now = performance.now(), x = +companionFocus.x.toFixed(2), z = +companionFocus.z.toFixed(2), yaw = +companionPose.yaw.toFixed(2), down = companionPose.down;
    const moved = Math.hypot(x - last.x, z - last.z) > 0.03 || Math.abs(yaw - last.yaw) > 0.05 || down !== last.down;
    if (moved || now - last.at > 2000) { t.send({ type: 'pose', id: info.id, x, z, yaw, down }); last = { x, z, yaw, down, at: now }; }
    // some quem parou de mandar
    let gone = false;
    remotePoses.forEach((p, id) => { if (now - p.t > STALE_MS) { remotePoses.delete(id); infos.delete(id); gone = true; } });
    if (gone) publish();
  }, POSE_MS);
  const helloTimer = window.setInterval(() => t.send({ type: 'hello', info }), HELLO_MS);
  const leave = () => t.send({ type: 'bye', id: info.id });
  window.addEventListener('pagehide', leave);
  return () => {
    window.clearInterval(poseTimer); window.clearInterval(helloTimer); window.removeEventListener('pagehide', leave);
    leave(); t.close();
    infos.clear(); remotePoses.clear(); publish();
  };
}
