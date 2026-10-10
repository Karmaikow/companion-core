import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompanionCore } from '../dist/core/core.js';
import { MAYUNA_PROFILE } from '../dist/companions/mayuna.js';
import { AIContextBuilder } from '../dist/ai/ai-context.js';
import { resolveIdentityQuestion } from '../dist/ai/identity-grounding.js';
import { InteractionEngine } from '../dist/core/interaction-engine.js';
import { ConversationHistory } from '../dist/interaction/conversation-history.js';
import { LocalStore } from '../dist/storage/store.js';

function setup() {
  const profile = structuredClone(MAYUNA_PROFILE);
  profile.name = 'Aurora';
  profile.companionOf = { name: 'Alex', preferredAddress: 'Alex' };
  const core = CompanionCore.create(profile);
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Entendi, Alex.'; } }, new ConversationHistory(6));
  return { core, engine };
}

test('equivalent preferences reuse records without merging two owners or episodes', () => {
  const { core } = setup();
  const first = core.addMemory('SIGNIFICANT', 'Alex gosta de pássaros', 'Alex contou que gosta de pássaros.', 70);
  assert.equal(core.addMemory('SIGNIFICANT', 'Alex gosta de passarinhos!', 'Alex contou que gosta de passarinhos!', 70).id, first.id);
  assert.notEqual(core.addMemory('SIGNIFICANT', 'Aurora gosta de pássaros', 'Aurora disse que gosta de pássaros.', 70).id, first.id);
  const a = core.addMemory('EPISODIC', 'Passeio', 'Vi uma árvore.', 50);
  assert.notEqual(core.addMemory('EPISODIC', 'Passeio', 'Vi uma árvore.', 50).id, a.id);
});

test('legacy and repeated color facts produce one current fact and one journal entry', async () => {
  const { core, engine } = setup();
  core.addMemory('IDENTITY_FORMING', 'A Cor de Alex', 'Alex contou que sua cor favorita é a verde-musgo .', 100);
  core.addJournal('FOUNDATIONAL', 'A Cor de Alex', 'Alex contou que sua cor favorita é a verde-musgo .');
  await engine.interact('Minha cor preferida é verde-musgo! kkkk');
  await engine.interact('Minha cor favorita é verde musgo.');
  assert.equal(core.getState().memories.length, 2);
  assert.equal(core.getState().journal.length, 2);
});

test('changed favorite and change back survive storage; signed history remains valid', async () => {
  const { core, engine } = setup();
  await engine.interact('Minha cor favorita é verde-musgo.');
  await engine.interact('Minha cor favorita é vermelho.');
  assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Qual a minha cor favorita?')), /vermelho/);
  await engine.interact('Minha cor favorita é verde-musgo.');
  const root = await mkdtemp(join(tmpdir(), 'memory-facts-'));
  try {
    const store = new LocalStore(root);
    await store.save(core.getData());
    const restored = CompanionCore.from(await store.load(core.getState().identity.id), core.getPrivateKey());
    assert.match(resolveIdentityQuestion(AIContextBuilder.build(restored.getState(), 'Qual a minha cor favorita?')), /verde-musgo/);
    assert.equal(restored.verifyLocal().valid, true);
    assert.deepEqual(restored.getData().events, core.getData().events);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unknown answers and questions never become preferences', async () => {
  const { core, engine } = setup();
  await engine.interact('Minha cor favorita é vc sabe.');
  await engine.interact('Meu animal favorito é qual?');
  await engine.interact('Meu animal favorito é não sei.');
  assert.equal(core.getState().memories.length, 1);
});

test('all companions receive their own relationship and fantasy setting without fabricated adventures', () => {
  const { core } = setup();
  core.addMemory('SIGNIFICANT', 'Aurora gosta de pássaros', 'Aurora disse que gosta de pássaros.', 75);
  const context = AIContextBuilder.build(core.getState(), 'Oi!');
  assert.match(context.systemPrompt, /usuário é seu companheiro humano/);
  assert.match(context.systemPrompt, /conversando diretamente com Alex/);
  assert.match(context.systemPrompt, /Aurora disse que gosta de pássaros/);
  assert.match(context.systemPrompt, /Refúgio/);
  assert.match(context.systemPrompt, /Não afirme ter visitado lugares, encontrado criaturas ou vivido aventuras enquanto a aplicação estava fechada/);
  assert.doesNotMatch(context.systemPrompt, /Didi|Mayuna/);
});

test('fictional first-person narration is not an autobiographical preference', async () => {
  const { core } = setup();
  const engine = new InteractionEngine(core, { name: 'test', async generateResponse() { return 'Eu adoro dragões!'; } }, new ConversationHistory(6));
  await engine.interact('Conte uma história em primeira pessoa sobre um cavaleiro.');
  assert.equal(core.getState().memories.length, 1);
});

test('a statement followed by a question still saves only the statement', async () => {
  const { core, engine } = setup();
  await engine.interact('Minha cor favorita é verde-musgo. Qual é a sua?');
  await engine.interact('Meu animal favorito são lobos. E o seu?');
  assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Qual a minha cor favorita?')), /verde-musgo/);
  assert.match(resolveIdentityQuestion(AIContextBuilder.build(core.getState(), 'Qual meu animal favorito?')), /lobos/);
});
