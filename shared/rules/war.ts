/**
 * A Guerra de Áster (fase 5) — regras puras, sem rede e sem relógio próprio (quem chama passa o `now`).
 * Plano completo em `docs/GUERRA_DE_ASTER.md`. O que está aqui:
 *
 *  1. Estados e gatilhos: a Fúria dos Distorcidos enche com os abates do servidor; o Administrador pode marcar a guerra
 *     ("em 20 min", "em 2 dias"); o alistamento abre no anúncio.
 *  2. Alistamento e portões: no mínimo 2 por portão (heróis NPC completam as vagas vazias), reforços, expulsão com
 *     medo de quem ficou na cidade sem alistar.
 *  3. Cronograma: 38 min, uma horda a cada 5 min nos quatro cantos, o chefe general nos últimos 8 min pelo sul.
 *  4. Campo de batalha: vida dos portões, das torres e do cristal; vitória e derrota.
 *  5. Placar de dano (com limite do que é plausível), prêmios e metas da reconstrução.
 *
 * Cada cliente simula as hordas a partir da mesma semente e do relógio do servidor; o servidor guarda só o que é
 * compartilhado (horário, semente, vida de portões/torres/cristal, placar). Por isso tudo aqui é determinístico.
 */
import { GATE_IDS, GATES, FIELDS_R, TRENCH_R, type GateId } from './aster.ts';
import type { AsterConfig, RebuildProgress } from './chests.ts';

const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };

// ---------------------------------------------------------------------------
// Configuração (Administrador → game_config.values.war)
// ---------------------------------------------------------------------------

export interface WarConfig {
  /** abates do servidor inteiro para a Fúria encher (ajustável: com poucos jogadores 30 mil levaria semanas) */
  killTrigger: number;
  /** defensores mínimos por portão; as vagas vazias são ocupadas por heróis NPC */
  minPerGate: number;
  durationMin: number;
  hordeEveryMin: number;
  /** minuto da primeira horda */
  firstHordeMin: number;
  /** o chefe general entra nos últimos N minutos */
  bossLastMin: number;
  /** intervalo mínimo entre uma guerra e a próxima */
  minGapHours: number;
  /** janela de alistamento quando o gatilho é a Fúria (com o ADM, é o tempo que ele marcou) */
  enlistMin: number;
  /** abates máximos que contam por jogador por vez (evita estourar a barra com um exploit) */
  killCapPerReport: number;
  /** duração do medo de quem estava na cidade sem alistar (segundos) */
  fearSeconds: number;
  /** dano mínimo para ter direito a prêmios */
  minDamage: number;
  victory: { dropPct: number; xpPct: number; minutes: number };
  /** com o chefe general derrotado */
  glorious: { dropPct: number; xpPct: number; minutes: number };
}
export const DEFAULT_WAR: WarConfig = {
  killTrigger: 30_000, minPerGate: 2, durationMin: 38, hordeEveryMin: 5, firstHordeMin: 5, bossLastMin: 8,
  minGapHours: 72, enlistMin: 15, killCapPerReport: 50, fearSeconds: 600, minDamage: 500,
  victory: { dropPct: 50, xpPct: 50, minutes: 120 },
  glorious: { dropPct: 75, xpPct: 75, minutes: 180 },
};
export function resolveWar(v: unknown): WarConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<WarConfig>;
  const buff = (b: unknown, d: WarConfig['victory']) => { const x = (b && typeof b === 'object' ? b : {}) as Partial<WarConfig['victory']>; return { dropPct: n(x.dropPct, 0, 200, d.dropPct), xpPct: n(x.xpPct, 0, 200, d.xpPct), minutes: Math.round(n(x.minutes, 1, 1440, d.minutes)) }; };
  const durationMin = Math.round(n(o.durationMin, 5, 180, DEFAULT_WAR.durationMin));
  const every = Math.round(n(o.hordeEveryMin, 1, 60, DEFAULT_WAR.hordeEveryMin));
  return {
    killTrigger: Math.round(n(o.killTrigger, 10, 10_000_000, DEFAULT_WAR.killTrigger)),
    minPerGate: Math.round(n(o.minPerGate, 1, 20, DEFAULT_WAR.minPerGate)),
    durationMin, hordeEveryMin: every,
    firstHordeMin: Math.min(durationMin - 1, Math.round(n(o.firstHordeMin, 0, 60, DEFAULT_WAR.firstHordeMin))),
    bossLastMin: Math.min(durationMin - 1, Math.round(n(o.bossLastMin, 1, 60, DEFAULT_WAR.bossLastMin))),
    minGapHours: n(o.minGapHours, 0, 720, DEFAULT_WAR.minGapHours),
    enlistMin: Math.round(n(o.enlistMin, 1, 1440, DEFAULT_WAR.enlistMin)),
    killCapPerReport: Math.round(n(o.killCapPerReport, 1, 10_000, DEFAULT_WAR.killCapPerReport)),
    fearSeconds: Math.round(n(o.fearSeconds, 0, 3600, DEFAULT_WAR.fearSeconds)),
    minDamage: Math.round(n(o.minDamage, 0, 1_000_000, DEFAULT_WAR.minDamage)),
    victory: buff(o.victory, DEFAULT_WAR.victory), glorious: buff(o.glorious, DEFAULT_WAR.glorious),
  };
}

