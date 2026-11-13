/**
 * "Cérebro" da Companion no mundo: as ordens que ela recebeu (atacar, fugir, caçar N, ir até um lugar), as falas
 * espontâneas (com intervalo mínimo e a frequência dos Ajustes) e o que ela já viu. O laço do Companion
 * (CompanionModel) lê as ordens; as criaturas e o mundo avisam o que acontece (`notify`).
 */
import { BANK_EVENTS, DEFAULT_INTENT, bark, fillBark, normalize, parseCommand, type BarkEvent, type BarkVars, type Command, type CreatureDef } from '@rules';
import { useGame } from '../store';
import { settings } from '../settings';
import { useEcos, intentFromCommand } from '../ecos/ecosStore';
import { useChests } from '../chests/chestStore';
import { companionFocus } from './world';
import { releaseControl } from './comboState';

export type Order =
  | { kind: 'attack'; until: number }
  | { kind: 'flee'; until: number }
  | { kind: 'hunt'; count: number; done: number; creature: string | null; creatureName: string | null; place: { name: string; x: number; z: number } | null; arrived: boolean }
  | { kind: 'goto'; name: string; x: number; z: number; call: boolean }
  | ClearOrder;

/**
 * "Limpe a área": luta até não sobrar monstro dentro do raio, recolhe (baús e recursos) e segue para a próxima área.
 * Repete até a pessoa mandar parar. `x,z` é o centro da área atual.
 */
export interface ClearOrder {
  kind: 'clear'; phase: 'fight' | 'gather' | 'move';
  x: number; z: number; radius: number;
  /** segundos sem nenhum monstro vivo na área (só passa para a coleta depois de um instante de calma) */
  calm: number;
  /** há quanto tempo está na fase de coleta, e os baús que já tentou abrir */
  gatherT: number; chests: string[]; gathering: boolean;
  next: Place | null; visited: string[]; areas: number; kills: number;
}
export const CLEAR_RADIUS = 22;

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

// ---- falas pela IA: estoque por evento (sai na hora) + falas de momento escritas com o contexto

const BANK_KEY = 'companion-core:barks:';
const bank = { cid: '', lines: {} as Record<string, string[]>, recent: [] as string[], pending: new Set<string>(), inflight: false, timer: 0, failUntil: 0, lastFill: 0 };

/** As falas vêm da IA? (Ajuste ligado, servidor online e Companion desperta) */
function aiOn() {
  const g = useGame.getState();
  return settings().barkSource === 'ia' && !!g.backend?.barks && g.snap?.companion?.stage === 'awakened';
}
function syncBank() {
  const cid = useGame.getState().snap?.companion?.id ?? '';
  if (cid === bank.cid) return;
  bank.cid = cid; bank.lines = {}; bank.recent = []; bank.pending.clear();
  try { const v = JSON.parse(localStorage.getItem(BANK_KEY + cid) ?? 'null'); if (v?.lines) { bank.lines = v.lines; bank.recent = v.recent ?? []; } } catch { /* vazio */ }
}
function saveBank() { try { localStorage.setItem(BANK_KEY + bank.cid, JSON.stringify({ lines: bank.lines, recent: bank.recent.slice(-30) })); } catch { /* só nesta sessão */ } }
function scheduleFill(delay = 1500) {
  if (bank.timer) return;
  const wait = Math.max(delay, bank.lastFill + 20_000 - performance.now(), bank.failUntil - performance.now());
  bank.timer = window.setTimeout(() => { bank.timer = 0; void fill(); }, Math.max(0, wait));
}
async function fill() {
  const b = useGame.getState().backend;
  if (!aiOn() || !b?.barks || bank.inflight || !bank.pending.size) return;
  const cid = bank.cid, evs = [...bank.pending].slice(0, 8);
  evs.forEach((e) => bank.pending.delete(e));
  bank.inflight = true; bank.lastFill = performance.now();
  try {
    const r = await b.barks({ mode: 'bank', events: evs, recent: bank.recent.slice(-20) });
    if (cid !== bank.cid) return;
    for (const [ev, list] of Object.entries(r.lines ?? {})) bank.lines[ev] = [...(bank.lines[ev] ?? []), ...list].slice(-12);
    saveBank();
  } catch { evs.forEach((e) => bank.pending.add(e)); bank.failUntil = performance.now() + 120_000; } finally { bank.inflight = false; }
  if (bank.pending.size) scheduleFill(20_000);
}
/** Prepara o estoque (ao entrar no mundo): pede o que estiver faltando, em lotes. */
export function primeBarks() {
  syncBank();
  if (!aiOn()) return;
  for (const ev of BANK_EVENTS) if ((bank.lines[ev]?.length ?? 0) < 3) bank.pending.add(ev);
  if (bank.pending.size) scheduleFill(3000);
}
function takeFromBank(ev: BarkEvent): string | null {
  syncBank();
  if (!aiOn() || !BANK_EVENTS.includes(ev)) return null;
  const arr = bank.lines[ev] ?? [];
  if (arr.length < 2) { bank.pending.add(ev); scheduleFill(); }
  if (!arr.length) return null;
  const line = arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
  bank.recent.push(line); if (bank.recent.length > 40) bank.recent.shift();
  saveBank();
  return line;
}

