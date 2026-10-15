import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findRoute,clearSegment,advanceRoute,facing } from '../web/modules/refuge-navigation.js';
import { validateAtlas,selectClip,frameRect,spritePrompt } from '../web/modules/sprite-atlas.js';
test('route goes around an obstacle without cutting diagonal corners',()=>{
 const obstacles=[{x:0,z:0,w:3,d:4}],start={x:-4,z:0},goal={x:4,z:0},route=findRoute(start,goal,obstacles);
 assert.ok(route?.length>1);let p=start;for(const next of route){assert.ok(clearSegment(p,next,obstacles));p=next;}assert.deepEqual(p,goal);
 assert.equal(findRoute(start,{x:0,z:0},obstacles),null);assert.equal(findRoute(start,{x:20,z:0},obstacles),null);
});
test('movement consumes distance across waypoints without overshoot and preserves diagonal speed',()=>{
 const route=[{x:1,z:0},{x:1,z:2}];const result=advanceRoute({x:0,z:0},route,2);assert.deepEqual(result.position,{x:1,z:1});assert.equal(result.travelled,2);assert.equal(route.length,1);
 const diagonal=advanceRoute({x:0,z:0},[{x:5,z:5}],2);assert.ok(Math.abs(Math.hypot(diagonal.position.x,diagonal.position.z)-2)<1e-8);assert.equal(facing(-1,1),'SW');
 assert.deepEqual(advanceRoute(result.position,route,10).position,{x:1,z:2});
});
test('bundled draft atlas matches its PNG and missing directions are reported',async()=>{
 const png=await readFile('web/assets/refuge/mayuna-walk.png'),a=validateAtlas(JSON.parse(await readFile('web/assets/refuge/mayuna-walk.json')),png.readUInt32BE(16),png.readUInt32BE(20));
 assert.equal(selectClip(a,'walk','SE').exact,true);assert.equal(selectClip(a,'walk','SW').flip,true);assert.equal(selectClip(a,'walk','N').exact,false);assert.deepEqual(frameRect(a,7),{x:1344,y:448,w:448,h:448});
 const bad=structuredClone(a);bad.clips.walk.SE.frames=[8];assert.throws(()=>validateAtlas(bad,1792,896));assert.throws(()=>spritePrompt({action:'unknown'}));
});