// ---------------------------------------------------------------------------
// Estado da guerra e gatilhos
// ---------------------------------------------------------------------------

/** descanso → anúncio (alistamento) → guerra → (derrota) reconstrução → descanso */
export type WarPhase = 'descanso' | 'anuncio' | 'guerra' | 'reconstrucao';
export interface Enlisted { gate: GateId | null; at: number }
export interface WarState {
  phase: WarPhase;
  /** abates acumulados para a próxima Fúria */
  kills: number;
  /** abates que enchem a Fúria (copiado da configuração ao zerar) */
  target: number;
  round: number;
  /** quando a última guerra terminou (ms) */
  lastEndedAt: number | null;
  /** hora marcada para começar (ms) e fim previsto */
  startsAt: number | null;
  endsAt: number | null;
  /** semente das hordas: todos os clientes sorteiam as mesmas */
  seed: number;
  /** como foi marcada: pela Fúria ou pelo Administrador */
  by: 'furia' | 'admin' | null;
  enlisted: Record<string, Enlisted>;
}
export const emptyWar = (cfg: WarConfig = DEFAULT_WAR): WarState => ({
  phase: 'descanso', kills: 0, target: cfg.killTrigger, round: 0, lastEndedAt: null, startsAt: null, endsAt: null, seed: 0, by: null, enlisted: {},
});

