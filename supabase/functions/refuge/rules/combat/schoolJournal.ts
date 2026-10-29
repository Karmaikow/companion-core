/** School journal v1: deterministic projection of persisted Core events, never chat text. */
import { SCHOOL_IDS, SCHOOL_AVAILABILITY, schoolMemoryProgress, type SchoolMemory, type SchoolStage } from './schools.ts';
export const SCHOOL_EVENT_KINDS = ['ecos.clue', 'ecos.discovery', 'ecos.craft', 'ecos.project', 'pacto.forja', 'combat.kill'] as const;
export interface SchoolSourceEvent { id: number; actor: string; kind: string; payload: Record<string, unknown>; created_at: string }
export interface SchoolAchievement extends SchoolMemory { label: string; achievedAt: string }
export interface SchoolJournal {
  schemaVersion: 1;
  companionId: string;
  simulated: boolean;
  achievements: SchoolAchievement[];
  schools: { id: typeof SCHOOL_IDS[number]; progress: ReturnType<typeof schoolMemoryProgress>; stage: SchoolStage; rank: 0 }[];
}
const key = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value);
/** Only server-owned event fields are interpreted. Payload themes/relevance/learned are ignored. */
export function classifySchoolEvent(companionId: string, event: SchoolSourceEvent): SchoolAchievement | null {
  if (!companionId || event.actor !== 'system' || !Number.isSafeInteger(event.id) || event.id < 1 || !event.payload || !Number.isFinite(Date.parse(event.created_at))) return null;
  const p = event.payload;
  const make = (milestoneId: string, label: string, type: SchoolMemory['type'], themes: SchoolMemory['themes'], relevance: SchoolMemory['relevance'], source: SchoolMemory['source']): SchoolAchievement => ({ companionId, eventId: String(event.id), milestoneId, label, type, themes, relevance, source, achievedAt: event.created_at });
  if (event.kind === 'ecos.clue' && p.chain === 'seiva-azul') {
    if (p.step === 'seiva') return make('seiva-azul:seiva', 'Investigou a Seiva Azul', 'discovery', ['magia', 'descoberta'], 'common', 'discovery');
    if (p.step === 'cascalho') return make('seiva-azul:cascalho', 'Identificou os minerais da nascente', 'exploration', ['minerais', 'descoberta'], 'common', 'discovery');
    if (p.step === 'nascente') return make('seiva-azul:nascente', 'Encontrou a Nascente Azul', 'discovery', ['magia', 'descoberta'], 'remarkable', 'discovery');
  }
  if (event.kind === 'ecos.discovery' && p.chain === 'seiva-azul' && (p.choice === 'extrair' || p.choice === 'preservar')) {
    return make('seiva-azul:conclusao', p.choice === 'preservar' ? 'Preservou a Nascente Azul' : 'Extraiu os cristais da nascente', 'discovery', p.choice === 'preservar' ? ['protecao', 'vitalidade', 'magia'] : ['minerais', 'magia'], 'remarkable', 'discovery');
  }
  if (event.kind === 'ecos.craft' && p.recipe === 'unguento-orvalho') return make('craft:unguento-orvalho', 'Preparou o Unguento de Orvalho', 'creation', ['criacao', 'vitalidade'], 'common', 'craft');
  if (event.kind === 'ecos.project' && p.project === 'ponte-riacho' && ['fundacao', 'tabuado', 'lanternas'].includes(String(p.stage))) return make(`ponte-riacho:${p.stage}`, 'Contribuiu para a Ponte do Riacho', 'cooperation', p.stage === 'lanternas' ? ['criacao', 'metal', 'magia'] : ['criacao'], 'remarkable', 'quest');
  if (event.kind === 'pacto.forja' && key(p.ref)) return make(`forja:${p.ref}`, `Forjou uma peça: ${p.ref}`, 'creation', ['criacao', 'metal'], 'common', 'craft');
  if (event.kind === 'combat.kill' && p.analyzed === true && key(p.slug)) return make(`bestiario:${p.slug}`, `Concluiu a análise: ${p.slug}`, 'discovery', ['registro'], 'remarkable', 'encounter');
  return null;
}
export function schoolJournal(companionId: string, events: readonly SchoolSourceEvent[], simulated = false): SchoolJournal {
  const milestones = new Set<string>(), ids = new Set<string>();
  const achievements: SchoolAchievement[] = [];
  for (const event of [...events].sort((a,b) => a.id - b.id)) {
    const memory = classifySchoolEvent(companionId, event);
    if (!memory || milestones.has(memory.milestoneId) || ids.has(memory.eventId)) continue;
    milestones.add(memory.milestoneId); ids.add(memory.eventId); achievements.push(memory);
  }
  return { schemaVersion: 1, companionId, simulated, achievements, schools: SCHOOL_IDS.map(id => ({ id, progress: schoolMemoryProgress(id, companionId, achievements), stage: SCHOOL_AVAILABILITY[id].stage, rank: 0 })) };
}
