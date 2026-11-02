/**
 * Combos e Estilo — o corpo a corpo no ritmo (hack and slash).
 *
 * Combo: cada acerto abre uma janela curta. Apertar a técnica certa dentro dela (a que continua a sequência) sai um
 * finalizador — uma técnica que só existe dentro do combo (Lançador, Redemoinho Aéreo...). No meio da janela fica o
 * ponto perfeito: acertar ali dá +30% de dano. Fora da janela, a técnica sai normal (se não estiver recarregando).
 * O finalizador ignora a recarga da técnica apertada (é ela que continua a sequência), mas gasta o SP dele.
 *
 * Estilo: um medidor que sobe com acertos (mais com combos e no perfeito), escorre depois de um tempo parado e cai
 * quando o Companion apanha. Cada nota dá um bônus pequeno de dano e de SP: D Desperto → S Soberano.
 * Tudo puro: o cliente marca os tempos e lê daqui.
 */
import type { SkillDef, SkillShape, WeaponKind } from './skills.ts';

/** Janela depois do acerto (s): cedo demais não conta; o meio é o perfeito. */
export const COMBO_WINDOW = { open: 0.12, perfectFrom: 0.3, perfectTo: 0.55, close: 0.95 } as const;
export const COMBO_PERFECT_BONUS = 1.3;
/** acertos seguidos contam no mesmo combo enquanto não passar esse tempo entre um e outro (s) */
export const COMBO_CHAIN_GAP = 2.5;

export type ComboTiming = 'cedo' | 'aberta' | 'perfeita' | 'fechada';
export function comboTiming(sinceHit: number): ComboTiming {
  const w = COMBO_WINDOW;
  if (sinceHit < w.open) return 'cedo';
  if (sinceHit > w.close) return 'fechada';
  return sinceHit >= w.perfectFrom && sinceHit <= w.perfectTo ? 'perfeita' : 'aberta';
}

const F = (slug: string, name: string, weapon: WeaponKind, shape: SkillShape, o: Partial<SkillDef> & { description: string }): SkillDef => ({
  slug, name, slot: 'technique', weapon, essence: null, shape, classes: [], bodies: [], range: 2, radius: 1, angle: 60, power: 0, heal: 0, energy: 10,
  cooldown: 0.5, windup: 0.08, status: null, anim: weapon === 'arco' ? 'shoot' : 'attack', vfx: { style: 'impacto', color: 'essence', ground: false }, unlockBond: 1,
  modality: 'fisica', ...o,
});

/** Finalizadores: só saem dentro de um combo (não vão para a barra). */
export const COMBO_FINISHERS: SkillDef[] = [
  F('espada-corte-duplo', 'Corte Duplo', 'espada', 'melee', { description: 'Terceiro golpe no ritmo: dois cortes cruzados de uma vez.', power: 75, energy: 0, range: 2 }),
  F('espada-lancador', 'Lançador', 'espada', 'melee', { description: 'Estocada → Golpe Ascendente: joga o inimigo para o alto e o deixa atordoado.', power: 110, energy: 12, range: 2.2, status: { key: 'atordoado', chance: 1, seconds: 2 } }),
  F('espada-redemoinho-aereo', 'Redemoinho Aéreo', 'espada', 'aura', { description: 'Lançador → Corte Giratório: salta girando e corta tudo em volta.', power: 140, energy: 15, radius: 2.8, anim: 'jump', vfx: { style: 'impacto', color: 'essence', ground: true } }),
  F('espada-estocada-relampago', 'Estocada Relâmpago', 'espada', 'dash', { description: 'Investida → Estocada: atravessa o alvo num piscar e para atrás dele.', power: 120, energy: 12, range: 6.5, radius: 0.8, anim: 'run' }),
  F('arco-tiro-duplo', 'Tiro Duplo', 'arco', 'projectile', { description: 'Tiro Preciso → Tiro Preciso no ritmo: duas flechas no mesmo ponto.', power: 120, energy: 8, range: 14, radius: 0.4 }),
  F('cajado-prisao-runica', 'Prisão Rúnica', 'cajado', 'circle', { description: 'Seta Arcana → Selo Rúnico: o selo cai em cima do alvo marcado e o prende de vez.', power: 130, energy: 14, range: 10, radius: 2.4, windup: 0.3, modality: 'magica', status: { key: 'enraizado', chance: 1, seconds: 2.5 }, anim: 'attack', vfx: { style: 'luz', color: 'essence', ground: true } }),
  F('arco-chuva-cruzada', 'Chuva Cruzada', 'arco', 'circle', { description: 'Leque → Chuva: duas chuvas que se cruzam numa área maior.', power: 95, energy: 15, range: 12, radius: 3.2, windup: 0.4, vfx: { style: 'impacto', color: 'essence', ground: true } }),
];

