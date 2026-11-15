/**
 * Monstros compartilhados (MMO, fase 5 sem servidor de simulação): quem simula cada monstro e o que viaja pelo canal.
 *
 * Os monstros já nascem iguais em todas as telas (`chunkSpawns` é determinístico: mesmo id, mesmo lugar). O que
 * diverge é o que acontece depois — para onde andam, quanta vida têm, se morreram. Em vez de um servidor rodando a
 * simulação, cada monstro tem um DONO entre os jogadores presentes:
 *   - o dono simula o monstro como sempre (ele persegue e ataca o Companion do dono) e transmite o estado;
 *   - os outros só desenham o estado recebido e mandam os golpes para o dono, que aplica o dano.
 * Assim posição, vida e morte são as mesmas em todas as telas, e o dano de todos conta.
 *
 * O dono é escolhido pela mesma conta em todos os jogos (sem negociação): o jogador mais perto da TOCA do monstro (o
 * ponto onde ele nasce, que não se mexe). Quem já é dono continua enquanto o monstro estiver brigando com ele, e só
 * perde a vez para alguém bem mais perto. Se dois jogos se acharem donos ao mesmo tempo, `resolveClaim` desempata.
 *
 * Tudo puro: o cliente (net/creatureSync) guarda o estado e fala com o canal.
 */

export interface SyncPlayer { id: string; x: number; z: number }
export interface OwnerClaim { id: string; engaged: boolean }

/** só entra na conta quem está a até esta distância da toca (m) */
export const SYNC_RANGE = 70;
/** para tomar a vez de um dono que não está brigando, é preciso estar este tanto mais perto (m) */
export const SYNC_HYSTERESIS = 5;
/** estados por segundo de um monstro ativo (brigando, andando, ferido) e de um parado */
export const SYNC_ACTIVE_HZ = 4, SYNC_IDLE_HZ = 0.5;
/** sem notícia do dono por este tempo (ms), o monstro fica sem dono e a conta recomeça */
export const SYNC_STALE_MS = 3000;

const dist = (p: SyncPlayer, s: { x: number; z: number }) => Math.hypot(p.x - s.x, p.z - s.z);

/**
 * Quem deve simular este monstro. `players`: todos no mesmo mapa (eu incluído). `current`: o dono de agora, se
 * ainda dá sinal. Devolve null se ninguém está perto o bastante.
 */
