/**
 * Monstros compartilhados no cliente (as regras ficam em @rules/creatureSync): guarda o último estado recebido de cada
 * monstro, decide a cada quadro quem é o dono e junta os estados dos meus monstros numa mensagem só por envio.
 * Viaja pelo canal da presença (`sendExtra`/`onExtra`), então só existe onde há presença: Companion World e Áster,
 * online (ou duas abas com `?eco` no dev). Sozinho no mapa, nada é enviado e tudo roda como antes.
 */
import {
  SYNC_STALE_MS, packCreature, pickOwner, resolveClaim, syncInterval, unpackCreatures,
  type CreatureState, type SyncPlayer,
} from '@rules';
import { companionFocus } from '../scene/world';
import { onExtra, presenceId, remotePoses, sendExtra } from './presence';

interface Remote { s: CreatureState; owner: string; t: number }
interface Mine { s: CreatureState; active: boolean; sentAt: number }

/** último estado que outro dono mandou, por monstro */
const remote = new Map<string, Remote>();
/** os monstros que eu simulo agora e o que falta mandar */
const mine = new Map<string, Mine>();
const hitHandlers = new Map<string, (raw: unknown, from: string) => void>();
/** contadores para medir o custo (mensagens enviadas e recebidas nesta sessão) */
export const syncStats = { sent: 0, received: 0, hitsSent: 0, hitsReceived: 0, since: performance.now() };

export type Ownership =
  | { mode: 'solo' }
  | { mode: 'me' }
  /** `state` null: o dono ainda não mandou nada (o monstro espera parado) */
  | { mode: 'remote'; owner: string; state: CreatureState | null };
const SOLO: Ownership = { mode: 'solo' }, ME: Ownership = { mode: 'me' };
/** até onde um monstro pode estar na tela de outro jogador (os pedaços do mapa carregados em volta dele, com folga) */
const SYNC_VISIBLE = 130;

let started = false;
function start() {
  if (started) return;
  started = true;
  onExtra('creatures', (d, from) => {
    syncStats.received++;
    const me = presenceId(), now = performance.now();
    for (const s of unpackCreatures(d)) {
      const own = mine.get(s.id);
      if (own && me) {
        // Os dois se acham donos. Quem está brigando com ele fica; os dois brigando (ou nenhum): se a luta decide,
        // vale o menor id; fora da luta, quem está mais perto da toca (a mesma conta dos dois lados).
        const fighting = own.s.engaged || s.engaged;
        const keep = fighting ? resolveClaim({ id: me, engaged: own.s.engaged }, { id: from, engaged: s.engaged }) : keepByDistance.get(s.id) ?? me < from;
        if (keep) continue;
        mine.delete(s.id);
      }
      remote.set(s.id, { s, owner: from, t: now });
    }
  });
  onExtra('chit', (d, from) => {
    const h = d as { id?: unknown; to?: unknown } | null;
    if (!h || typeof h.id !== 'string' || h.to !== presenceId()) return;
    syncStats.hitsReceived++;
    hitHandlers.get(h.id)?.(d, from);
  });
  // envio: junta tudo o que está na hora de mandar numa mensagem só
  setInterval(() => {
    const now = performance.now();
    if (!presenceId() || !othersHere()) { mine.clear(); return; }
    const batch: ReturnType<typeof packCreature>[] = [];
    mine.forEach((m) => { if (now - m.sentAt >= syncInterval(m.active)) { m.sentAt = now; batch.push(packCreature(m.s)); } });
    if (batch.length && sendExtra('creatures', batch)) syncStats.sent++;
    // esquece quem não dá sinal há muito tempo
    remote.forEach((r, id) => { if (now - r.t > SYNC_STALE_MS * 4) remote.delete(id); });
  }, 125);
}

/** resultado da última conta de distância por monstro (false = outro está mais perto: cedo a vez num conflito) */
const keepByDistance = new Map<string, boolean>();
const players: SyncPlayer[] = [];
function othersHere(): boolean {
  let n = 0;
  remotePoses.forEach((p) => { if (Number.isFinite(p.x)) n++; });
  return n > 0;
}

/**
 * Quem simula este monstro neste quadro. `engaged`: ele está brigando com o MEU Companion (só importa se eu for o dono).
 */
export function creatureOwner(id: string, spawn: { x: number; z: number }, engaged: boolean): Ownership {
  const me = presenceId();
  if (!me) return SOLO;
  start();
  players.length = 0;
  players.push({ id: me, x: companionFocus.x, z: companionFocus.z });
  remotePoses.forEach((p, pid) => { if (Number.isFinite(p.x)) players.push({ id: pid, x: p.x, z: p.z }); });
  if (players.length === 1) { mine.delete(id); return SOLO; }
  // Ninguém mais por perto desta toca: o monstro nem aparece na tela dos outros, então não há o que transmitir.
  // (Sem isso, dois jogadores em cantos opostos do mapa gastariam mensagens um com o outro o tempo todo.)
  let nearOther = false;
  for (let i = 1; i < players.length && !nearOther; i++) nearOther = Math.hypot(players[i].x - spawn.x, players[i].z - spawn.z) <= SYNC_VISIBLE;
  if (!nearOther) { mine.delete(id); return SOLO; }
  const now = performance.now(), r = remote.get(id), fresh = r && now - r.t < SYNC_STALE_MS ? r : null;
  const wasMine = mine.has(id);
  const current = wasMine ? { id: me, engaged } : fresh ? { id: fresh.owner, engaged: fresh.s.engaged } : null;
  const owner = pickOwner(spawn, players, current);
  keepByDistance.set(id, pickOwner(spawn, players, null) === me);
  if (owner === me || owner === null) return ME;
  if (wasMine) mine.delete(id);
  return { mode: 'remote', owner: fresh?.owner ?? owner, state: fresh?.s ?? null };
}

/** O dono registra o estado do monstro neste quadro (o envio é em lote, no ritmo de `syncInterval`). */
export function publishCreature(s: CreatureState, active: boolean) {
  const m = mine.get(s.id);
  // mudou de parado para ativo, morreu ou voltou: manda já, sem esperar o ritmo lento
  if (m) { if ((active && !m.active) || m.s.dead !== s.dead) m.sentAt = 0; m.s = s; m.active = active; }
  else mine.set(s.id, { s, active, sentAt: 0 });
}

/** Deixei de simular (saiu do alcance, a cena fechou). */
export function releaseCreature(id: string) { mine.delete(id); hitHandlers.delete(id); }

/** Golpe de quem não é o dono: vai para o dono aplicar. */
export function sendCreatureHit(id: string, to: string, dmg: number, status?: { key: string; seconds: number; dps: number }) {
  if (sendExtra('chit', { id, to, dmg, status })) syncStats.hitsSent++;
}

/** O dono ouve os golpes dos outros neste monstro. */
export function onCreatureHit(id: string, cb: (raw: unknown, from: string) => void) {
  start();
  hitHandlers.set(id, cb);
  return () => { if (hitHandlers.get(id) === cb) hitHandlers.delete(id); };
}

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __creatureSync: unknown }).__creatureSync = { remote, mine, syncStats, creatureOwner };