/** Semente da guerra: mistura a hora e o número da rodada (determinística). */
export const warSeed = (at: number, round: number) => (Math.imul((at >>> 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul(round + 1, 40503)) >>> 0;

/** 0 a 1: quanto da Fúria dos Distorcidos já encheu. */
export const furyRatio = (s: WarState) => (s.target > 0 ? Math.min(1, s.kills / s.target) : 0);

/** Já passou o intervalo mínimo desde a última guerra? */
export const gapPassed = (s: WarState, now: number, cfg: WarConfig) => s.lastEndedAt === null || now - s.lastEndedAt >= cfg.minGapHours * 3_600_000;

/** Abates do servidor chegando. Enche a Fúria; ao encher (e passado o intervalo mínimo), anuncia a guerra. */
export function addKills(s: WarState, count: number, cfg: WarConfig, now: number): WarState {
  if (s.phase !== 'descanso') return s;
  const add = Math.max(0, Math.min(Math.round(count) || 0, cfg.killCapPerReport));
  if (!add) return s;
  const kills = Math.min(s.target, s.kills + add);
  const next = { ...s, kills };
  if (kills >= s.target && gapPassed(s, now, cfg)) return announce(next, now, now + cfg.enlistMin * 60_000, 'furia');
  return next;
}

function announce(s: WarState, now: number, startsAt: number, by: 'furia' | 'admin'): WarState {
  return { ...s, phase: 'anuncio', startsAt, endsAt: null, by, seed: warSeed(now, s.round), enlisted: {} };
}

/** O Administrador marca a guerra para daqui a `delayMs` (também remarca uma já anunciada). */
export function scheduleWar(s: WarState, now: number, delayMs: number): WarState {
  if (s.phase !== 'descanso' && s.phase !== 'anuncio') return s;
  return announce(s.phase === 'anuncio' ? { ...s } : s, now, now + Math.max(1000, Math.round(delayMs)), 'admin');
}
/** Adia a guerra anunciada. */
export const postponeWar = (s: WarState, ms: number): WarState => (s.phase === 'anuncio' && s.startsAt !== null ? { ...s, startsAt: s.startsAt + Math.max(0, ms) } : s);
/** Cancela o anúncio: volta ao descanso e guarda os abates. */
export const cancelWar = (s: WarState): WarState => (s.phase === 'anuncio' ? { ...s, phase: 'descanso', startsAt: null, by: null, enlisted: {}, kills: s.by === 'furia' ? Math.max(0, s.target - 1) : s.kills } : s);

// ---------------------------------------------------------------------------
// Alistamento e portões
// ---------------------------------------------------------------------------

export function enlist(s: WarState, id: string, now: number): { state: WarState; ok: boolean; reason?: string } {
  if (s.phase === 'guerra') return { state: s, ok: false, reason: 'A guerra já começou: entre como reforço.' };
  if (s.phase !== 'anuncio') return { state: s, ok: false, reason: 'Não há guerra anunciada.' };
  if (s.startsAt !== null && now >= s.startsAt) return { state: s, ok: false, reason: 'O alistamento acabou.' };
  if (s.enlisted[id]) return { state: s, ok: true };
  return { state: { ...s, enlisted: { ...s.enlisted, [id]: { gate: null, at: now } } }, ok: true };
}
export function leaveEnlist(s: WarState, id: string): WarState {
  if (s.phase !== 'anuncio' || !s.enlisted[id]) return s;
  const { [id]: _gone, ...rest } = s.enlisted;
  return { ...s, enlisted: rest };
}

/** Sorteio estável (mulberry32): a mesma semente dá a mesma sequência em qualquer aparelho. */
export function warRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return (((r ^ (r >>> 14)) >>> 0) / 4294967296); };
}

export interface GateAssignment { gates: Record<GateId, string[]>; /** vagas que os heróis NPC ocupam, por portão */ heroes: Record<GateId, number> }
/** Distribui os alistados pelos portões (mínimo por portão; sobras divididas por igual) e diz quantos heróis completam. */
export function assignGates(ids: string[], cfg: WarConfig, seed: number): GateAssignment {
  const rnd = warRng(seed), order = [...ids].sort(), gates = { norte: [], leste: [], sul: [], oeste: [] } as Record<GateId, string[]>;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.forEach((id, i) => gates[GATE_IDS[i % GATE_IDS.length]].push(id));
  const heroes = { norte: 0, leste: 0, sul: 0, oeste: 0 } as Record<GateId, number>;
  for (const g of GATE_IDS) heroes[g] = Math.max(0, cfg.minPerGate - gates[g].length);
  return { gates, heroes };
}
/** O portão com menos defensores (para reforços que chegam com a guerra em andamento). */
export function reinforcementGate(counts: Record<GateId, number>): GateId {
  return [...GATE_IDS].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0) || GATE_IDS.indexOf(a) - GATE_IDS.indexOf(b))[0];
}

