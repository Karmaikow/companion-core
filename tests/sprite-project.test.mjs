import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProjects,withDirection,nextDirection,reviewedCount} from '../web/modules/sprite-project.js';
import {validateAtlas,DIRECTIONS} from '../web/modules/sprite-atlas.js';
import {sheetLayout,mappedAtlas} from '../web/modules/sprite-sheet-import.js';
const source=(action,count=8)=>({version:1,image:'atlas.png',columns:4,rows:Math.ceil(count/4),frameCount:count,frameWidth:8,frameHeight:8,pivot:{x:.5,y:.95},clips:{[action]:{S:{frames:[0,1],fps:10,loop:false}}}});
test('saving one direction preserves other actions and advances to unfinished directions',()=>{
 let atlas=mergeProjects(null,source('walk'),'sheet-a').atlas;
 atlas=withDirection(atlas,'walk','S',{frames:[0,1],fps:10,loop:false});
 atlas=withDirection(atlas,'attack','N',{frames:[3,4],fps:10,loop:false});
 assert.deepEqual(atlas.clips.walk.S.frames,[0,1]);assert.equal(reviewedCount(atlas,'walk'),1);
 assert.equal(nextDirection(atlas,'walk','S'),'SW');
 for(const d of DIRECTIONS)atlas=withDirection(atlas,'walk',d,{frames:[0],fps:10,loop:false});
 assert.equal(reviewedCount(atlas,'walk'),8);assert.equal(nextDirection(atlas,'walk','SE'),null);
});
test('same sheet can map multiple actions without duplicating frames or overwriting saved directions',()=>{
 const first=withDirection(mergeProjects(null,source('walk'),'sheet-a').atlas,'walk','S',{frames:[0,1],fps:10,loop:false});
 const merged=mergeProjects(first,source('attack'),'sheet-a');
 assert.equal(merged.reuse,true);assert.equal(merged.atlas.frameCount,8);
 assert.deepEqual(merged.atlas.clips.walk.S.frames,[0,1]);assert.equal(reviewedCount(merged.atlas,'walk'),1);
 assert.deepEqual(merged.atlas.clips.attack.S.frames,[0,1]);assert.equal(first.clips.attack,undefined);
});
test('new action sources append with shifted indices and preserve progress',()=>{
 const first=withDirection(mergeProjects(null,source('walk'),'sheet-a').atlas,'walk','S',{frames:[0,1],fps:10,loop:false});
 const merged=mergeProjects(first,source('attack',7),'sheet-b');
 assert.equal(merged.offset,8);assert.equal(merged.atlas.frameCount,15);
 assert.deepEqual(merged.atlas.clips.attack.S.frames,[8,9]);assert.equal(reviewedCount(merged.atlas,'walk'),1);
 validateAtlas(merged.atlas,32,32);
 assert.throws(()=>mergeProjects(first,source('attack',512),'huge'));
});
test('partially filled last rows do not become phantom frames',()=>{
 const l=sheetLayout({columns:8,rows:5,frameCount:37,frameWidth:8,frameHeight:8,gapX:0,gapY:0,marginX:0,marginY:0},64,40);
 assert.equal(l.rects.length,37);assert.deepEqual(l.rects.at(-1),{x:32,y:32,w:8,h:8});
 const a=mappedAtlas(l,'walk',{S:'0-36'},10,false);assert.equal(a.frameCount,37);
 assert.throws(()=>mappedAtlas(l,'walk',{S:'37'},10,false));
 assert.throws(()=>validateAtlas({...a,clips:{walk:{S:{frames:[37],fps:10}}}},64,40));
});
