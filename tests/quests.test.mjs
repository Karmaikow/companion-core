import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CompanionCore} from '../dist/core/core.js';
import {MAYUNA_PROFILE} from '../dist/companions/mayuna.js';
import {companionQuests} from '../dist/core/quests.js';
import {CompanionRuntime} from '../dist/server/companion-runtime.js';
test('quests recognize existing evidence and recurring chapters require new memories plus distinct conversations',()=>{
 const core=CompanionCore.create(MAYUNA_PROFILE);
 core.addMemory('IDENTITY_FORMING','Ser favorito de Mayuna','Mayuna declarou que seu ser favorito é passarinhos.',90,[]);
 for(let i=0;i<10;i++)core.addMemory('SIGNIFICANT',`Lição ${i}`,`Uma lembrança importante e distinta ${i}.`,80,[]);
 core.processEvent('SOCIAL',{}, {bond:15});
 assert.ok(companionQuests(core.getData()).every(q=>q.ready));
 for(const q of companionQuests(core.getData()))core.processEvent('SYSTEM',{kind:'QUEST_REWARD',questId:q.id,memoryIds:core.getState().memories.map(m=>m.id)},{coreXp:q.xp});
 let chapter=companionQuests(core.getData()).at(-1);assert.equal(chapter.id,'chapter-1');assert.equal(chapter.ready,false);
 for(let i=0;i<5;i++){core.addMemory('SIGNIFICANT',`Nova ${i}`,`Outra experiência especial ${i}.`,80,[]);core.processEvent('CONVERSATION',{userMessage:'Mensagem repetida'},{});}
 assert.equal(companionQuests(core.getData()).at(-1).ready,false);
 for(let i=0;i<4;i++)core.processEvent('CONVERSATION',{userMessage:'Escolha diferente '+i},{});
 chapter=companionQuests(core.getData()).at(-1);assert.equal(chapter.ready,true);assert.ok(chapter.xp>=180&&chapter.xp<=500);
});
test('quest rewards serialize, persist, reject unearned claims and cannot receive client XP amounts',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'quest-test-'));const provider={name:'mock',generateResponse:async()=> 'Olá.'};
 try{
 const runtime=new CompanionRuntime(provider,root,'');await runtime.initialize();const start=await runtime.createCompanion({name:'Test',ownerName:'Didi',preferredAddress:'Didi',archetype:'curious'});const id=start.identity.id;
 await assert.rejects(runtime.claimQuest(id,'bond-fifteen'),e=>e.status===409);
 for(let i=0;i<15;i++)await runtime.chat('Vamos conversar sobre o caminho '+i+'?');
 const before=runtime.getClientState(),results=await Promise.allSettled([runtime.claimQuest(id,'bond-fifteen'),runtime.claimQuest(id,'bond-fifteen')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='fulfilled').value.xp,150);
 assert.equal(runtime.getClientState().meta.eventCount,before.meta.eventCount+1);assert.equal(runtime.verify().valid,true);
 const restarted=new CompanionRuntime(provider,root,'');await restarted.initialize();await assert.rejects(restarted.claimQuest(id,'bond-fifteen'),e=>e.status===409);await assert.rejects(restarted.claimQuest('MC-WRONG','own-color'),e=>e.status===409);assert.ok(restarted.getClientState().quests.find(q=>q.id==='bond-fifteen').claimed);
 }finally{await rm(root,{recursive:true,force:true});}
});