/** A hora chegou: a guerra começa e os alistados (que seguem online, se a lista for dada) vão para os portões. */
export function startWar(s: WarState, now: number, cfg: WarConfig, online?: readonly string[]): WarState {
  if (s.phase !== 'anuncio' || s.startsAt === null || now < s.startsAt) return s;
  const ids = Object.keys(s.enlisted).filter((id) => !online || online.includes(id));
  const a = assignGates(ids, cfg, s.seed), enlisted: Record<string, Enlisted> = {};
  for (const g of GATE_IDS) for (const id of a.gates[g]) enlisted[id] = { gate: g, at: s.enlisted[id].at };
  return { ...s, phase: 'guerra', startsAt: s.startsAt, endsAt: s.startsAt + cfg.durationMin * 60_000, enlisted };
}
/** Entra com a guerra em andamento: vai para o portão mais vazio. */
export function reinforce(s: WarState, id: string, now: number): { state: WarState; gate: GateId | null } {
  if (s.phase !== 'guerra' || (s.endsAt !== null && now >= s.endsAt)) return { state: s, gate: null };
  if (s.enlisted[id]?.gate) return { state: s, gate: s.enlisted[id].gate };
  const counts = { norte: 0, leste: 0, sul: 0, oeste: 0 } as Record<GateId, number>;
  for (const e of Object.values(s.enlisted)) if (e.gate) counts[e.gate]++;
  const gate = reinforcementGate(counts);
  return { state: { ...s, enlisted: { ...s.enlisted, [id]: { gate, at: now } } }, gate };
}
/** Quem estava na cidade sem estar alistado: medo e para o Refúgio. */
export const evacuees = (inCity: readonly string[], s: WarState) => inCity.filter((id) => !s.enlisted[id]);

/** Os lugares fechados pela guerra e pela cidade destruída. */
export const outskirtsOpen = (s: WarState) => s.phase !== 'guerra';
export const cityOpen = (s: WarState) => s.phase !== 'guerra';
/** Lojas, escolas e missões especiais só voltam com a cidade reconstruída. */
export const cityServicesOpen = (s: WarState) => s.phase !== 'guerra' && s.phase !== 'reconstrucao';

// ---------------------------------------------------------------------------
// Cronograma da guerra
// ---------------------------------------------------------------------------

export const warLengthSec = (cfg: WarConfig) => cfg.durationMin * 60;
/** Segundos em que cada horda chega (a primeira em `firstHordeMin`, depois a cada `hordeEveryMin`, até o fim). */
export function hordeSchedule(cfg: WarConfig): number[] {
  const out: number[] = [];
  for (let t = cfg.firstHordeMin * 60; t < warLengthSec(cfg); t += cfg.hordeEveryMin * 60) out.push(t);
  return out;
}
/** Segundo em que o chefe general entra (nos últimos `bossLastMin` minutos). */
export const bossAtSec = (cfg: WarConfig) => (cfg.durationMin - cfg.bossLastMin) * 60;
export const warElapsedSec = (s: WarState, now: number) => (s.startsAt === null ? 0 : Math.max(0, Math.floor((now - s.startsAt) / 1000)));
export const warRemainingSec = (s: WarState, now: number, cfg: WarConfig) => Math.max(0, warLengthSec(cfg) - warElapsedSec(s, now));

export type WarEvent = { kind: 'horda'; index: number; inSec: number } | { kind: 'chefe'; inSec: number } | { kind: 'fim'; inSec: number };
/** O que vem a seguir e em quantos segundos (para o HUD). */
export function nextWarEvent(cfg: WarConfig, elapsedSec: number, bossDone = false): WarEvent {
  const hs = hordeSchedule(cfg), idx = hs.findIndex((t) => t > elapsedSec), boss = bossAtSec(cfg), end = warLengthSec(cfg);
  const cands: WarEvent[] = [{ kind: 'fim', inSec: end - elapsedSec }];
  if (idx >= 0) cands.push({ kind: 'horda', index: idx, inSec: hs[idx] - elapsedSec });
  if (!bossDone && boss > elapsedSec) cands.push({ kind: 'chefe', inSec: boss - elapsedSec });
  return cands.sort((a, b) => a.inSec - b.inSec)[0];
}
/** Quantas hordas já chegaram até este segundo. */
export const hordesArrived = (cfg: WarConfig, elapsedSec: number) => hordeSchedule(cfg).filter((t) => t <= elapsedSec).length;

