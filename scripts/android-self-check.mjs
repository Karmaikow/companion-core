import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Run this in its own process: the Runtime reads the data root on import.
const isolatedRoot = await mkdtemp(path.join(tmpdir(), 'mayuna-android-check-'));
process.env.MAYUNA_DATA_DIR = isolatedRoot;
try {
  const { CompanionRuntime } = await import('../dist/server/companion-runtime.js');
  const { MockAIProvider } = await import('../dist/ai/mock-ai-provider.js');
  const runtime = new CompanionRuntime(new MockAIProvider());
  await runtime.initialize();
  assert.equal(runtime.hasCompanion(),false);
  await runtime.createCompanion({name:'Lunaya',ownerName:'Teste',preferredAddress:'Teste',soulColor:'#64834b',traits:['openness-0','stability-0']});
  const initial = structuredClone(runtime.getClientState());
  for (const message of ['Olá', 'Como está?', 'Vamos conversar', 'Estou aqui', 'Até logo']) await runtime.chat(message);
  const state = structuredClone(runtime.getClientState());
  assert.equal(state.identity.id, initial.identity.id);
  assert.equal(state.meta.eventCount, initial.meta.eventCount + 5);
  assert.ok(state.meta.snapshotCount > initial.meta.snapshotCount);
  assert.equal(runtime.verify().valid, true);
  assert.ok(!/privateKey|PRIVATE KEY|cryptographicIdentity/.test(JSON.stringify(state)));
  const resumed = new CompanionRuntime(new MockAIProvider());
  await resumed.initialize();
  assert.deepEqual(resumed.getClientState(), state);
  assert.equal(resumed.verify().valid, true);
  console.log('PASSOU: identidade Ed25519, 5 interações, eventos, snapshot, persistência, reinício e DTO sem chave privada.');
  console.log('Teste isolado: nenhuma Companion existente foi aberta ou alterada.');
} catch (error) {
  console.error('Falha no diagnóstico:', error.message); process.exitCode = 1;
} finally { await rm(isolatedRoot, { recursive: true, force: true }); }