export function pickOwner(spawn: { x: number; z: number }, players: readonly SyncPlayer[], current: OwnerClaim | null): string | null {
  const near = players.filter((p) => dist(p, spawn) <= SYNC_RANGE);
  if (!near.length) return null;
  // o mais perto da toca; no empate, o menor id (a mesma resposta em todos os jogos)
  const best = [...near].sort((a, b) => dist(a, spawn) - dist(b, spawn) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  const cur = current ? near.find((p) => p.id === current.id) ?? null : null;
  if (!cur || !current) return best.id;
  if (current.engaged) return cur.id; // está brigando com ele: não troca de dono no meio da luta
  return dist(best, spawn) + SYNC_HYSTERESIS < dist(cur, spawn) ? best.id : cur.id;
}

/**
 * Dois jogos transmitindo o mesmo monstro: quem fica. Quem está brigando com ele vence; no empate, o menor id.
 * `true` = eu continuo dono.
 */
export function resolveClaim(me: OwnerClaim, other: OwnerClaim): boolean {
  if (me.engaged !== other.engaged) return me.engaged;
  return me.id < other.id;
}

/** Animação do monstro como número (viaja no estado). */
export const SYNC_ACTS = ['idle', 'walk', 'run', 'attack', 'hurt'] as const;
export type SyncAct = (typeof SYNC_ACTS)[number];

export interface CreatureState {
  id: string;
  x: number; z: number; yaw: number;
  /** vida 0–1 */
  hp: number;
  act: SyncAct;
  dead: boolean;
  /** brigando com o dono (o "!" na plaquinha) */
  engaged: boolean;
}

/** Estado → tupla compacta: [id, x, z, yaw, vida, animação, bits (1 morto, 2 brigando)]. */
export type CreatureTuple = [string, number, number, number, number, number, number];
const r1 = (v: number) => Math.round(v * 10) / 10, r2 = (v: number) => Math.round(v * 100) / 100;
export function packCreature(s: CreatureState): CreatureTuple {
  return [s.id, r1(s.x), r1(s.z), r2(s.yaw), r2(Math.min(1, Math.max(0, s.hp))), Math.max(0, SYNC_ACTS.indexOf(s.act)), (s.dead ? 1 : 0) | (s.engaged ? 2 : 0)];
}

/**
 * Lê o que chegou pelo canal. O conteúdo vem de outro jogador: nada aqui é de confiança. Descarta o que não tem a
 * forma certa, limita a quantidade e prende os números em faixas válidas.
 */
export function unpackCreatures(d: unknown, limit = 80): CreatureState[] {
  if (!Array.isArray(d)) return [];
  const out: CreatureState[] = [];
  for (const t of d.slice(0, limit)) {
    if (!Array.isArray(t) || t.length < 7) continue;
    const [id, x, z, yaw, hp, act, bits] = t as unknown[];
    if (typeof id !== 'string' || !id || id.length > 64) continue;
    if (![x, z, yaw, hp, act, bits].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    out.push({
      id, x: x as number, z: z as number, yaw: yaw as number, hp: Math.min(1, Math.max(0, hp as number)),
      act: SYNC_ACTS[Math.min(SYNC_ACTS.length - 1, Math.max(0, Math.round(act as number)))], dead: ((bits as number) & 1) === 1, engaged: ((bits as number) & 2) === 2,
    });
  }
  return out;
}

/** Golpe de quem não é o dono, mandado para o dono aplicar. */
export interface CreatureHit { id: string; to: string; dmg: number; status?: { key: string; seconds: number; dps: number } }
const STATUS_KEYS = ['envenenado', 'queimando', 'lento', 'atordoado', 'enraizado', 'ofuscado', 'sombreado'];
/** Valida um golpe recebido. `maxDmg`: teto por golpe (a vida cheia do monstro: um golpe não tira mais que isso). */
export function readCreatureHit(d: unknown, maxDmg: number): CreatureHit | null {
  if (!d || typeof d !== 'object') return null;
  const h = d as Record<string, unknown>;
  if (typeof h.id !== 'string' || typeof h.to !== 'string' || typeof h.dmg !== 'number' || !Number.isFinite(h.dmg)) return null;
  const out: CreatureHit = { id: h.id, to: h.to, dmg: Math.min(Math.max(0, Math.round(h.dmg)), Math.max(1, Math.round(maxDmg))) };
  const s = h.status as Record<string, unknown> | undefined;
  if (s && typeof s === 'object' && typeof s.key === 'string' && STATUS_KEYS.includes(s.key) && typeof s.seconds === 'number' && typeof s.dps === 'number' && Number.isFinite(s.seconds) && Number.isFinite(s.dps))
    out.status = { key: s.key, seconds: Math.min(15, Math.max(0, s.seconds)), dps: Math.min(Math.max(0, s.dps), Math.max(1, maxDmg * 0.2)) };
  return out;
}

/** Quanto tempo esperar até o próximo estado deste monstro (ms): ativo manda 4×/s, parado a cada 2 s. */
export const syncInterval = (active: boolean) => 1000 / (active ? SYNC_ACTIVE_HZ : SYNC_IDLE_HZ);

/**
 * Mensagens por hora que isto custa no Realtime (cada transmissão conta 1 para quem envia + 1 por quem recebe).
 * `owners`: jogadores com monstros ativos; `players`: todos no mapa. Os estados de um dono vão juntos numa mensagem.
 */
export const syncMessagesPerHour = (owners: number, players: number, hz = SYNC_ACTIVE_HZ) => Math.round(owners * hz * (1 + Math.max(0, players - 1)) * 3600);
