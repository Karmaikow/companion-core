import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompanionCore } from '../dist/core/core.js';
import { MAYUNA_PROFILE } from '../dist/companions/mayuna.js';
import { AIContextBuilder } from '../dist/ai/ai-context.js';
import { resolveIdentityQuestion } from '../dist/ai/identity-grounding.js';
import { InteractionEngine } from '../dist/core/interaction-engine.js';
import { ConversationHistory } from '../dist/interaction/conversation-history.js';
import { LocalStore } from '../dist/storage/store.js';
import { OllamaProvider } from '../dist/ai/ollama-provider.js';

function fixture() {
  const profile = structuredClone(MAYUNA_PROFILE);
  profile.name = 'Aurora';
  profile.companionOf = { name: 'Ana', preferredAddress: 'Ana' };
  const core = CompanionCore.create(profile);
  for (const [title, content] of [
    ['Animal favorito de Ana', 'Ana contou que seus animais favoritos são lobos e dragões.'],
    ['Animais místicos favoritos de Ana', 'Ana contou que seus animais místicos favoritos são dragões.'],
    ['Pássaro místico favorito de Ana', 'Ana contou que seu pássaro místico favorito é fênix.'],
    ['Cor favorita de Ana', 'Ana contou que sua cor favorita é verde-musgo.'],
    ['Animal favorito de Aurora', 'Aurora escolheu passarinhos.'],
    ['Aurora gosta de dragões', 'Aurora disse que gosta de dragões.'],
    ['Aurora gosta de forma como a luz dança sobre ela', 'Aurora disse que gosta de forma como a luz dança sobre ela.'],
    ['Forma imaginada de Aurora', 'Aurora imaginou um corvo com penas de safira.'],
  ]) core.addMemory('SIGNIFICANT', title, content, 90);
  return core;
}

test('joint favorite questions use each owner and category, before and after disk restart', async () => {
  let core = fixture();
  const dir = await mkdtemp(join(tmpdir(), 'joint-facts-'));
  try {
    for (let round = 0; round < 2; round++) {
      for (const q of ['Qual nossos animais favoritos?', 'Me diz qual nossos animais favoritos mesmo??', 'Diga separadamente: meus animais favoritos e o seu animal favorito']) {
        const context = AIContextBuilder.build(core.getState(), q);
        context.memories = []; // Favorite recall must not depend on top-four narrative retrieval.
        const answer = await new OllamaProvider({ baseUrl: 'http://localhost:1' }).generateResponse(context);
        assert.match(answer, /Você.*lobos e dragões/);
        assert.match(answer, /Eu.*passarinhos/);
        assert.doesNotMatch(answer, /corvo|Ana me/);
      }
      for (const q of ['Qual a nossa cor preferida?', 'E nossa cor favoriita?', 'Diga separadamente: minha cor favorita e sua cor favorita.', 'Diga minha cor favorita e a sua cor favorita.']) {
        const answer = resolveIdentityQuestion(AIContextBuilder.build(core.getState(), q));
        assert.match(answer, /Você.*verde-musgo/);
        assert.match(answer, /Eu.*azul-safira/);
      }
      const store = new LocalStore(dir);
      await store.save(core.getData());
      core = CompanionCore.from(await store.load(core.getState().identity.id), core.getPrivateKey());
      assert.equal(core.verifyLocal().valid, true);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unknown favorites are not borrowed from likes, dreams or another owner', () => {
  const core = fixture();
  const answer = resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Quais nossos animais místicos favoritos?'));
  assert.match(answer, /Você.*dragões/);
  assert.match(answer, /Eu ainda não defini/);
  assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Qual meu pássaro místico favorito?')), /fênix/);
  const context = AIContextBuilder.build(core.getState(), 'Você gosta da luz?');
  assert.doesNotMatch(context.systemPrompt, /dança sobre ela/);
  assert.ok(core.getState().memories.some(m => m.title.includes('dança sobre ela')), 'legacy data stays intact');
});

test('casual agreement, unresolved pronouns and imaginary forms do not become favorites', async () => {
  const core = fixture();
  const before = core.getState().memories;
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Eu adoro dragões também! Eu gosto da forma como a luz dança sobre ela.'; } }, new ConversationHistory(6));
  await engine.interact('Qual nossos animais favoritos?');
  await engine.interact('Eu acho azul bonito.');
  assert.deepEqual(core.getState().memories, before);
  const fresh = CompanionCore.create(MAYUNA_PROFILE);
  const dream = new InteractionEngine(fresh, { name: 'test', async generateResponse() { return 'Eu não tenho um favorito, mas sempre imaginei um corvo de safira.'; } }, new ConversationHistory(6));
  await dream.interact('Qual seu pássaro místico favorito?');
  assert.equal(fresh.getState().memories.length, 1);
});

test('mystical animal statements do not overwrite general animals', async () => {
  const core = fixture();
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Entendi.'; } }, new ConversationHistory(6));
  await engine.interact('Meus animais místicos favoritos são fênix.');
  assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Qual meu animal favorito?')), /lobos e dragões/);
  assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Quais meus animais místicos favoritos?')), /fênix/);
});

test('fiction and new user assertions bypass preference recall', () => {
  const core = fixture();
  for (const q of ['Conte uma história sobre nossos animais favoritos.', 'Minha cor favorita é vermelho.']) {
    assert.equal(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), q)), null);
  }
});

