import { describe,it,expect } from 'vitest';
import { DEFAULT_SKILLS,sanitizeSkill,skillFits,safeSkillIcon } from '../rules/combat/skills';
import { buildSchoolTree,schoolEntryRestriction } from '../rules/combat/schoolTree';
import { buildSkillTree } from '../rules/combat/tree';
describe('icons and independent school trees',()=>{
 it('persists HTTPS icons and drops active/unsafe URLs',()=>{
  expect(sanitizeSkill({...DEFAULT_SKILLS[0],iconUrl:'https://example.com/icon.png'})?.iconUrl).toBe('https://example.com/icon.png');
  for(const url of ['javascript:alert(1)','data:image/svg+xml,test','http://example.com/icon.png','https://user:secret@example.com/a']) expect(safeSkillIcon(url)).toBeUndefined();
 });
 it('requires Taurina lineage for all Forge techniques',()=>{
  expect(schoolEntryRestriction('forge','touro')).toBeNull();
  for(const species of ['serpente','mistica','passaro','felino'] as const) expect(schoolEntryRestriction('forge',species)).toContain('Taurinos');
  const skill=sanitizeSkill({...DEFAULT_SKILLS[0],learning:{school:'forge',rank:2},classes:[]})!;
  expect(skill.classes).toEqual(['touro']);
  expect(buildSchoolTree([skill],'forge','serpente').entryReason).toContain('Taurinos');
 });
 it('does not inject school techniques into the ordinary tree or kit',()=>{
  const skill=sanitizeSkill({...DEFAULT_SKILLS[0],slug:'school-test',learning:{school:'arcane',rank:2}})!;
  expect(skillFits(skill,'fogo','biped','touro')).toBe(false);
  expect(buildSkillTree([...DEFAULT_SKILLS,skill],{essence:'fogo',species:'touro'})).toEqual(buildSkillTree(DEFAULT_SKILLS,{essence:'fogo',species:'touro'}));
  expect(buildSchoolTree([skill],'arcane','touro').nodes[0]).toMatchObject({rank:2,locked:true});
 });
 it('classifies the authored school rows without reclassifying legacy visual swaps',()=>{
  const raw={...DEFAULT_SKILLS[0],slug:'vfx-pistondrive',unlockBond:4,vfx:{...DEFAULT_SKILLS[0].vfx,catalogue:'pistondrive'}};
  expect(sanitizeSkill(raw)?.learning).toEqual({school:'forge',rank:2});
  expect(sanitizeSkill({...raw,slug:'golpe'})?.learning).toBeUndefined();
 });
});
