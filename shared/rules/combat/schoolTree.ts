import type { SpeciesKey } from '../species.ts';
import type { SkillDef } from './skills.ts';
import { SCHOOL_AVAILABILITY, SCHOOL_RANKS, type SchoolId } from './schools.ts';

export function schoolEntryRestriction(school: SchoolId, species: SpeciesKey | null): string | null {
  if (!species) return 'Descubra sua linhagem antes de ingressar numa escola.';
  return school === 'forge' && species !== 'touro' ? 'A Escola da Forja é exclusiva dos Taurinos.' : null;
}
/** Separate from the existing allocation tree: never consume its points or remap its IDs. */
export function buildSchoolTree(catalogue: readonly SkillDef[], school: SchoolId, species: SpeciesKey | null) {
  const entryReason = schoolEntryRestriction(school, species);
  const available = SCHOOL_AVAILABILITY[school];
  const nodes = catalogue.filter(s => s.learning?.school === school).map(skill => ({
    id: `school:${school}:${skill.slug}`, skill: skill.slug, name: skill.name, iconUrl: skill.iconUrl,
    rank: skill.learning!.rank, requiredBond: skill.unlockBond,
    requirements: SCHOOL_RANKS[skill.learning!.rank - 1],
    locked: true, // Enrollment, personal quests and atomic delivery are not live yet.
    reason: entryReason ?? (available.stage === 'planned' || available.stage === 'announced' ? 'Esta escola ainda não abriu.' : 'Conclua a matrícula e os requisitos dentro da escola.'),
  })).sort((a,b) => a.rank-b.rank || a.id.localeCompare(b.id));
  return { school, entryReason, nodes, editingLocation: 'school' as const };
}
