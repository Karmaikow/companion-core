import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionCore } from '../dist/core/core.js';
import { InteractionEngine } from '../dist/core/interaction-engine.js';
import { ConversationHistory } from '../dist/interaction/conversation-history.js';
import { MAYUNA_PROFILE } from '../dist/companions/mayuna.js';
import { AIContextBuilder } from '../dist/ai/ai-context.js';
import { resolveIdentityQuestion } from '../dist/ai/identity-grounding.js';
import { MemoryRetriever } from '../dist/memory/memory-retriever.js';

test('context addresses Didi directly in second person', () => {
  const state = CompanionCore.create(MAYUNA_PROFILE).getState();
  const context = AIContextBuilder.build(state, 'Oi, voltei!');
  assert.match(context.systemPrompt, /conversando diretamente com Didi/);
  assert.match(context.systemPrompt, /não fale dele na terceira pessoa/);
  assert.match(context.systemPrompt, /mundo de fantasia/i);
  assert.match(context.systemPrompt, /dragões, fênix e monstros/);
  assert.equal(context.companionPreferences.favoriteColor, 'azul-safira');
});

test('unrelated high importance color memory is excluded from animal question', () => {
  const state = CompanionCore.create(MAYUNA_PROFILE).getState();
  const memories = [{
    id: 'memory-1', type: 'IDENTITY_FORMING', title: 'Cor favorita de Didi',
    content: 'Didi contou que sua cor favorita é verde-musgo.', timestamp: new Date().toISOString(),
    emotionalWeight: 100, relatedEvents: []
  }];
  assert.deepEqual(MemoryRetriever.retrieve(memories, 'Qual é meu animal favorito?', 4, state), []);
});

test('questions are not mistaken for facts; explicit color and animal preferences are remembered', async () => {
  const core = CompanionCore.create(MAYUNA_PROFILE);
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Anotado, Didi!'; } }, new ConversationHistory(6));

  const unansweredColor = AIContextBuilder.build(core.getState(), 'Perfeita, e qual a minha cor favorita??');
  assert.match(resolveIdentityQuestion(unansweredColor), /ainda não me contou/);
  await engine.interact('Perfeita, e qual a minha cor favorita??');
  assert.equal(core.getState().memories.some(memory => memory.title.includes('Cor favorita de Didi')), false);
  await engine.interact('Minha cor favorita é a verde-musgo! kkkk');
  await engine.interact('Animais simples, o meu favorito seriam os lobos, e animais místicos com certeza dragões :D');

  const colorContext = AIContextBuilder.build(core.getState(), 'Qual é a minha cor favorita?');
  assert.match(resolveIdentityQuestion(colorContext), /verde-musgo/);
  const animalContext = AIContextBuilder.build(core.getState(), 'Qual é o meu animal favorito?');
  assert.match(resolveIdentityQuestion(animalContext), /lobos/);
  const mythicalContext = AIContextBuilder.build(core.getState(), 'Quais são meus animais místicos favoritos?');
  assert.match(resolveIdentityQuestion(mythicalContext), /dragões/);
});

test('user likes are saved but incidental assistant likes are not', async () => {
  const core = CompanionCore.create(MAYUNA_PROFILE);
  const engine = new InteractionEngine(core, {
    name: 'test',
    async generateResponse() { return 'Eu adoro pássaros! Eles são incríveis, e Didi também gosta deles.'; }
  }, new ConversationHistory(6));
  await engine.interact('Eu gosto de pássaros tbm, são incríveis, qual seu pássaro místico favorito?');

  const memories = core.getState().memories;
  const didi = memories.find(memory => memory.title === 'Didi gosta de pássaros');
  const mayuna = memories.find(memory => memory.title === 'Mayuna gosta de pássaros');
  assert.ok(didi, 'the user preference should be stored separately');
  assert.equal(mayuna, undefined, 'casual agreement must not become a permanent preference');
  assert.doesNotMatch(didi.title, /incríveis|favorito|místico/i);
  assert.doesNotMatch(AIContextBuilder.build(core.getState(), 'Você gosta de pássaros?').systemPrompt, /Mayuna gosta de pássaros/);
});

test('plural favorite animals remain available in a later conversation', async () => {
  const core = CompanionCore.create(MAYUNA_PROFILE);
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Entendi, Didi!'; } }, new ConversationHistory(6));
  await engine.interact('Meu animal favorito são lobos e dragões.');
  const context = AIContextBuilder.build(core.getState(), 'Qual é o meu animal favorito?');
  assert.match(resolveIdentityQuestion(context), /lobos e dragões/);
});