/** Escala da força da guerra pelo número de alistados: 1,0 com 4 portões × mínimo; de 0,5 a 3. */
export const warScale = (enlisted: number, cfg: WarConfig) => Math.min(3, Math.max(0.5, 0.5 + (0.5 * enlisted) / (cfg.minPerGate * GATE_IDS.length)));
/** Monstros por canto numa horda (a primeira é a 0). */
export const hordeSize = (index: number, enlisted: number, cfg: WarConfig) => Math.max(3, Math.round((8 + 3 * index) * warScale(enlisted, cfg)));
/** Multiplicador de nível dos monstros da horda. */
export const hordeLevelMul = (index: number) => 1 + 0.08 * index;
/** O chefe general: 10× o XP do Distorcido original, mais forte e mais resistente. */
export const GENERAL = { xpMul: 10, hpMul: 20, atkMul: 2.5, defMul: 2 } as const;
export const generalHpMul = (enlisted: number, cfg: WarConfig) => GENERAL.hpMul * (0.7 + 0.3 * warScale(enlisted, cfg));

export type WarMonster = 'leve' | 'pesado' | 'distancia';
export interface WarSpawn { x: number; z: number; kind: WarMonster; gate: GateId }
/** Onde e o quê chega em cada horda: o mesmo resultado em todo aparelho (semente + horda + canto). */
export function hordeSpawns(seed: number, index: number, gate: GateId, count: number): WarSpawn[] {
  const rnd = warRng((seed ^ Math.imul(index + 1, 7919) ^ Math.imul(GATE_IDS.indexOf(gate) + 1, 104729)) >>> 0);
  const d = GATES[gate], len = Math.hypot(d.dx, d.dz) || 1, base = Math.atan2(d.dz / len, d.dx / len);
  const heavy = Math.min(0.5, 0.1 + 0.06 * index), ranged = 0.25;
  return Array.from({ length: count }, () => {
    const a = base + (rnd() - 0.5) * 1.1, r = TRENCH_R + 20 + rnd() * (FIELDS_R - TRENCH_R - 20), roll = rnd();
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, kind: roll < heavy ? 'pesado' : roll < heavy + ranged ? 'distancia' : 'leve', gate } as WarSpawn;
  });
}
/** Por onde o chefe general aparece: portão sul, no limite dos Campos. */
export const bossSpawn = (): { x: number; z: number } => { const d = GATES.sul, len = Math.hypot(d.dx, d.dz) || 1; return { x: (d.dx / len) * (FIELDS_R - 8), z: (d.dz / len) * (FIELDS_R - 8) }; };

// ---------------------------------------------------------------------------
// Campo de batalha: portões, torres e cristal
// ---------------------------------------------------------------------------

