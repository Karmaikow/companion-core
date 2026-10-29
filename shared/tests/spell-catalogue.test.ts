import { describe, expect, it } from 'vitest';
import { SPELL_CATALOGUE, SPELL_SCHOOLS } from '../rules/combat/catalogue';
import { sanitizeSkill, DEFAULT_SKILLS } from '../rules/combat/skills';
describe('spell catalogue persistence',()=>{
 it('contains 100 unique effects across 15 schools',()=>{expect(new Set(SPELL_CATALOGUE.map(s=>s.id)).size).toBe(100);expect(SPELL_SCHOOLS.length).toBe(15);});
 it('round-trips each visual without changing combat',()=>{const base=Object.values(DEFAULT_SKILLS)[0];for(const spell of SPELL_CATALOGUE){const result=sanitizeSkill({...base,vfx:{...base.vfx,catalogue:spell.id}})!;expect(result.vfx.catalogue).toBe(spell.id);expect(result.power).toBe(base.power);expect(result.shape).toBe(base.shape);}});
 it('rejects unknown module ids',()=>{const base=Object.values(DEFAULT_SKILLS)[0];expect(sanitizeSkill({...base,vfx:{...base.vfx,catalogue:'../../evil'}})?.vfx.catalogue).toBeUndefined();});
});