export interface ComboLink {
  weapon: WeaponKind;
  /** o que acertou por último ("basic" = golpe básico) */
  from: string;
  /** o que foi apertado dentro da janela */
  press: string;
  /** o finalizador que sai */
  becomes: string;
  /** golpes básicos seguidos exigidos antes (só para from = basic) */
  basics?: number;
}

export const COMBO_LINKS: ComboLink[] = [
  { weapon: 'espada', from: 'basic', press: 'basic', becomes: 'espada-corte-duplo', basics: 2 },
  { weapon: 'espada', from: 'espada-estocada', press: 'espada-golpe-ascendente', becomes: 'espada-lancador' },
  { weapon: 'espada', from: 'espada-lancador', press: 'espada-corte-giratorio', becomes: 'espada-redemoinho-aereo' },
  { weapon: 'espada', from: 'espada-investida-da-lamina', press: 'espada-estocada', becomes: 'espada-estocada-relampago' },
  { weapon: 'arco', from: 'arco-tiro-preciso', press: 'arco-tiro-preciso', becomes: 'arco-tiro-duplo' },
  { weapon: 'cajado', from: 'cajado-seta-arcana', press: 'cajado-selo-runico', becomes: 'cajado-prisao-runica' },
  { weapon: 'arco', from: 'arco-leque-de-flechas', press: 'arco-chuva-de-flechas', becomes: 'arco-chuva-cruzada' },
];

export const finisherBySlug = (slug: string) => COMBO_FINISHERS.find((f) => f.slug === slug) ?? null;

/** O elo que continua a sequência: o último acerto, o que foi apertado, a arma e quantos básicos seguidos. */
export function findComboLink(last: string | null, press: string, weapon: WeaponKind | null | undefined, basics = 0): ComboLink | null {
  if (!last || !weapon) return null;
  return COMBO_LINKS.find((l) => l.weapon === weapon && l.from === last && l.press === press && (l.basics ?? 0) <= basics) ?? null;
}

/** O que continua o combo a partir deste acerto (para acender os botões certos). */
export function comboNext(last: string | null, weapon: WeaponKind | null | undefined, basics = 0): ComboLink[] {
  if (!last || !weapon) return [];
  return COMBO_LINKS.filter((l) => l.weapon === weapon && l.from === last && (l.basics ?? 0) <= basics);
}

// ---------------------------------------------------------------------------
// Estilo
// ---------------------------------------------------------------------------

export interface StyleRank { letter: 'D' | 'C' | 'B' | 'A' | 'S'; label: string; min: number; damage: number; sp: number; color: string }
export const STYLE_RANKS: StyleRank[] = [
  { letter: 'D', label: 'Desperto', min: 0, damage: 1, sp: 1, color: '#c9d2e0' },
  { letter: 'C', label: 'Certeiro', min: 25, damage: 1.04, sp: 1.1, color: '#8fd3ff' },
  { letter: 'B', label: 'Bravo', min: 60, damage: 1.08, sp: 1.25, color: '#7be36b' },
  { letter: 'A', label: 'Ardente', min: 105, damage: 1.12, sp: 1.4, color: '#ffb347' },
  { letter: 'S', label: 'Soberano', min: 160, damage: 1.18, sp: 1.6, color: '#ffd84d' },
];
export const STYLE_MAX = 200;
/** pontos por acerto: golpe/técnica, finalizador, e o extra do perfeito */
export const STYLE_GAIN = { hit: 5, finisher: 16, perfect: 10 } as const;
/** parado sem acertar por esse tempo (s), o Estilo escorre `decay` pontos por segundo */
export const STYLE_IDLE = 2.5, STYLE_DECAY = 18;
/** apanhar tira essa fração dos pontos */
export const STYLE_HURT_LOSS = 0.4;

export function styleRank(points: number): StyleRank {
  let r = STYLE_RANKS[0];
  for (const x of STYLE_RANKS) if (points >= x.min) r = x;
  return r;
}
export const styleAdd = (points: number, gain: number) => Math.min(STYLE_MAX, Math.max(0, points + gain));
/** Pontos depois de `dt` s, sabendo há quanto tempo foi o último acerto. */
export function styleDecay(points: number, sinceHit: number, dt: number): number {
  return sinceHit < STYLE_IDLE ? points : Math.max(0, points - STYLE_DECAY * dt);
}
export const styleHurt = (points: number) => Math.round(points * (1 - STYLE_HURT_LOSS));