export const GATE_BASE_HP = 6000, TOWER_BASE_HP = 3000, CRYSTAL_BASE_HP = 20000;
/** vida que o cristal perde por segundo, por monstro dentro da cidade */
export const CRYSTAL_DRAIN = 4;
export interface WarTower { id: string; level: number }
export interface WarField {
  gates: Record<GateId, { hp: number; max: number }>;
  towers: { id: string; hp: number; max: number }[];
  crystal: { hp: number; max: number };
}
export const towerMaxHp = (level: number) => Math.round(TOWER_BASE_HP * (1 + 0.25 * (Math.max(1, level) - 1)));
export function newField(enlisted: number, towers: readonly WarTower[], cfg: WarConfig): WarField {
  const k = 0.7 + 0.3 * warScale(enlisted, cfg), gmax = Math.round(GATE_BASE_HP * k);
  return {
    gates: { norte: { hp: gmax, max: gmax }, leste: { hp: gmax, max: gmax }, sul: { hp: gmax, max: gmax }, oeste: { hp: gmax, max: gmax } },
    towers: towers.map((t) => { const m = towerMaxHp(t.level); return { id: t.id, hp: m, max: m }; }),
    crystal: { hp: CRYSTAL_BASE_HP, max: CRYSTAL_BASE_HP },
  };
}
const hit = <T extends { hp: number; max: number }>(p: T, dmg: number): T => ({ ...p, hp: Math.max(0, Math.min(p.max, p.hp - dmg)) });
export const damageGate = (f: WarField, gate: GateId, dmg: number): WarField => ({ ...f, gates: { ...f.gates, [gate]: hit(f.gates[gate], dmg) } });
export const damageTower = (f: WarField, id: string, dmg: number): WarField => ({ ...f, towers: f.towers.map((t) => (t.id === id ? hit(t, dmg) : t)) });
export const damageCrystal = (f: WarField, dmg: number): WarField => ({ ...f, crystal: hit(f.crystal, dmg) });
/** Reparo (torres e portões, por heróis e jogadores). */
export const repairGate = (f: WarField, gate: GateId, hp: number): WarField => damageGate(f, gate, -Math.abs(hp));
export const gateFallen = (f: WarField, gate: GateId) => f.gates[gate].hp <= 0;
export const fallenGates = (f: WarField): GateId[] => GATE_IDS.filter((g) => gateFallen(f, g));
export const fallenTowers = (f: WarField) => f.towers.filter((t) => t.hp <= 0).length;
/** Com algum portão caído, os monstros dentro da cidade drenam a vida do cristal. */
export function crystalDrain(f: WarField, monstersInside: number, dtSec: number): WarField {
  if (!fallenGates(f).length || monstersInside <= 0 || dtSec <= 0) return f;
  return damageCrystal(f, CRYSTAL_DRAIN * monstersInside * dtSec);
}

export type WarOutcome = { state: 'em_andamento' } | { state: 'vitoria'; glorious: boolean } | { state: 'derrota' };
/** Derrota: o cristal chegou a zero. Vitória: o cristal está de pé quando o tempo acaba (com o general derrotado, é gloriosa). */
export function warOutcome(f: WarField, elapsedSec: number, cfg: WarConfig, bossDead: boolean): WarOutcome {
  if (f.crystal.hp <= 0) return { state: 'derrota' };
  if (elapsedSec >= warLengthSec(cfg)) return { state: 'vitoria', glorious: bossDead };
  return { state: 'em_andamento' };
}

/** A guerra acabou: a Fúria zera; derrota leva à reconstrução, vitória volta ao descanso. */
export function finishWar(s: WarState, outcome: WarOutcome, now: number, cfg: WarConfig): WarState {
  if (s.phase !== 'guerra' || outcome.state === 'em_andamento') return s;
  return { ...s, phase: outcome.state === 'derrota' ? 'reconstrucao' : 'descanso', kills: 0, target: cfg.killTrigger, round: s.round + 1, lastEndedAt: now, startsAt: null, endsAt: null, by: null, enlisted: {} };
}
/** A cidade foi reconstruída: volta ao descanso. */
export const endRebuild = (s: WarState): WarState => (s.phase === 'reconstrucao' ? { ...s, phase: 'descanso' } : s);

// ---------------------------------------------------------------------------
// Placar de dano
// ---------------------------------------------------------------------------

