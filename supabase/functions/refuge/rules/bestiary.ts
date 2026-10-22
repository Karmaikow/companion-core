/**
 * Análise de Partículas — o bestiário do Companion. Cada monstro derrotado solta partículas da Bruma que o Companion
 * recolhe; com partículas suficientes de uma espécie, a análise revela tudo sobre ela. A primeira derrota de uma
 * espécie vira uma "Memória de Combate", e a análise completa vira outra. As linhas do bestiário entram no prompt da
 * IA para o Companion saber do que está falando.
 * Funções puras: o servidor (função refuge) e o modo offline usam as mesmas regras.
 */
import { ELEMENTS, type Element } from './identity.ts';
import { ARCHETYPES, TEMPERAMENTS, creatureStatsAt, type CreatureDef } from './creatures.ts';
import { affinity } from './combat/skills.ts';

/** Partículas para a análise completa de uma espécie. */
export const ANALYSIS_TARGET = 3;
/** Marcos da Análise de Partículas (espécies analisadas): cada um vira uma conquista. */
export const ANALYSIS_MILESTONES = [1, 3, 5, 10, 20];

export interface BestiaryEntry {
  slug: string;
  name: string;
  kills: number;
  particles: number;
  firstAt: string;
  lastAt: string;
}

/** Partículas que uma derrota rende (monstros mais fortes rendem mais). */
export function particlesFor(level: number): number {
  return level >= 10 ? 3 : level >= 5 ? 2 : 1;
}

/** 0..1 — quanto da espécie já foi analisado. */
export const analysisRatio = (e: Pick<BestiaryEntry, 'particles'>) => Math.min(1, e.particles / ANALYSIS_TARGET);
export const isAnalyzed = (e: Pick<BestiaryEntry, 'particles'>) => e.particles >= ANALYSIS_TARGET;

const ALL: Element[] = ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza', 'veneno'];

/** O que a análise revela, em camadas (1 partícula: o básico; 2: jeito de lutar; completa: fraquezas e o que solta). */
export interface Dossier {
  stage: 0 | 1 | 2 | 3;
  name: string;
  essence: string | null;
  temperament?: string;
  archetype?: string;
  skills?: string[];
  weakTo?: string[];
  resists?: string[];
  stats?: { vida: number; ataque: number; defesa: number };
  drops?: string[];
  description?: string;
}

export function dossier(def: CreatureDef, e: Pick<BestiaryEntry, 'particles'>, skillName: (slug: string) => string = (s) => s): Dossier {
  const stage = Math.min(3, Math.ceil((Math.max(0, e.particles) * 3) / ANALYSIS_TARGET)) as Dossier['stage'];
  const d: Dossier = { stage, name: def.name, essence: def.essence ? ELEMENTS[def.essence].label : null };
  if (d.stage >= 1) { d.temperament = TEMPERAMENTS[def.temperament].label; d.description = def.description; }
  if (d.stage >= 2) { d.archetype = ARCHETYPES[def.archetype].label; d.skills = def.skills.map((s) => skillName(s.slug)); }
  if (d.stage >= 3) {
    if (def.essence) {
      d.weakTo = ALL.filter((a) => affinity(a, def.essence) > 1).map((a) => ELEMENTS[a].label);
      d.resists = ALL.filter((a) => affinity(a, def.essence) < 1).map((a) => ELEMENTS[a].label);
    } else { d.weakTo = []; d.resists = []; }
    const st = creatureStatsAt(def, def.level[1]);
    d.stats = { vida: st.vida, ataque: st.poder, defesa: st.defesa };
    d.drops = def.drops.map((x) => x.item);
  }
  return d;
}

/** Linhas para o prompt da IA ("o que você já sabe dos monstros"). */
export function combatMemoryLines(entries: BestiaryEntry[], defs: CreatureDef[], max = 10): string[] {
  const by = new Map(defs.map((c) => [c.slug, c]));
  return [...entries].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, max).map((e) => {
    const def = by.get(e.slug);
    const pct = Math.round(analysisRatio(e) * 100);
    if (!def) return `- ${e.name}: derrotou ${e.kills}× (análise ${pct}%).`;
    const dz = dossier(def, e);
    const bits = [dz.essence ? `essência ${dz.essence}` : 'sem essência', dz.temperament?.toLowerCase()].filter(Boolean).join(', ');
    const extra = dz.stage >= 3 ? ` Fraco contra: ${dz.weakTo?.join(', ') || 'nada em especial'}. Resiste a: ${dz.resists?.join(', ') || 'nada'}. Solta: ${dz.drops?.join(', ') || 'nada'}.` : '';
    return `- ${e.name} (${bits}): derrotou ${e.kills}×, Análise de Partículas ${pct}%.${extra}`;
  });
}

/** Aplica uma derrota: devolve a entrada nova e o que aconteceu (primeira vez, análise completa, marco). */
export function recordKill(prev: BestiaryEntry | null, all: BestiaryEntry[], c: { slug: string; name: string; level: number }, nowIso: string) {
  const before = prev ?? { slug: c.slug, name: c.name, kills: 0, particles: 0, firstAt: nowIso, lastAt: nowIso };
  const entry: BestiaryEntry = { ...before, name: c.name, kills: before.kills + 1, particles: Math.min(ANALYSIS_TARGET * 4, before.particles + particlesFor(c.level)), lastAt: nowIso };
  const first = !prev;
  const analyzedNow = !isAnalyzed(before) && isAnalyzed(entry);
  const analyzedCount = all.filter((x) => x.slug !== c.slug && isAnalyzed(x)).length + (isAnalyzed(entry) ? 1 : 0);
  const milestone = analyzedNow && ANALYSIS_MILESTONES.includes(analyzedCount) ? analyzedCount : null;
  return { entry, first, analyzedNow, analyzedCount, milestone };
}

/** Textos das Memórias de Combate (terceira pessoa, como as outras memórias). */
export function combatMemoryText(kind: 'first' | 'analyzed', me: string, def: CreatureDef | null, name: string, level: number): string {
  if (kind === 'first') return `${me} enfrentou e derrotou um(a) ${name} pela primeira vez (nível ${level})${def?.essence ? `, uma criatura de ${ELEMENTS[def.essence].label.toLowerCase()}` : ''}. [Memória de Combate]`;
  const dz = def ? dossier(def, { particles: ANALYSIS_TARGET }) : null;
  return `${me} completou a Análise de Partículas de ${name}${dz && dz.weakTo?.length ? `: é fraco contra ${dz.weakTo.join(', ').toLowerCase()}` : ''}${dz && dz.drops?.length ? `; costuma soltar ${dz.drops.join(', ').toLowerCase()}` : ''}. [Memória de Combate]`;
}
