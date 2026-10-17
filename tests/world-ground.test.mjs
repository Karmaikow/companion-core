import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroundSampler,groundPixels} from '../web/scene/world-ground.js';
import {defaultWorld,generateChunk} from '../web/modules/world-rules.js';
test('ground is deterministic, seed-dependent and leaves placement unchanged',()=>{
 const world=defaultWorld(),before=generateChunk(world,-1,0),a=createGroundSampler(world),b=createGroundSampler(world);
 assert.deepEqual(groundPixels(a,-1,0,16),groundPixels(b,-1,0,16));
 assert.notDeepEqual(groundPixels(a,0,0,16),groundPixels(createGroundSampler({...world,seed:'other'}),0,0,16));
 assert.deepEqual(generateChunk(world,-1,0),before);
});
test('ground color stays continuous at positive and negative chunk boundaries',()=>{
 const sample=createGroundSampler(defaultWorld());
 for(const edge of [-32,-16,0,16,32])for(const z of [-19.4,0,7.1,18.3]){
  const left=sample(edge-1e-7,z),right=sample(edge+1e-7,z);
  left.forEach((v,i)=>assert.ok(Math.abs(v-right[i])<=1));
  const top=sample(z,edge-1e-7),bottom=sample(z,edge+1e-7);
  top.forEach((v,i)=>assert.ok(Math.abs(v-bottom[i])<=1));
 }
});
test('texture includes opaque grass, soil and stone variation',()=>{
 const pixels=groundPixels(createGroundSampler(defaultWorld()),0,0);
 assert.equal(pixels.length,128*128*4);
 const colors=new Set();for(let i=0;i<pixels.length;i+=4){assert.equal(pixels[i+3],255);colors.add(pixels.slice(i,i+3).join(','));}
 assert.ok(colors.size>100);
});