/** Dano máximo plausível por segundo (a regra é gentil: o servidor só corta o que é impossível). */
export const maxDps = (weaponTier: number, bondLevel: number) => Math.round(1500 * (1 + 0.25 * (Math.max(1, weaponTier) - 1)) * (1 + Math.max(0, bondLevel) / 100));
/** O dano relatado num lote, limitado pelo que cabe no tempo (com 25% de folga para atraso de rede). */
export const plausibleDamage = (claimed: number, seconds: number, dps: number) => Math.max(0, Math.min(Math.round(claimed) || 0, Math.round(dps * Math.max(0, seconds) * 1.25)));
export type Scoreboard = Record<string, number>;
export function addDamage(board: Scoreboard, id: string, claimed: number, seconds: number, dps: number): Scoreboard {
  const add = plausibleDamage(claimed, seconds, dps);
  return add ? { ...board, [id]: (board[id] ?? 0) + add } : board;
}
/** Ranking: maior dano primeiro; empate por quem chegou antes ao alistamento, depois pelo id. Só alistados. */
export function ranking(board: Scoreboard, s: WarState): { id: string; damage: number }[] {
  return Object.entries(board).filter(([id]) => s.enlisted[id]).map(([id, damage]) => ({ id, damage }))
    .sort((a, b) => b.damage - a.damage || (s.enlisted[a.id].at - s.enlisted[b.id].at) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Prêmios
// ---------------------------------------------------------------------------

/** Título do campeão do placar: temporário (vale até a próxima guerra) e com buffs pequenos. */
export const WAR_TITLE = { id: 'defensor-supremo', label: 'Defensor Supremo', buff: { dmgPct: 3, xpPct: 3 } } as const;
export interface WarRewards {
  /** buff de drop e XP para o servidor inteiro */
  globalBuff: { dropPct: number; xpPct: number; minutes: number } | null;
  /** quem ganha o título (o 1º do placar) */
  titleTo: string | null;
  /** um MVP (chefe) aparece em algum canto do mundo */
  mvp: boolean;
  /** baús especiais que aparecem no Labirinto */
  chests: number;
  /** quem tem direito aos prêmios pessoais (alistado e com o dano mínimo) */
  eligible: string[];
}
export function warRewards(outcome: WarOutcome, board: Scoreboard, s: WarState, cfg: WarConfig): WarRewards {
  if (outcome.state !== 'vitoria') return { globalBuff: null, titleTo: null, mvp: false, chests: 0, eligible: [] };
  const rank = ranking(board, s), eligible = rank.filter((r) => r.damage >= cfg.minDamage).map((r) => r.id);
  return {
    globalBuff: outcome.glorious ? cfg.glorious : cfg.victory,
    titleTo: eligible[0] ?? null,
    mvp: true,
    chests: Math.min(30, 6 + Math.floor(eligible.length / 2)),
    eligible,
  };
}

// ---------------------------------------------------------------------------
// Reconstrução (depois de uma derrota)
// ---------------------------------------------------------------------------

/** Quantos jogadores ativos a meta de `AsterConfig.rebuild` considera como referência. */
export const REBUILD_REF_PLAYERS = 20;
/** A meta da reconstrução, escalada pelos jogadores ativos (de 25% a 300% da referência). */
export function rebuildGoalFor(base: AsterConfig['rebuild'], activePlayers: number): AsterConfig['rebuild'] {
  const k = Math.min(3, Math.max(0.25, activePlayers / REBUILD_REF_PLAYERS));
  return { crystals: Math.ceil(base.crystals * k), lumes: Math.ceil(base.lumes * k), materials: base.materials.map((m) => ({ ...m, qty: Math.max(1, Math.ceil(m.qty * k)) })) };
}
/** Pontos de uma entrega à guardiã (para o placar da reconstrução): o Cristal Ápice vale muito; Lumes, pouco. */
export const deliveryPoints = (d: Partial<RebuildProgress> & { materials?: number[] }) =>
  Math.round((d.crystals ?? 0) * 50 + (d.lumes ?? 0) * 0.02 + (d.materials ?? []).reduce((t, q) => t + Math.max(0, q), 0));
/** O melhor entregador do ciclo ganha a Lágrima da Rainha (precisa de um mínimo de pontos). */
export function lagrimaWinner(points: Record<string, number>, minPoints = 20): string | null {
  const best = Object.entries(points).filter(([, p]) => p >= minPoints).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
}
/** A Lágrima da Rainha: dura 3 dias; 1 por pessoa por ciclo. */
export const LAGRIMA = { key: 'lagrima-da-rainha', label: 'A Lágrima da Rainha', days: 3, buff: { dmgPct: 20, defPct: 20, xpPct: 30 } } as const;
