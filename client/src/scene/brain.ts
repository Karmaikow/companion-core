/**
 * "Cérebro" da Companion no mundo: as ordens que ela recebeu (atacar, fugir, caçar N, ir até um lugar), as falas
 * espontâneas (com intervalo mínimo e a frequência dos Ajustes) e o que ela já viu. O laço do Companion
 * (CompanionModel) lê as ordens; as criaturas e o mundo avisam o que acontece (`notify`).
 */
import { bark, normalize, parseCommand, type BarkEvent, type Command, type CreatureDef } from '@rules';
import { useGame } from '../store';
import { settings } from '../settings';

export type Order =
  | { kind: 'attack'; until: number }
  | { kind: 'flee'; until: number }
  | { kind: 'hunt'; count: number; done: number; creature: string | null; creatureName: string | null; place: { name: string; x: number; z: number } | null; arrived: boolean }
  | { kind: 'goto'; name: string; x: number; z: number; call: boolean };

export interface Place { name: string; x: number; z: number }

export const brain = {
  order: null as Order | null,
  /** lugares conhecidos do mundo (pedras-guia e nomes de região) */
  places: [] as Place[],
  /** criaturas do catálogo (nome → slug), para "mate 10 Brumas de Musgo" */
  creatures: [] as { slug: string; name: string }[],
  /** o catálogo completo (Bestiário) */
  defs: [] as CreatureDef[],
  /** criaturas já vistas nesta sessão (para "nunca vi isso!") */
  seen: new Set<string>(),
  lastBark: 0,
  nextIdle: performance.now() + 40_000,
  lowHpSaid: 0,
};

const GAP: Record<string, number> = { muito: 3500, normal: 7000, pouco: 15000, nunca: Infinity };
const IDLE: Record<string, [number, number]> = { muito: [25_000, 45_000], normal: [50_000, 90_000], pouco: [120_000, 200_000], nunca: [Infinity, Infinity] };

/** Fala da Companion (balão + voz, se ligada). `force` ignora o intervalo (respostas a ordens). */
export function say(ev: BarkEvent, vars: Parameters<typeof bark>[1] = {}, opts: { force?: boolean; chance?: number } = {}) {
  const chatter = settings().chatter;
  if (chatter === 'nunca' && !opts.force) return;
  const now = performance.now();
  if (!opts.force && now - brain.lastBark < GAP[chatter]) return;
  if (opts.chance !== undefined && Math.random() > opts.chance) return;
  const snap = useGame.getState().snap, d = snap?.companion?.discoveries;
  const text = bark(ev, { you: d?.playerAddress ?? d?.playerName, ...vars }, d?.traits ?? [], Math.random(), d?.pronoun === 'ele' ? 'ele' : 'ela');
  brain.lastBark = now;
  useGame.getState().sayBark(text);
}

/** Fala de passeio de vez em quando (chamada pelo laço do Companion). */
export function idleChatter(ctx: { raining: boolean; night: boolean }) {
  const now = performance.now();
  if (now < brain.nextIdle) return;
  const [a, b] = IDLE[settings().chatter];
  brain.nextIdle = now + a + Math.random() * (b - a);
  if (!Number.isFinite(a)) return;
  say(ctx.raining && Math.random() < 0.5 ? 'idle-rain' : ctx.night && Math.random() < 0.5 ? 'idle-night' : 'idle');
}

/** Acha um lugar pelo nome (pedra-guia ou região). */
export function findPlace(name: string): Place | null {
  const k = normalize(name);
  return brain.places.find((p) => normalize(p.name) === k) ?? null;
}

/** Entende uma ordem do chat e já reage (fala + ordem). Devolve o comando entendido (ou null). */
export function handleCommand(text: string): Command | null {
  const names = brain.creatures.flatMap((c) => [c.name, c.name.split(' ')[0]]);
  const cmd = parseCommand(text, { places: brain.places.map((p) => p.name), creatures: names });
  if (!cmd) return null;
  const now = performance.now();
  switch (cmd.kind) {
    case 'attack': brain.order = { kind: 'attack', until: now + 60_000 }; say('order-attack', {}, { force: true }); break;
    case 'flee': brain.order = { kind: 'flee', until: now + 7_000 }; say('order-flee', {}, { force: true }); break;
    case 'stop': brain.order = null; say('order-stop', {}, { force: true }); break;
    case 'calm': brain.order = null; useSettingsPosture('pacifica'); say('order-calm', {}, { force: true }); break;
    case 'gather': say('order-gather', { n: cmd.count }, { force: true }); break;
    case 'goto': {
      const p = findPlace(cmd.place);
      if (!p) return null;
      brain.order = { kind: 'goto', name: p.name, x: p.x, z: p.z, call: cmd.call };
      if (cmd.call) try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* sem notificação */ }
      say('order-goto', { p: p.name }, { force: true });
      break;
    }
    case 'hunt': {
      const c = cmd.creature ? brain.creatures.find((x) => normalize(x.name) === normalize(cmd.creature!) || normalize(x.name).startsWith(normalize(cmd.creature!))) ?? null : null;
      const p = cmd.place ? findPlace(cmd.place) : null;
      brain.order = { kind: 'hunt', count: cmd.count, done: 0, creature: c?.slug ?? null, creatureName: c?.name ?? null, place: p, arrived: !p };
      say('order-hunt', { n: cmd.count }, { force: true });
      break;
    }
  }
  return cmd;
}

function useSettingsPosture(p: 'pacifica' | 'defensiva' | 'cacadora') { settings().set({ posture: p }); }

/** Uma criatura foi derrotada pela Companion: conta para a caçada. */
export function onKill(slug: string, name: string) {
  const o = brain.order;
  if (o?.kind === 'hunt' && (!o.creature || o.creature === slug)) {
    o.done++;
    if (o.done >= o.count) {
      say('hunt-done', { n: o.done, m: name }, { force: true });
      useGame.getState().toast(`Missão cumprida: ${o.done} ${o.creatureName ?? 'criatura'}${o.done > 1 ? 's' : ''} derrotada${o.done > 1 ? 's' : ''}!`, 'gold');
      notifyPlayer('Missão cumprida!', `${o.done} derrotada${o.done > 1 ? 's' : ''}.`);
      brain.order = null;
    } else if (o.count >= 5 && (o.done % Math.max(1, Math.round(o.count / 4)) === 0)) say('hunt-progress', { n: o.done, t: o.count }, { force: true });
  }
}

/** Avisa a pessoa mesmo com a aba em segundo plano (notificação do navegador, se permitida). */
export function notifyPlayer(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined' || !document.hidden) return;
    if (Notification.permission === 'granted') new Notification(title, { body });
  } catch { /* sem notificação */ }
}
