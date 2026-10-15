import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { refugeOrigin, refugeDestination, advanceRefuge } from '../web/modules/refuge-motion.js';

test('pointer projection agrees with rendering on mobile, desktop and scaled surfaces', () => {
  for (const [width,height] of [[390,700],[920,600],[1440,900]]) {
    const origin=refugeOrigin(width,height);
    const box={left:30,top:80,width:width*.75,height:height*.75};
    for(const point of [{x:0,y:0},{x:.15,y:.07},{x:-.12,y:-.05}]) {
      const result=refugeDestination(box.left+(origin.x+point.x*width)*.75,box.top+(origin.y+point.y*height)*.75,box,width,height);
      assert.ok(Math.abs(result.x-point.x)<1e-12);
      assert.ok(Math.abs(result.y-point.y)<1e-12);
    }
    assert.equal(refugeDestination(0,0,box,width,height),null);
    assert.deepEqual(refugeDestination(box.left+box.width,box.top+box.height,box,width,height),{x:.22,y:.10});
  }
  assert.equal(refugeDestination(0,0,{left:0,top:0,width:0,height:0},0,0),null);
});

test('movement speed is independent of direction and frame rate, and stops exactly', () => {
  const start={x:0,y:0},end={x:.2,y:.08};
  const advance=dt=>advanceRefuge(start,end,1000,600,dt);
  const p=advance(32),q=advanceRefuge(advance(16),end,1000,600,16);
  assert.ok(Math.abs(p.x-q.x)<1e-12&&Math.abs(p.y-q.y)<1e-12);
  const horizontal=advanceRefuge(start,{x:.2,y:0},1000,600,32);
  assert.ok(Math.abs(Math.hypot(p.x*1000,p.y*600)-horizontal.x*1000)<1e-10);
  let current=start;
  for(let i=0;i<200;i++)current=advanceRefuge(current,end,1000,600,33);
  assert.deepEqual(current,end);
  assert.deepEqual(advanceRefuge(start,end,1000,600,10000),advance(64));
  assert.deepEqual(advanceRefuge(start,end,1000,600,0,true),end);
});

// Exercise the actual renderer's fallback without a browser or artwork server.
test('missing artwork recenters the soul and cancels its old destination', async () => {
  let source=await readFile(new URL('../web/modules/game-viewport.js',import.meta.url),'utf8');
  source=source.replace("import { CompanionBodyRenderer } from './companion-body.js';",'class CompanionBodyRenderer {}')
    .replace("import { manifestationStatus } from './manifestation-rules.js';",'const manifestationStatus = () => null;')
    .replace("'./refuge-motion.js'",JSON.stringify(new URL('../web/modules/refuge-motion.js',import.meta.url).href));
  const {HolographicCoreRenderer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const oldDocument=globalThis.document;
  globalThis.document={getElementById:()=>null};
  try {
    const gradient={addColorStop(){}};
    const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>gradient:()=>{},set:()=>true});
    const r=new HolographicCoreRenderer();
    Object.assign(r,{ctx,width:1000,height:600,background:{},motion:{matches:false},bodyActive:true,body:{available:false},position:{x:.2,y:.1},destination:{x:.22,y:.08},lastRenderTime:100});
    r.render(0);
    assert.deepEqual(r.position,{x:0,y:0});
    assert.deepEqual(r.destination,{x:0,y:0});
    assert.equal(r.lastRenderTime,100,'a resize/art redraw must not reset animation time');
  } finally {globalThis.document=oldDocument;}
});