test('favorite color question about Mayuna uses the profile value', () => {
  const state = CompanionCore.create(MAYUNA_PROFILE).getState();
  const context = AIContextBuilder.build(state, 'Qual é a sua cor favorita?');
  assert.match(resolveIdentityQuestion(context), /azul-safira/);
});

test('old malformed preference memories do not become confident answers', () => {
  const state = CompanionCore.create(MAYUNA_PROFILE).getState();
  const memories = [
    { id: 'bad-color', type: 'IDENTITY_FORMING', title: 'Cor favorita de Didi', content: 'Didi contou que sua cor favorita é vc sabe.', timestamp: new Date().toISOString(), emotionalWeight: 100, relatedEvents: [] },
    { id: 'bad-animal', type: 'IDENTITY_FORMING', title: 'Animal favorito de Didi', content: 'Didi contou que seu animal favorito é verde-musgo.', timestamp: new Date().toISOString(), emotionalWeight: 100, relatedEvents: [] }
  ];
  const color = AIContextBuilder.build(state, 'Qual é minha cor favorita?');
  color.memories = [memories[0]];
  assert.match(resolveIdentityQuestion(color), /ainda não me contou/);
  const animal = AIContextBuilder.build(state, 'Qual é meu animal favorito?');
  animal.memories = [memories[1]];
  assert.match(resolveIdentityQuestion(animal), /ainda não me contou/);
});

test('Mayuna keeps her own animal and mystical bird choices after the first answer', async () => {
  const core = CompanionCore.create(MAYUNA_PROFILE);
  const responses = [
    'Meu animal favorito é pássaros. Eles são leves!',
    'Meu pássaro místico favorito é corvo com penas azul-safira.'
  ];
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return responses.shift(); } }, new ConversationHistory(6));
  await engine.interact('Qual seu animal favorito?');
  await engine.interact('Qual seu pássaro místico favorito?');

  const animal = AIContextBuilder.build(core.getState(), 'Qual seu animal favorito?');
  assert.match(resolveIdentityQuestion(animal), /pássaros/);
  const bird = AIContextBuilder.build(core.getState(), 'Qual seu pássaro místico favorito?');
  assert.match(resolveIdentityQuestion(bird), /corvo com penas azul-safira/);
});

test('favorites and owners survive disk reload with natural question variants', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { LocalStore } = await import('../dist/storage/store.js');
  const dir = await mkdtemp(join(tmpdir(), 'mayuna-preferences-'));
  try {
    const core = CompanionCore.create(MAYUNA_PROFILE);
    const replies = ['Entendi!', 'Meu animal favorito é pássaros.'];
    const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return replies.shift(); } }, new ConversationHistory(6));
    await engine.interact('Meu animal favorito são lobos e dragões');
    await engine.interact('E seu animal preferido é qual?');
    const store = new LocalStore(dir);
    await store.save(core.getData());
    const restored = CompanionCore.from(await store.load(core.getState().identity.id), core.getPrivateKey());
    const ask = question => resolveIdentityQuestion(AIContextBuilder.build(restored.getState(), question));
    assert.match(ask('Qual meu animal preferido?'), /lobos e dragões/);
    assert.match(ask('E qual seu animal preferido?'), /pássaros/);
    assert.match(ask('Você tem uma cor favorita?'), /azul-safira/);
    assert.match(ask('Oie, qual o meu nome?'), /Você é Didi/);
    assert.deepEqual(restored.getState().memories, core.getState().memories);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a question about a liking is not saved as a preference', async () => {
  const core = CompanionCore.create(MAYUNA_PROFILE);
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Eu gosto de lobos? Ainda estou descobrindo.'; } }, new ConversationHistory(6));
  await engine.interact('Eu gosto de dragões?');
  assert.equal(core.getState().memories.some(m => /gosta de/.test(m.title)), false);
});

test('invalid legacy color cannot hide a valid color later in the context', () => {
  const context = AIContextBuilder.build(CompanionCore.create(MAYUNA_PROFILE).getState(), 'Qual minha cor preferida?');
  context.memories = [
    { title:'A Cor de Didi', content:'Didi contou que sua cor favorita é vc sabe.', importance:100 },
    { title:'Cor favorita de Didi', content:'Didi contou que sua cor favorita é verde-musgo.', importance:100 }
  ];
  assert.match(resolveIdentityQuestion(context), /verde-musgo/);
});