function persona() {
  const d = useGame.getState().snap?.companion?.discoveries;
  return { d, you: d?.playerAddress ?? d?.playerName, pronoun: (d?.pronoun === 'ele' ? 'ele' : 'ela') as 'ela' | 'ele' };
}
function emit(text: string) { brain.lastBark = performance.now(); useGame.getState().sayBark(text); }
const emitNow = emit;

/** Fala da Companion (balão + voz, se ligada). `force` ignora o intervalo (respostas a ordens). */
export function say(ev: BarkEvent, vars: BarkVars = {}, opts: { force?: boolean; chance?: number } = {}) {
  const chatter = settings().chatter;
  if (chatter === 'nunca' && !opts.force) return;
  const now = performance.now();
  if (!opts.force && now - brain.lastBark < GAP[chatter]) return;
  if (opts.chance !== undefined && Math.random() > opts.chance) return;
  const p = persona();
  const ai = takeFromBank(ev);
  emit(ai ? fillBark(ai, { you: p.you, ...vars }, p.pronoun) : bark(ev, { you: p.you, ...vars }, p.d?.traits ?? [], Math.random(), p.pronoun));
}

/**
 * Momento especial (ver uma criatura nova, terminar uma análise, cumprir missão, chegar num lugar): a IA escreve a
 * fala na hora, com o que ela sabe. Se demorar mais de 4,5 s (ou estiver offline), sai uma fala do estoque/pronta.
 */