test('new soul color never supplies either favorite; unknown own color stays grounded', async () => {
  const profile = structuredClone(MAYUNA_PROFILE);
  profile.name = 'Lunaya';
  profile.preferences = { favoriteThings: [] };
  profile.appearance = { soulColor: '#faf80d', formInfluences: [] };
  const core = CompanionCore.create(profile);
  for (const question of ['Me diz qual a sua cor favorita ??', 'Você tem uma cor favorita?', 'Qual a sua cor preferida?', 'Qual a cor favorita de vc?']) {
    const context = AIContextBuilder.build(core.getState(), question);
    const answer = await new OllamaProvider({ baseUrl: 'http://localhost:1' }).generateResponse(context);
    assert.match(answer, /Eu ainda não defini: cor favorita/);
    assert.doesNotMatch(answer, /faf80d|Sua cor favorita/);
  }
  assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Qual minha cor favorita?')), /ainda não me contou/);
  const intro = resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Oie, boa tarde!'));
  // Greeting plus time-of-day is handled by the same first-meeting presentation.
  assert.match(intro, /Lunaya.*Companion/);
  assert.match(intro, /alma.*Refúgio.*fantasia/);
  core.processEvent('CONVERSATION', { userMessage: 'Oi', response: intro }, { coreXp: 5, combatXp: 0, bond: 1 });
  assert.equal(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Boa tarde!')), null);
});

test('mixed declaration and suggestion reaches conversation with the new human fact; own color persists',async()=>{
 const profile=structuredClone(MAYUNA_PROFILE);profile.name='Lunaya';profile.preferences={favoriteThings:[]};profile.appearance={soulColor:'#faf80d',formInfluences:[]};
 let core=CompanionCore.create(profile);
 core.addMemory('IDENTITY_FORMING','Cor favorita de Didi','Didi contou que sua cor favorita é amarelo vivo.',90);
 const message='Aah a minha cor preferida é o verde-musgo. gostei da sua definição, talvez então a sua cor preferida seja o amarelo, não? ela pode representar a luz que ilumina e muda a tonalidade das coisas ao seu redor, oq acha??';
 const provider={name:'test',async generateResponse(context){
  assert.equal(resolveIdentityQuestion(context),null);
  assert.match(context.preferenceMemories.find(m=>m.title==='Cor favorita de Didi').content,/verde-musgo/);
  return 'Eu gosto dessa ideia! Minha cor favorita é amarelo vivo.';
 }};
 const engine=new InteractionEngine(core,provider,new ConversationHistory(6));
 await engine.interact(message);
 assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(),'Qual minha cor favorita?')),/verde-musgo/);
 assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(),'Qual sua cor favorita?')),/amarelo vivo/);
 const own=core.getState().memories.filter(m=>m.title==='Cor favorita de Lunaya');assert.equal(own.length,1);
 assert.equal(core.getState().profile.appearance.soulColor,'#faf80d');
 core=CompanionCore.from(core.getData(),core.getPrivateKey());
 assert.equal(core.verifyLocal().valid,true);
 assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(),'Qual sua cor favorita?')),/amarelo vivo/);
});

test('inviting an unknown color choice bypasses recall without treating a suggestion as a fact',async()=>{
 const profile=structuredClone(MAYUNA_PROFILE);profile.name='Lunaya';profile.preferences={favoriteThings:[]};const core=CompanionCore.create(profile);
 const question='Vamos definir a sua cor, me diz do q vc gosta?';
 assert.equal(resolveIdentityQuestion(AIContextBuilder.build(core.getState(),question)),null);
 const engine=new InteractionEngine(core,{name:'test',async generateResponse(){return 'Talvez eu escolha amarelo. Ainda não tenho uma cor favorita.';}},new ConversationHistory(6));
 await engine.interact(question);
 assert.equal(core.getState().memories.length,1);
});
