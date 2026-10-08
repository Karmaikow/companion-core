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

test('favorite color and animals from Didi are saved and grounded on later questions', async () => {
  const core = CompanionCore.create(MAYUNA_PROFILE);
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Anotado, Didi!'; } }, new ConversationHistory(6));

  await engine.interact('Errou, a minha cor favorita é verde-musgo!');
  await engine.interact('Fênix e dragões são meus animais místicos favoritos!');

  const colorContext = AIContextBuilder.build(core.getState(), 'Qual é a minha cor favorita?');
  assert.match(resolveIdentityQuestion(colorContext), /verde-musgo/);
  const animalContext = AIContextBuilder.build(core.getState(), 'Qual é o meu animal favorito?');
  assert.match(resolveIdentityQuestion(animalContext), /fênix e dragões/);
});

test('favorite color question about Mayuna uses the profile value', () => {
  const state = CompanionCore.create(MAYUNA_PROFILE).getState();
  const context = AIContextBuilder.build(state, 'Qual é a sua cor favorita?');
  assert.match(resolveIdentityQuestion(context), /azul-safira/);
});