export function sayMoment(ev: BarkEvent, vars: BarkVars = {}, slug?: string) {
  if (settings().chatter === 'nunca') return;
  const b = useGame.getState().backend;
  if (!aiOn() || !b?.barks) return say(ev, vars, { force: true });
  brain.lastBark = performance.now(); // segura as outras falas enquanto ela "pensa"
  let done = false;
  const fallback = () => { if (done) return; done = true; say(ev, vars, { force: true }); };
  const timer = window.setTimeout(fallback, 4500);
  b.barks({ mode: 'moment', event: ev, vars: { m: vars.m, p: vars.p, n: vars.n, t: vars.t }, slug })
    .then((r) => { if (done) return; clearTimeout(timer); if (!r.line) return fallback(); done = true; const p = persona(); emit(fillBark(r.line, { you: p.you, ...vars }, p.pronoun)); })
    .catch(() => { clearTimeout(timer); fallback(); });
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
  // uma ordem é para agora: não espera o tempo de "a pessoa está no controle"
  releaseControl();
  switch (cmd.kind) {
    case 'attack': brain.order = { kind: 'attack', until: now + 60_000 }; say('order-attack', {}, { force: true }); break;
    case 'flee': brain.order = { kind: 'flee', until: now + 7_000 }; say('order-flee', {}, { force: true }); break;
    case 'stop': brain.order = null; if (useEcos.getState().auto.on) useEcos.getState().stopIntent(); say('order-stop', {}, { force: true }); break;
    case 'clear': {
      brain.order = { kind: 'clear', phase: 'fight', x: companionFocus.x, z: companionFocus.z, radius: CLEAR_RADIUS, calm: 0, gatherT: 0, chests: [], gathering: false, next: null, visited: [], areas: 0, kills: 0 };
      emitNow('Deixa comigo! Vou limpar esta área: derrubo o que tiver, recolho tudo e sigo para a próxima. É só dizer "pare".');
      break;
    }
    case 'calm': brain.order = null; useSettingsPosture('pacifica'); say('order-calm', {}, { force: true }); break;
    case 'gather': {
      // Ecos da Terra: no mundo, com corpo, ela coleta por intenção (abastecer) com o que estiver por perto
      const g = useGame.getState();
      if (g.backend?.ecos && g.snap?.companion?.stage === 'awakened' && brain.places.length) {
        const intent = intentFromCommand(cmd.what, cmd.count);
        useEcos.getState().startIntent(intent);
        emitNow(`Deixa comigo! ${intent.target?.label ?? 'Coletar'}: ${cmd.count}. Vou procurar por aqui.`);
      } else say('order-gather', { n: cmd.count }, { force: true });
      break;
    }
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

/**
 * Um passo da ordem "limpe a área" (chamado pelo laço da Companion a cada decisão, só quando ela está agindo
 * sozinha). `inArea`: monstros vivos dentro do raio da área atual. Devolve o que ela deve fazer agora.
 */
export function tickClear(o: ClearOrder, me: { x: number; z: number }, inArea: number, dt: number): void {
  // a pessoa a levou para longe enquanto controlava: a área passa a ser onde ela está agora
  if (o.phase !== 'move' && Math.hypot(me.x - o.x, me.z - o.z) > o.radius + 12) { o.x = me.x; o.z = me.z; o.phase = 'fight'; o.calm = 0; }
  if (o.phase === 'fight') {
    o.calm = inArea > 0 ? 0 : o.calm + dt;
    if (o.calm >= 1.5) { o.phase = 'gather'; o.gatherT = 0; o.gathering = false; }
    return;
  }
  if (o.phase === 'gather') {
    // apareceu monstro de novo: volta a lutar (a coleta espera)
    if (inArea > 0) { if (useEcos.getState().auto.on) useEcos.getState().stopIntent(); o.phase = 'fight'; o.calm = 0; return; }
    o.gatherT += dt;
    // 1) baús da área, um de cada vez (o que não couber na bolsa fica: não insiste no mesmo)
    const ch = useChests.getState();
    if (ch.going || ch.opening) return;
    const chest = ch.chests.find((c) => c.state !== 'vazio' && c.expiresAt > Date.now() && !o.chests.includes(c.id) && Math.hypot(c.x - o.x, c.z - o.z) <= o.radius + 4);
    if (chest) { o.chests.push(chest.id); ch.open(chest.id); return; }
    // 2) recursos por perto (Ecos da Terra), no modo "explorar": pega o que serve e para sozinha
    const eco = useEcos.getState(), g = useGame.getState();
    const canGather = !!g.backend?.ecos && g.snap?.companion?.stage === 'awakened';
    if (canGather && !o.gathering) { o.gathering = true; eco.startIntent({ ...DEFAULT_INTENT, mode: 'explorar', target: null }); return; }
    // terminou (ou passou do tempo procurando sem achar): próxima área
    if (o.gathering && eco.auto.on && o.gatherT < 20) return;
    if (eco.auto.on) eco.stopIntent();
    o.areas++; o.visited.push(`${Math.round(o.x / 20)},${Math.round(o.z / 20)}`);
    o.next = nextArea(o, me);
    o.phase = 'move';
    emitNow(o.next.name ? `Área limpa! Agora vou para ${o.next.name}.` : 'Área limpa! Vou para a próxima.');
    return;
  }
  // move: o WorldScene leva até `next`; chegou → a área nova começa
  if (o.next && Math.hypot(me.x - o.next.x, me.z - o.next.z) < 7) { o.x = o.next.x; o.z = o.next.z; o.next = null; o.phase = 'fight'; o.calm = 0; }
}

/** A próxima área: o lugar conhecido mais perto ainda não limpo; sem lugar, um trecho adiante (em espiral). */
function nextArea(o: ClearOrder, me: { x: number; z: number }): Place {
  const seen = (x: number, z: number) => o.visited.includes(`${Math.round(x / 20)},${Math.round(z / 20)}`);
  let best: Place | null = null, bd = Infinity;
  for (const p of brain.places) {
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d > o.radius * 1.2 && d < 160 && d < bd && !seen(p.x, p.z)) { bd = d; best = p; }
  }
  if (best) return best;
  const a = o.areas * 2.399963, step = o.radius * 2;
  return { name: '', x: o.x + Math.cos(a) * step, z: o.z + Math.sin(a) * step };
}

/** Uma criatura foi derrotada pela Companion: conta para a caçada. */
export function onKill(slug: string, name: string) {
  const o = brain.order;
  if (o?.kind === 'clear') o.kills++;
  if (o?.kind === 'hunt' && (!o.creature || o.creature === slug)) {
    o.done++;
    if (o.done >= o.count) {
      sayMoment('hunt-done', { n: o.done, m: name });
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
