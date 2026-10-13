import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionCore } from '../dist/core/core.js';
import { MAYUNA_PROFILE } from '../dist/companions/mayuna.js';
import { InteractionEngine } from '../dist/core/interaction-engine.js';
import { ConversationHistory } from '../dist/interaction/conversation-history.js';
import { manifestationStatus, evolutionEvidence } from '../dist/core/manifestation.js';
import { resolvePreferenceQuestion } from '../dist/ai/preference-grounding.js';
import { AIContextBuilder } from '../dist/ai/ai-context.js';

function fixture() {
 const profile=structuredClone(MAYUNA_PROFILE);profile.name='Celi';profile.preferences.favoriteColor='';
 profile.appearance={soulColor:'#edbd54',formInfluences:[]};
 return CompanionCore.create(profile);
}
function progressed(core) {
 core.processEvent('CONVERSATION',{message:'fixture progression'},{coreXp:2000,combatXp:0,bond:20});
}
function memories(core,total=10) {
 // Genesis is one of the relevant memories.
 for(let i=1;i<total;i++)core.addMemory('SIGNIFICANT',`Experiência compartilhada ${i}`,`Celi e Didi aprenderam juntos a lição ${i}.`,80,[]);
}
function choices(core) {
 core.addMemory('IDENTITY_FORMING','Cor favorita de Celi','Celi declarou que sua cor favorita é verde-musgo.',90,[]);
 core.addMemory('IDENTITY_FORMING','Ser favorito de Celi','Celi declarou que seu ser favorito é fantasmas.',90,[]);
}
test('soul color and human favorites cannot satisfy the Companion choices; preview is read-only',()=>{
 const core=fixture();progressed(core);memories(core);
 core.addMemory('IDENTITY_FORMING','Cor favorita de Didi','Didi contou que sua cor favorita é verde-musgo.',90,[]);
 core.addMemory('IDENTITY_FORMING','Animal favorito de Didi','Didi contou que seu animal favorito é dragões.',90,[]);
 const before=core.getData();const status=manifestationStatus(core.getState());
 assert.equal(status.ready,false);assert.equal(status.hasBody,false);
 assert.equal(evolutionEvidence(core.getState()).favoriteColor,null);
 assert.equal(evolutionEvidence(core.getState()).favoriteBeing,null);
 core.refreshEvolution();assert.deepEqual(core.getData(),before);
});
test('ten distinct relevant memories are required; repetitions, weak episodes and archived memories do not count',()=>{
 const core=fixture();progressed(core);choices(core);memories(core,7); // 1 genesis + 2 choices + 6 experiences = 9.
 core.addMemory('EPISODIC','Uma fala','Apenas uma conversa.',90,[]);
 core.addMemory('SIGNIFICANT','Fraco','Um detalhe pequeno.',20,[]);
 const data=core.getData();data.state.memories.push({...data.state.memories[0],id:'duplicate',title:'Outra descrição do mesmo despertar'});
 const same=CompanionCore.from(data,core.getPrivateKey());
 assert.equal(evolutionEvidence(same.getState()).relevantMemoryIds.length,9);same.refreshEvolution();assert.equal(same.getState().core.evolutionStage,'SOUL');
 same.addMemory('SIGNIFICANT','Décima experiência','Um momento marcante e diferente vivido juntos.',80,[]);same.refreshEvolution();assert.equal(same.getState().core.evolutionStage,'AWAKENED');
 const archived=core.getState();archived.profile.bondHistory=[{archivedMemoryIds:archived.memories.map(m=>m.id)}];assert.equal(evolutionEvidence(archived).relevantMemoryIds.length,0);
});
test('an explicit ghost choice completes evolution once, preserves soul color and survives reload with signed evidence',async()=>{
 const core=fixture();progressed(core);memories(core,9); // Enough after choices.
 const engine=new InteractionEngine(core,{name:'test',async generateResponse(ctx){return /cor/.test(ctx.userMessage)?'Minha cor favorita é verde-musgo.':'Eu gosto muito de fantasmas.';}},new ConversationHistory(6));
 await engine.interact('Escolha a sua cor favorita?');assert.equal(core.getState().core.evolutionStage,'SOUL');
 await engine.interact('Qual seu ser favorito?');
 const state=core.getState();assert.equal(state.core.evolutionStage,'AWAKENED');assert.equal(state.form.archetype,'SPECTRAL');assert.equal(state.form.soulColor,'#edbd54');assert.equal(state.form.markingColor,'#64834b');
 const event=core.getData().events.find(e=>e.type==='EVOLUTION');assert.equal(event.data.evidence.relevantMemoryIds.length,10);assert.equal(event.data.evidence.favoriteBeing,'fantasmas');
 core.refreshEvolution();assert.equal(core.getData().events.filter(e=>e.type==='EVOLUTION').length,1);
 core.createSnapshot();const reloaded=CompanionCore.from(JSON.parse(JSON.stringify(core.getData())),core.getPrivateKey());assert.equal(reloaded.verifyLocal().valid,true);assert.deepEqual(reloaded.getState().form,state.form);
 assert.match(resolvePreferenceQuestion(AIContextBuilder.build(reloaded.getState(),'Qual seu ser favorito?')),/fantasmas/);
});
test('bond and level are independent gates, and old evolved companions never regress',()=>{
 const low=fixture();choices(low);memories(low);low.processEvent('CONVERSATION',{}, {coreXp:0,combatXp:0,bond:15});assert.equal(low.getState().core.evolutionStage,'SOUL');
 const core=fixture();choices(core);memories(core);core.refreshEvolution();assert.equal(core.getState().core.evolutionStage,'SOUL');
 core.processEvent('CONVERSATION',{}, {coreXp:2000,combatXp:0,bond:0});assert.equal(core.getState().core.evolutionStage,'SOUL');
 core.processEvent('CONVERSATION',{}, {coreXp:0,combatXp:0,bond:15});assert.equal(core.getState().core.evolutionStage,'AWAKENED');
 const data=core.getData();data.state.memories=[];data.state.form=undefined;const legacy=CompanionCore.from(data,core.getPrivateKey());legacy.refreshEvolution();assert.equal(legacy.getState().core.evolutionStage,'AWAKENED');
});
