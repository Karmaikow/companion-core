import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { sanitizeSkill, DEFAULT_SKILLS } from '../rules/combat/skills';
import { SPELL_CATALOGUE } from '../rules/combat/catalogue';
import { catalogueAffinity } from '../rules/combat/schools';
const pack = JSON.parse(readFileSync(new URL('../../data/skills/vfx-100.pt-BR.json', import.meta.url), 'utf8'));
describe('100 authored Portuguese skills', () => {
 it('covers every effect exactly once, without replacing legacy skills', () => {
  expect(pack.rows).toHaveLength(100);
  expect(new Set(pack.rows.map((r:any)=>r.slug)).size).toBe(100);
  expect(new Set(pack.rows.map((r:any)=>r.name)).size).toBe(100);
  expect(pack.rows.map((r:any)=>r.data.vfx.catalogue).sort()).toEqual(SPELL_CATALOGUE.map(s=>s.id).sort());
  expect(pack.rows.every((r:any)=>!DEFAULT_SKILLS.some(s=>s.slug===r.slug))).toBe(true);
 });
 it('round-trips every configuration with no silent clamping or field loss', () => {
  for(const row of pack.rows) {
   expect(row.status).toBe('draft');
   expect(row.data.name).toBe(row.name);
   expect(row.data.slug).toBe(row.slug);
   expect(sanitizeSkill(row.data)).toEqual(row.data);
   expect(row.data.energy).toBeGreaterThan(0);
   expect(row.data.power+row.data.heal).toBeGreaterThan(0);
  }
 });
 it('maps essences correctly and records future school learning separately', () => {
  for (const row of pack.rows) {
   const origin=SPELL_CATALOGUE.find(s=>s.id===row.data.vfx.catalogue)!;
   const affinity=catalogueAffinity(origin.school)!;
   expect(row.data.essence).toBe(affinity.kind==='essence'?affinity.id:null);
   const plan=pack.learningPlan.find((p:any)=>p.slug===row.slug);
   expect(plan.school).toBe(affinity.kind==='school'?affinity.id:null);
   expect(plan.rank).toBeGreaterThanOrEqual(1);expect(plan.rank).toBeLessThanOrEqual(5);
  }
 });
 it('keeps support self-targeted and prevents excessive control chains', () => {
  for (const {data:s} of pack.rows) {
   if(s.heal) {expect(s.shape).toBe('aura');expect(s.power).toBe(0);}
   if(s.status?.key==='atordoado') {expect(s.status.seconds).toBeLessThanOrEqual(1.5);expect(s.cooldown).toBeGreaterThanOrEqual(7);}
   expect(s.energy).toBeLessThanOrEqual(60);
  }
 });
});
