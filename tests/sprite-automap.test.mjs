import test from 'node:test';
import assert from 'node:assert/strict';
import {describeFrame,analyzeFrames,history} from '../web/modules/sprite-automap.js';
const frame=(r,g,b)=>describeFrame(Uint8ClampedArray.from([r,g,b,255]),1,1);
test('unanchored frames stay uncertain; time continuity never invents directions',()=>{
 const result=analyzeFrames([frame(255,0,0),frame(255,0,0)]);
 assert.ok(result.frames.every(f=>f.direction===null&&f.confidence===0));assert.equal(result.frames[1].continuity,1);assert.deepEqual(result.cycles,[]);
});
test('reviewed examples classify similar pixels and preserve missing views',()=>{
 const result=analyzeFrames([frame(255,0,0),frame(254,0,0),frame(0,255,0),frame(0,254,0)],{S:[0],N:[2]});
 assert.deepEqual(result.frames.map(f=>f.direction),['S','S','N','N']);assert.equal(result.frames[0].reviewed,true);assert.equal(result.fps,10);
});
test('ties, one uninformative prototype, empty frames and invalid anchors',()=>{
 assert.equal(analyzeFrames([frame(255,0,0),frame(255,0,0)],{S:[0]}).frames[1].direction,null);
 assert.equal(analyzeFrames([frame(255,0,0),frame(255,0,0),frame(255,0,0)],{S:[0],N:[1]}).frames[2].direction,null);
 const empty=describeFrame(new Uint8ClampedArray(4),1,1);assert.equal(analyzeFrames([empty]).frames[0].reason,'empty');
 assert.throws(()=>analyzeFrames([empty],{S:[0]}));assert.throws(()=>analyzeFrames([frame(1,2,3)],{S:[2]}));
});
test('static poses cannot be suggested as cycles',()=>{
 assert.deepEqual(analyzeFrames(Array.from({length:8},()=>frame(255,0,0)),{S:[0,1,2,3,4,5,6,7]}).cycles,[]);
});
test('moving sequence with a close seam is only a cycle suggestion',()=>{
 const result=analyzeFrames([0,.05,.1,.05,0,1].map(n=>({empty:false,vector:[n]})),{S:[0],N:[5]});
 assert.ok(result.cycles.length>0);assert.equal(result.cycles[0].accepted,false);assert.deepEqual(result.cycles[0].frames,[0,1,2,3]);
 assert.throws(()=>analyzeFrames([frame(1,2,3)],{S:[0],N:[0]}));
});
test('history preserves snapshots and clears redo after a new edit',()=>{
 const initial={frames:[0,1],pivot:{x:.5,y:.95}},h=history(initial);initial.frames.pop();assert.equal(h.value.frames.length,2);
 h.push({frames:[1,0]});assert.deepEqual(h.undo().frames,[0,1]);assert.deepEqual(h.redo().frames,[1,0]);h.undo();h.push({frames:[0]});assert.equal(h.canRedo,false);
});
