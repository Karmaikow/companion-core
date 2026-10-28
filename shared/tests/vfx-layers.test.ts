import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SKILLS, sanitizeSkill } from '../rules/combat/skills';
import { newVfxLayer, sanitizeVfxLayers, vfxPreset } from '../rules/combat/vfx';
import { VfxStore } from '../../client/src/scene/vfx/engine';
import { playVfxLayers } from '../../client/src/scene/vfx/layers';
const ctx = { origin: new THREE.Vector3(), target: new THREE.Vector3(0,0,5), yaw: 0, color: '#77bbff' };
describe('Forja VFX', () => {
  it('preserves old catalog and round-trips layers without altering combat values', () => {
    for (const skill of DEFAULT_SKILLS) expect(sanitizeSkill(skill)).toEqual(skill);
    const base = DEFAULT_SKILLS[0];
    const saved = sanitizeSkill(JSON.parse(JSON.stringify({ ...base, vfx: { ...base.vfx, layers: vfxPreset('ice') } })))!;
    expect(saved.vfx.layers).toEqual(vfxPreset('ice'));
    expect({ ...saved, vfx: base.vfx }).toEqual(base);
  });
  it('rejects malformed layers and caps cost, duration and count', () => {
    expect(sanitizeVfxLayers([null, {}, { kind: 'constructor' }])).toEqual([]);
    const layers = sanitizeVfxLayers(Array.from({length:20}, () => ({ kind:'crystals', count:1e9, size:Infinity, delay:-9, duration:99, color:'url(bad)' })));
    expect(layers).toHaveLength(6);
    expect(layers[0]).toMatchObject({count:64,size:1,delay:0,duration:3,color:'skill'});
  });
  it('honors windup, pause, height and bounded geometry, then releases all resources', () => {
    const store = new VfxStore();
    const skill = { ...DEFAULT_SKILLS[0], windup:0.5, range:3, vfx:{...DEFAULT_SKILLS[0].vfx, layers:[{...newVfxLayer('crystals'), anchor:'path' as const, count:10, duration:1}]} };
    playVfxLayers(store, skill, {...ctx, heightAt:()=>2});
    store.update(0); expect(store.crystals).toHaveLength(0);
    store.update(0.2); expect(store.crystals).toHaveLength(0);
    for(let i=0;i<40;i++) store.update(0.02);
    expect(store.crystals.length).toBeGreaterThan(0);
    for(const c of store.crystals) {expect(c.at.y).toBe(2);expect(c.at.z).toBeLessThanOrEqual(3);}
    const time=store.time, age=store.crystals[0].age;
    store.update(0); expect(store.time).toBe(time); expect(store.crystals[0].age).toBe(age);
    for(let i=0;i<250;i++) store.update(0.02);
    expect(store.crystals).toHaveLength(0);expect(store.parts).toHaveLength(0);expect(store.lines).toHaveLength(0);
  });
  it('disabled layers emit nothing and clear cancels pending launches', () => {
    const store = new VfxStore();
    const skill = {...DEFAULT_SKILLS[0],vfx:{...DEFAULT_SKILLS[0].vfx,layers:[{...newVfxLayer('crystals'),enabled:false}]}};
    playVfxLayers(store,skill,ctx);store.update(1);expect(store.crystals).toHaveLength(0);
    skill.vfx.layers[0].enabled=true;playVfxLayers(store,skill,ctx);store.clear();store.update(1);expect(store.crystals).toHaveLength(0);
  });
  it('caps crystals during simultaneous casts', () => {
    const store=new VfxStore();
    for(let i=0;i<1000;i++) store.crystal(ctx.origin,ctx.color,1,1,0);
    expect(store.crystals).toHaveLength(192);
  });
});
