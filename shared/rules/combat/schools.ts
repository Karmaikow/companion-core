/** Additive school foundation. No school is open and no legacy skill is migrated. */
import type { Element } from '../identity';

export const ESSENCE_ORIGINS = {
  frost: 'gelo', flame: 'fogo', storm: 'raio', stone: 'terra', verdant: 'natureza',
  void: 'sombra', aether: 'vento', tide: 'agua', lumen: 'luz', hive: 'veneno',
} as const satisfies Record<string, Element>;
export const ESSENCE_LABELS: Record<Element, string> = {
  gelo: 'Gelo', fogo: 'Fogo', raio: 'Raio', terra: 'Terra', natureza: 'Natureza',
  sombra: 'Sombra', vento: 'Vento', agua: 'Água', luz: 'Luz', veneno: 'Veneno',
};
export const SCHOOL_IDS = ['arcane', 'blood', 'forge', 'ink', 'chrono'] as const;
export type SchoolId = typeof SCHOOL_IDS[number];
export const SCHOOL_DEFINITIONS = {
  arcane: { label: 'Arcana', themes: ['runas', 'selos', 'magia', 'descoberta'], items: ['Fragmento Rúnico', 'Pó Cristalino', 'Núcleo Arcano'], title: 'Arquimago' },
  blood: { label: 'Sangue', themes: ['protecao', 'sacrificio', 'vitalidade', 'pacto'], items: ['Seiva Vital', 'Cristal Rubro', 'Selo de Pacto'], title: 'Guardião do Pacto' },
  forge: { label: 'Forja', themes: ['minerais', 'criacao', 'reparo', 'metal'], items: ['Minério Temperável', 'Carvão Denso', 'Núcleo de Fornalha'], title: 'Mestre da Forja' },
  ink: { label: 'Tinta', themes: ['registro', 'inscricoes', 'historia', 'expressao'], items: ['Pigmento Vivo', 'Fibra de Pergaminho', 'Tinta Encantada'], title: 'Escriba Vivo' },
  chrono: { label: 'Tempo', themes: ['ruinas', 'transformacao', 'anomalia', 'historia'], items: ['Areia de Ampulheta', 'Fragmento de Relógio', 'Cristal de Eco'], title: 'Guardião dos Instantes' },
} as const;
export function isSchool(id: string): id is SchoolId { return SCHOOL_IDS.some(s => s === id); }
export function catalogueAffinity(origin: string): { kind: 'essence' | 'school'; id: string; label: string } | null {
  if (isSchool(origin)) return { kind: 'school', id: origin, label: SCHOOL_DEFINITIONS[origin].label };
  const essence = ESSENCE_ORIGINS[origin as keyof typeof ESSENCE_ORIGINS];
  return essence ? { kind: 'essence', id: essence, label: ESSENCE_LABELS[essence] } : null;
}

export type SchoolStage = 'planned' | 'announced' | 'open' | 'expanded';
export interface SchoolAvailability { stage: SchoolStage; maxRank: number; locationId: string | null }
export const SCHOOL_AVAILABILITY: Record<SchoolId, SchoolAvailability> = Object.fromEntries(
  SCHOOL_IDS.map(id => [id, { stage: 'planned', maxRank: 0, locationId: null }]),
) as Record<SchoolId, SchoolAvailability>;
// Bond values remain unset until mapped to the existing progression: never silently waive them.
export const SCHOOL_RANKS = [
  { label: 'Iniciado', level: 10, memories: 3, themes: 2, remarkable: 0, extraordinary: 0, items: [10, 0, 0], bond: 'Primeiro marco', quest: 'iniciacao' },
  { label: 'Aprendiz', level: 20, memories: 8, themes: 3, remarkable: 0, extraordinary: 0, items: [20, 3, 0], bond: 'Primeiro marco', quest: 'prova-pratica' },
  { label: 'Adepto', level: 30, memories: 15, themes: 3, remarkable: 3, extraordinary: 0, items: [30, 8, 1], bond: 'Intermediário', quest: 'promocao' },
  { label: 'Especialista', level: 40, memories: 25, themes: 4, remarkable: 6, extraordinary: 0, items: [40, 12, 3], bond: 'Alto', quest: 'dominio' },
  { label: 'Mestre', level: 50, memories: 40, themes: 4, remarkable: 10, extraordinary: 1, items: [0, 0, 0], bond: 'Máximo', quest: 'maestria' },
] as const;
export const POWER_CURVE: readonly (readonly number[])[] = [[], [1], [.8, .7], [.75, .65, .55], [.7, .6, .5, .45], [.65, .55, .5, .45, .4]];
export function schoolPower(id: SchoolId, priorities: readonly SchoolId[], convergent = false): number {
  const active = [...new Set(priorities)].filter(isSchool);
  const index = active.indexOf(id);
  if (index < 0) return 0;
  return convergent && active.length === 5 ? .7 : POWER_CURVE[active.length][index];
}
export interface SchoolEffect { damage: number; heal: number; shield: number; controlSeconds: number; dashDistance: number; dashSpeed: number }
/** Apply once to base values. VFX and movement are intentionally unaffected. */
export function scaleSchoolEffect(base: SchoolEffect, power: number): SchoolEffect {
  const multiplier = Number.isFinite(power) ? Math.min(1, Math.max(0, power)) : 0;
  return { ...base, damage: base.damage * multiplier, heal: base.heal * multiplier, shield: base.shield * multiplier, controlSeconds: base.controlSeconds * multiplier };
}
export type MemoryTheme = typeof SCHOOL_DEFINITIONS[SchoolId]['themes'][number];
export interface SchoolMemory {
  eventId: string;
  companionId: string;
  milestoneId: string; // Stable achievement key: repeated farming cannot mint fresh qualifications.
  type: 'exploration' | 'combat' | 'discovery' | 'creation' | 'care' | 'cooperation';
  themes: readonly MemoryTheme[];
  relevance: 'common' | 'remarkable' | 'extraordinary';
  source: 'quest' | 'encounter' | 'craft' | 'discovery';
}
/** Input MUST come from authoritative game events, never client/LLM assertions. */
export function schoolMemoryProgress(school: SchoolId, companionId: string, memories: readonly SchoolMemory[]) {
  const themes = new Set<string>(), events = new Set<string>(), milestones = new Set<string>();
  let count = 0, remarkable = 0, extraordinary = 0;
  const accepted: readonly string[] = SCHOOL_DEFINITIONS[school].themes;
  for (const memory of memories) {
    const matched = memory.themes.filter(t => accepted.includes(t));
    if (memory.companionId !== companionId || !memory.eventId || !memory.milestoneId || !matched.length || events.has(memory.eventId) || milestones.has(memory.milestoneId)) continue;
    events.add(memory.eventId); milestones.add(memory.milestoneId); matched.forEach(t => themes.add(t)); count++;
    if (memory.relevance !== 'common') remarkable++;
    if (memory.relevance === 'extraordinary') extraordinary++;
  }
  return { count, themes: themes.size, remarkable, extraordinary };
}
export function schoolMemoryRequirements(school: SchoolId, rank: number, companionId: string, memories: readonly SchoolMemory[]) {
  const requirement = SCHOOL_RANKS[rank - 1];
  if (!Number.isInteger(rank) || !requirement) return false;
  const p = schoolMemoryProgress(school, companionId, memories);
  return p.count >= requirement.memories && p.themes >= requirement.themes && p.remarkable >= requirement.remarkable && p.extraordinary >= requirement.extraordinary;
}
