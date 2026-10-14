import test from 'node:test';
import assert from 'node:assert/strict';
import {artDimensions} from '../web/modules/art-image.js';

test('sprite widths need not be divisible in the original image', () => {
  assert.deepEqual(artDimensions(2172,724,8),{width:2168,height:724});
  assert.deepEqual(artDimensions(2172,724),{width:2172,height:724});
  assert.deepEqual(artDimensions(1,1),{width:1,height:1});
});

test('large, panoramic and portrait artwork fits the stored PNG limits', () => {
  for (const [w,h] of [[6000,4000],[4000,6000],[30000,100],[100,30000],[8192,2048],[1,30000]]) {
    for (let frames=1;frames<=8;frames++) {
      const out=artDimensions(w,h,frames);
      assert.ok(out.width>=frames && out.height>=1);
      assert.ok(out.width<=8192 && out.height<=2048 && out.width*out.height<=4194304);
      assert.equal(out.width%frames,0);
      if (w>=frames) assert.ok(out.width<=w && out.height<=h);
      const scale=Math.min(1,8192/w,2048/h,Math.sqrt(4194304/w/h));
      assert.ok(Math.abs(out.width-w*scale)<frames || out.width===frames);
      assert.ok(Math.abs(out.height-h*scale)<1 || out.height===1);
    }
  }
});

test('invalid dimensions and frame counts fail before allocating a canvas', () => {
  for (const args of [[0,10],[10,0],[-1,2],[NaN,1],[Infinity,2],[1.5,2],[10,10,0],[10,10,9],[10,10,1.5]]) {
    assert.throws(()=>artDimensions(...args));
  }
});
