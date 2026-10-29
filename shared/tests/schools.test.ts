import { describe, it, expect } from 'vitest';
import { SPELL_CATALOGUE } from '../rules/combat/catalogue';
import { catalogueAffinity, SCHOOL_IDS, SCHOOL_AVAILABILITY, schoolPower, scaleSchoolEffect, schoolMemoryProgress, schoolMemoryRequirements, type SchoolMemory } from '../rules/combat/schools';

describe('school foundation (no automatic migration)', () => {
  it('classifies all 100 effects into 10 essences and five schools', () => {
    const groups = SPELL_CATALOGUE.map(s => catalogueAffinity(s.school));
    expect(groups.every(Boolean)).toBe(true);
    expect(new Set(groups.filter(s => s?.kind === 'essence').map(s => s?.id)).size).toBe(10);
    expect(new Set(groups.filter(s => s?.kind === 'school').map(s => s?.id)).size).toBe(5);
    expect(catalogueAffinity('hive')?.id).toBe('veneno');
    expect(catalogueAffinity('unknown')).toBeNull();
    expect(Object.values(SCHOOL_AVAILABILITY).every(s => s.stage === 'planned' && s.maxRank === 0)).toBe(true);
  });
  it('respects order, deduplicates priorities and handles inactive schools', () => {
    expect(schoolPower('arcane', ['arcane'])).toBe(1);
    expect(schoolPower('arcane', ['arcane', 'blood'])).toBe(.8);
    expect(schoolPower('arcane', ['blood', 'arcane'])).toBe(.7);
    expect(schoolPower('arcane', ['arcane', 'arcane'])).toBe(1);
    expect(schoolPower('arcane', [])).toBe(0);
    expect(SCHOOL_IDS.map(s => schoolPower(s, SCHOOL_IDS))).toEqual([.65, .55, .5, .45, .4]);
    expect(SCHOOL_IDS.map(s => schoolPower(s, SCHOOL_IDS, true))).toEqual([.7, .7, .7, .7, .7]);
  });
  it('scales output and control once without mutating movement or the base', () => {
    const base = {damage:100, heal:80, shield:50, controlSeconds:2, dashDistance:6, dashSpeed:12};
    expect(scaleSchoolEffect(base, .7)).toEqual({damage:70, heal:56, shield:35, controlSeconds:1.4, dashDistance:6, dashSpeed:12});
    expect(base.damage).toBe(100);
    expect(scaleSchoolEffect(base, NaN).damage).toBe(0);
  });
  const memory: SchoolMemory = {eventId:'e1', companionId:'mayuna', milestoneId:'seal-1', type:'discovery', themes:['selos','runas'], relevance:'remarkable', source:'discovery'};
  it('counts distinct personal achievements and ignores repeats or another companion', () => {
    const memories = [memory, memory, {...memory,eventId:'e2'}, {...memory,eventId:'e3',milestoneId:'seal-3',companionId:'other'}];
    expect(schoolMemoryProgress('arcane','mayuna',memories)).toEqual({count:1,themes:2,remarkable:1,extraordinary:0});
    expect(schoolMemoryProgress('blood','mayuna',memories).count).toBe(0);
  });
  it('requires sufficient matching memories and valid rank', () => {
    const memories = [1,2,3].map(n => ({...memory,eventId:`e${n}`,milestoneId:`seal-${n}`}));
    expect(schoolMemoryRequirements('arcane',1,'mayuna',memories)).toBe(true);
    expect(schoolMemoryRequirements('arcane',2,'mayuna',memories)).toBe(false);
    expect(schoolMemoryRequirements('arcane',0,'mayuna',memories)).toBe(false);
  });
});
