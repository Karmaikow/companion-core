import test from 'node:test';
import assert from 'node:assert/strict';
import {MAYUNA_VIDEO_LAYOUT,sheetLayout,frameSelection,mappedAtlas,classifyOrderedTurn,clipFrame} from '../web/modules/sprite-sheet-import.js';
import {DIRECTIONS,selectClip} from '../web/modules/sprite-atlas.js';
const layout=()=>sheetLayout(MAYUNA_VIDEO_LAYOUT,3127,5215);
test('Mayuna layout removes all 5px gutters without trimming cells',()=>{
 const l=layout();assert.equal(l.rects.length,240);
 assert.deepEqual(l.rects[0],{x:0,y:0,w:256,h:256});
 assert.deepEqual(l.rects[239],{x:2871,y:4959,w:256,h:256});
 assert.equal(l.frameWidth*l.columns,3072);assert.equal(l.frameHeight*l.rows,5120);
});
test('resizing requires explicit opt-in and proportional dimensions',()=>{
 assert.throws(()=>sheetLayout(MAYUNA_VIDEO_LAYOUT,1228,2048));
 const l=sheetLayout(MAYUNA_VIDEO_LAYOUT,1228,2048,true);assert.equal(l.scaled,true);
 for(const r of l.rects)assert.ok(r.x+r.w<=1228&&r.y+r.h<=2048);
 assert.throws(()=>sheetLayout(MAYUNA_VIDEO_LAYOUT,1000,2000,true));
 assert.throws(()=>sheetLayout({...MAYUNA_VIDEO_LAYOUT,columns:0},3127,5215));
 assert.throws(()=>sheetLayout({...MAYUNA_VIDEO_LAYOUT,rows:1000},3127,5215));
});
test('ranges reject invalid indices and preserve explicit ordering',()=>{
 assert.deepEqual(frameSelection('0-2,239,7-8',240),[0,1,2,239,7,8]);
 assert.deepEqual(frameSelection('',240),[]);
 for(const s of ['-1','240','2-1','1,,2','0-99999999','0.5'])assert.throws(()=>frameSelection(s,240));
});
test('directions are explicitly mapped, never fabricated from the rotation video',()=>{
 assert.throws(()=>mappedAtlas(layout(),'walk',{},24,false));
 const a=mappedAtlas(layout(),'walk',{SE:'0-239'},24,false);
 assert.equal(a.clips.walk.SE.frames.length,240);assert.equal(a.mirror,false);
 assert.equal(selectClip(a,'walk','N').exact,false);
 const eight=mappedAtlas(layout(),'walk',Object.fromEntries(DIRECTIONS.map((d,i)=>[d,`${i*3}-${i*3+2}`])),12,true);
 assert.equal(Object.keys(eight.clips.walk).length,8);
 for(const d of DIRECTIONS)assert.equal(selectClip(eight,'walk',d).exact,true);
 assert.throws(()=>mappedAtlas(layout(),'walk',{S:'0'},0,true));
});
test('AutoMap v1 distributes all 240 ordered frames across eight editable sectors at FPS 10',()=>{
 const result=classifyOrderedTurn(240),counts=Object.fromEntries(DIRECTIONS.map(d=>[d,result.framesByDirection[d].length]));
 assert.deepEqual(counts,Object.fromEntries(DIRECTIONS.map(d=>[d,30])));
 assert.deepEqual(result.framesByDirection.S,[...Array(30).keys()]);
 assert.deepEqual(result.framesByDirection.SE,[...Array(30).keys()].map(n=>n+210));
 assert.equal(result.classification.method,'ordered-turn-v1');assert.equal(result.classification.reviewed,false);
 const ranges=Object.fromEntries(DIRECTIONS.map(d=>[d,`${result.framesByDirection[d][0]}-${result.framesByDirection[d].at(-1)}`]));
 const atlas=mappedAtlas(layout(),'walk',ranges,10,false,result.classification);
 assert.equal(atlas.source.classification.method,'ordered-turn-v1');
 assert.equal(atlas.clips.walk.S.fps,10);assert.equal(atlas.clips.walk.SE.frames.length,30);
});
test('AutoMap supports an anchor and reverse sequence and handles uneven frame counts without dropping frames',()=>{
 const result=classifyOrderedTurn(11,{anchor:'N',clockwise:false});
 assert.deepEqual(result.framesByDirection.N,[0,1]);assert.deepEqual(result.framesByDirection.NW,[2]);assert.deepEqual(result.framesByDirection.W,[3,4]);
 assert.deepEqual(result.framesByDirection.S,[6]);assert.deepEqual(result.framesByDirection.SE,[7,8]);assert.deepEqual(result.framesByDirection.NE,[10]);
 assert.equal(Object.values(result.framesByDirection).flat().length,11);
 for(const bad of [0,513])assert.throws(()=>classifyOrderedTurn(bad));
 assert.throws(()=>classifyOrderedTurn(8,{anchor:'sideways'}));
});
test('FPS, loop, final-frame hold and reduced motion',()=>{
 const c={frames:[4,7,10],fps:2,loop:false};
 assert.equal(clipFrame(c,0),4);assert.equal(clipFrame(c,.5),7);
 assert.equal(clipFrame(c,100),10);assert.equal(clipFrame({...c,loop:true},1.5),4);
 assert.equal(clipFrame(c,100,true),4);assert.equal(clipFrame(c,-1),4);
});
