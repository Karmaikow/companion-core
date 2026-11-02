/**
 * Estado do combo e do Estilo no cliente (as regras ficam em @rules/combat/combos): o último acerto abre a janela, a
 * barra e o golpe básico perguntam aqui se o próximo aperto vira finalizador, e o HUD lê a nota de Estilo.
 * Também guarda o "peso" do golpe: pausa de impacto e tremida de câmera.
 */
import {
  COMBO_CHAIN_GAP, COMBO_PERFECT_BONUS, COMBO_WINDOW, STYLE_GAIN, comboNext, comboTiming, findComboLink, finisherBySlug, infuse,
  styleAdd, styleDecay, styleHurt, styleRank, type ComboTiming, type Element, type SkillDef, type WeaponKind,
} from '@rules';

export const combo = {
  /** último acerto: o que acertou e quando (performance.now) */
  last: null as null | { slug: string; at: number },
  /** golpes básicos seguidos no ritmo (para o Corte Duplo) */
  basics: 0,
  /** acertos no combo atual (o contador na tela) */
  hits: 0,
  points: 0,
  /** nome que pisca no HUD (finalizador, Perfeito!) */
  flash: null as null | { text: string; at: number; perfect: boolean },
  /** sobe a cada mudança (o HUD redesenha) */
  ver: 0,
};

/** Algo acertou um alvo: abre a janela e soma no combo e no Estilo. */
export function registerHit(slug: string, finisher = false) {
  const now = performance.now();
  const chained = combo.last && now - combo.last.at < COMBO_CHAIN_GAP * 1000;
  combo.hits = chained ? combo.hits + 1 : 1;
  // golpe básico no meio da janela de uma técnica (o automático da Companion) conta no combo, mas não fecha a janela
  const keep = slug === 'basic' && combo.last && combo.last.slug !== 'basic' && now - combo.last.at < COMBO_WINDOW.close * 1000;
  combo.basics = slug === 'basic' ? (chained && combo.last?.slug === 'basic' ? combo.basics + 1 : 1) : 0;
  if (!keep) combo.last = { slug, at: now };
  combo.points = styleAdd(combo.points, finisher ? STYLE_GAIN.finisher : STYLE_GAIN.hit);
  combo.ver++;
}

/** Em que ponto da janela estamos agora. */
export function timingNow(): ComboTiming {
  return combo.last ? comboTiming((performance.now() - combo.last.at) / 1000) : 'fechada';
}

/**
 * O aperto vira finalizador? Devolve a técnica já infundida e o multiplicador do perfeito; marca no HUD e no Estilo.
 * `press`: slug da técnica apertada ou "basic".
 */
export function tryCombo(press: string, weapon: WeaponKind | null | undefined, essence: Element | null): { skill: SkillDef; mult: number; perfect: boolean } | null {
  const t = timingNow();
  if (t === 'cedo' || t === 'fechada') return null;
  const link = findComboLink(combo.last?.slug ?? null, press, weapon, combo.basics);
  const fin = link && finisherBySlug(link.becomes);
  if (!fin) return null;
  const perfect = t === 'perfeita';
  combo.flash = { text: perfect ? `${fin.name} · Perfeito!` : fin.name, at: performance.now(), perfect };
  if (perfect) combo.points = styleAdd(combo.points, STYLE_GAIN.perfect);
  combo.basics = 0;
  combo.ver++;
  return { skill: infuse(fin, essence), mult: perfect ? COMBO_PERFECT_BONUS : 1, perfect };
}

/** Slugs que continuam o combo agora (acendem na barra); `perfect` = estamos no ponto perfeito. */
export function comboGlow(weapon: WeaponKind | null | undefined): { press: Set<string>; perfect: boolean } | null {
  const t = timingNow();
  if (t === 'cedo' || t === 'fechada') return null;
  const next = comboNext(combo.last?.slug ?? null, weapon, combo.basics);
  return next.length ? { press: new Set(next.map((l) => l.press)), perfect: t === 'perfeita' } : null;
}

/** O Companion apanhou: o Estilo cai (no máximo uma vez a cada 0,8 s) e o contador zera; a janela do combo continua. */
let hurtAt = 0;
export function comboHurt() {
  const now = performance.now();
  if (now - hurtAt < 800) return;
  hurtAt = now;
  combo.points = styleHurt(combo.points); combo.hits = 0; combo.ver++;
}

/** Tempo correndo: o Estilo escorre quando ninguém acerta nada. */
export function tickStyle(dt: number) {
  if (combo.points <= 0) return;
  const since = combo.last ? (performance.now() - combo.last.at) / 1000 : 99;
  const next = styleDecay(combo.points, since, dt);
  if (next !== combo.points) { const before = styleRank(combo.points).letter; combo.points = next; if (styleRank(next).letter !== before || next === 0) combo.ver++; }
  if (since > 2.5 && combo.hits) { combo.hits = 0; combo.ver++; }
}

export const styleNow = () => styleRank(combo.points);

/** A pessoa agiu (barra ou ataque): a Companion para de lançar habilidades sozinha por um tempo, para não atropelar o combo. */
export const playerAct = { at: -1e9 };
export const markPlayerAct = () => { playerAct.at = performance.now(); };
export const playerFighting = () => performance.now() - playerAct.at < 4000;

// ---------------------------------------------------------------------------
// Peso do golpe
// ---------------------------------------------------------------------------

export const impact = { stopUntil: 0, shakeUntil: 0, shakeAmp: 0 };
/** Pausa de impacto (ms): o tempo do Companion e dos monstros quase para. */
export function hitStop(ms: number) { impact.stopUntil = Math.max(impact.stopUntil, performance.now() + ms); }
/** Tremida de câmera. */
export function shake(amp: number, ms: number) {
  const now = performance.now();
  impact.shakeAmp = now < impact.shakeUntil ? Math.max(amp, impact.shakeAmp) : amp;
  impact.shakeUntil = Math.max(impact.shakeUntil, now + ms);
}
/** Fator do tempo agora (0,06 durante a pausa de impacto). */
export const timeScale = () => (performance.now() < impact.stopUntil ? 0.06 : 1);
