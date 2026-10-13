import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CompanionCore} from '../dist/core/core.js';
import {InteractionEngine} from '../dist/core/interaction-engine.js';
import {ConversationHistory} from '../dist/interaction/conversation-history.js';
import {AIContextBuilder} from '../dist/ai/ai-context.js';
import {resolvePreferenceQuestion} from '../dist/ai/preference-grounding.js';
import {evolutionEvidence} from '../dist/core/manifestation.js';
import {MAYUNA_PROFILE} from '../dist/companions/mayuna.js';
import {LocalStore} from '../dist/storage/store.js';
function fixture(){const p=structuredClone(MAYUNA_PROFILE);p.name='Lunaya';p.preferences={favoriteColor:'',favoriteThings:[]};p.appearance={soulColor:'#faf80d',formInfluences:[]};return CompanionCore.create(p);}

test('exact Lunaya color/animal choices survive disk reload and count toward evolution',async()=>{
 const core=fixture();let requests=0;
 const provider={name:'test',async generateResponse(context){
  const grounded=resolvePreferenceQuestion(context);if(grounded)return grounded;
  requests++;
  return context.userMessage.includes('cor')
   ? 'Minha cor favorita é **violeta**. Ela me faz lembrar dos crepúsculos imaginários do Refúgio. E a sua, Didi?'
   : 'Ah! Um animal favorito? Então eu escolho **o lince**. Ele combina curiosidade, independência e uma elegância quase mística.';
 }};
 const engine=new InteractionEngine(core,provider,new ConversationHistory(6));
 await engine.interact('Vamos definir uma cor favorita para você ?');
 await engine.interact('Vamos definir um animal favorito para você agora?');
 const evidence=evolutionEvidence(core.getState());assert.equal(evidence.favoriteColor,'violeta');assert.equal(evidence.favoriteBeing,'lince');assert.equal(evidence.markingColor,'#bf6cff');
 const root=await mkdtemp(path.join(tmpdir(),'lunaya-preferences-'));
 try{
  const store=new LocalStore(root);await store.save(core.getData());await store.savePrivateKey(core.getState().identity.id,core.getPrivateKey());
  const id=core.getState().identity.id;const restored=CompanionCore.from(await store.load(id),await store.loadPrivateKey(id));
  const reconnected=new InteractionEngine(restored,provider,new ConversationHistory(6));
  assert.match((await reconnected.interact('Lunaya qual a sua cor favorita ??')).response,/violeta/);
  assert.match((await reconnected.interact('Lunaya qual seu animal favorito/')).response,/lince/);
  await reconnected.interact('Vamos definir uma cor favorita para você?');
  await reconnected.interact('Vamos definir um animal favorito para você agora?');
  assert.equal(requests,2,'known choices are recalled without another model selection');
  assert.equal(restored.getState().memories.filter(m=>/favorit[oa] de Lunaya/.test(m.title)).length,2);
  assert.equal(restored.getState().profile.appearance.soulColor,'#faf80d');assert.equal(restored.verifyLocal().valid,true);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('previously stored Markdown color is recalled despite empty profile and recognized by evolution',()=>{
 const core=fixture();core.addMemory('IDENTITY_FORMING','Cor favorita de Lunaya','Lunaya declarou que sua cor favorita é **violeta**.',90);
 assert.match(resolvePreferenceQuestion(AIContextBuilder.build(core.getState(),'Qual sua cor favorita?')),/violeta/);
 assert.equal(evolutionEvidence(core.getState()).favoriteColor,'violeta');
});

test('a stored phoenix is not rerolled by another definition request; human and fiction remain separate',async()=>{
 const core=fixture();core.addMemory('IDENTITY_FORMING','Animal favorito de Lunaya','Lunaya escolheu fênix.',90);
 assert.match(resolvePreferenceQuestion(AIContextBuilder.build(core.getState(),'Vamos definir um animal favorito para você agora?')),/fênix/);
 const fresh=fixture();const engine=new InteractionEngine(fresh,{name:'test',async generateResponse(){return 'Minha cor favorita é **violeta**.';}},new ConversationHistory(6));
 await engine.interact('Conte uma história: vamos definir uma cor favorita para você?');
 await engine.interact('Vamos definir uma cor favorita para mim?');
 assert.equal(evolutionEvidence(fresh.getState()).favoriteColor,null);
 assert.equal(fresh.getState().memories.filter(m=>m.title==='Cor favorita de Lunaya').length,0);
});
