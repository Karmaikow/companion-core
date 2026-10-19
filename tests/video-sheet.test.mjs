import test from 'node:test';
import assert from 'node:assert/strict';
import {videoPlan,removeColor} from '../web/modules/video-sheet.js';
test('video extraction samples at FPS 10 by default and respects the selected range',()=>{
 const p=videoPlan({duration:10});assert.equal(p.count,100);assert.equal(p.times[0],0);assert.equal(p.times.at(-1),9.9);
 const part=videoPlan({duration:10,start:2,end:3.25,fps:10});assert.equal(part.count,13);assert.equal(part.times[0],2);assert.ok(part.times.at(-1)<3.25);
 assert.equal(videoPlan({duration:24}).count,240);assert.equal(videoPlan({duration:3.7}).count,37);
});
test('video sheets fit the pixel budget and reject excessive frame counts instead of truncating',()=>{
 const p=videoPlan({duration:51.2,cellSize:512});assert.equal(p.count,512);assert.ok(p.width*p.height<=16777216);
 assert.throws(()=>videoPlan({duration:60}));assert.throws(()=>videoPlan({duration:10,start:5,end:4}));
 assert.throws(()=>videoPlan({duration:Infinity}));assert.throws(()=>videoPlan({duration:1,fps:0}));
});
test('optional uniform background removal changes alpha only for the chosen color',()=>{
 const data=new Uint8ClampedArray([0,255,0,255,255,0,0,255,5,250,4,255]);
 removeColor(data,'#00ff00',10);assert.deepEqual([...data],[0,255,0,0,255,0,0,255,5,250,4,0]);
 assert.throws(()=>removeColor(data,'bad',40));
});
