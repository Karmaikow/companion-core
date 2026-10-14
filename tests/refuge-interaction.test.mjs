import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {refugeReward} from '../dist/core/refuge-interaction.js';
import {CompanionRuntime} from '../dist/server/companion-runtime.js';
const stamp=Date.parse('2026-10-14T12:00:00Z');
const event=t=>({timestamp:new Date(t).toISOString(),data:{kind:'REFUGE_INTERACTION'}});
test('affection cooldown, daily cap, UTC reset and future timestamps',()=>{
 assert.equal(refugeReward([],stamp).awarded,true);
 assert.equal(refugeReward([event(stamp-59999)],stamp).awarded,false);
 assert.equal(refugeReward([event(stamp-60000)],stamp).awarded,true);
 assert.equal(refugeReward(Array.from({length:5},(_,i)=>event(stamp-i*60000)),stamp+60000).awarded,false);
 assert.equal(refugeReward([event(stamp)],stamp+86400000).awarded,true);
 assert.equal(refugeReward([event(stamp+3600000)],stamp).awarded,false);
});
test('parallel affection awards once, persists across restart, rejects stale identity, does not grant Core XP',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'refuge-'));const provider={name:'test',generateResponse:async()=>''};
 try{
 const runtime=new CompanionRuntime(provider,root,'');await runtime.initialize();
 const before=await runtime.createCompanion({name:'Test',ownerName:'Test',preferredAddress:'Test',archetype:'curious'});
 const id=before.identity.id;
 await assert.rejects(runtime.refugeInteraction('MC-OTHER'),e=>e.status===409);
 const results=await Promise.all(Array.from({length:8},()=>runtime.refugeInteraction(id)));
 assert.equal(results.filter(r=>r.awarded).length,1);
 const after=runtime.getClientState();assert.equal(after.bond.value,before.bond.value+1);assert.equal(after.core.xp,before.core.xp);assert.deepEqual(after.memories,before.memories);assert.equal(runtime.verify().valid,true);
 const restarted=new CompanionRuntime(provider,root,'');await restarted.initialize();assert.equal((await restarted.refugeInteraction(id)).awarded,false);assert.equal(restarted.getClientState().meta.eventCount,after.meta.eventCount);
 }finally{await rm(root,{recursive:true,force:true});}
});
