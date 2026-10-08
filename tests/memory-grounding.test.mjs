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

test('likes are saved as short facts under the person who expressed them', async () => {
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
  assert.ok(mayuna, 'Mayuna’s direct first-person preference should be stored');
  assert.doesNotMatch(didi.title, /incríveis|favorito|místico/i);
  assert.match(AIContextBuilder.build(core.getState(), 'Você gosta de pássaros?').systemPrompt, /Mayuna gosta de pássaros/);
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
    'Eu ainda estou aprendendo o que significa animal favorito, mas gosto muito de observar pássaros. Eles são leves!',
    'Sempre imaginei um corvo com penas azul-safira. Ele seria um mensageiro entre os mundos.'
  ];
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return responses.shift(); } }, new ConversationHistory(6));
  await engine.interact('Qual seu animal favorito?');
  await engine.interact('Qual seu pássaro místico favorito?');

  const animal = AIContextBuilder.build(core.getState(), 'Qual seu animal favorito?');
  assert.match(resolveIdentityQuestion(animal), /pássaros/);
  const bird = AIContextBuilder.build(core.getState(), 'Qual seu pássaro místico favorito?');
  assert.match(resolveIdentityQuestion(bird), /corvo com penas azul-safira/);
});
