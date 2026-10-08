import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = await mkdtemp(path.join(tmpdir(), 'mayuna-runtime-'));
process.env.MAYUNA_DATA_DIR = path.join(root, 'data');
const { CompanionRuntime } = await import('../dist/server/companion-runtime.js');
const { generateIdentity } = await import('../dist/crypto/crypto.js');
// Generate a disposable fixture; never read a real Companion's data folder.
const bootstrap = new CompanionRuntime({ name:'fixture', async generateResponse(){ return 'Estou aqui.'; } });
await bootstrap.initialize();
await bootstrap.chat('Minha cor favorita é verde-musgo');
const fixture = path.join(root, 'fixture');
await cp(process.env.MAYUNA_DATA_DIR, fixture, {recursive:true});
const active = JSON.parse(await readFile(path.join(fixture,'active-companion.json'),'utf8')).id;
const original = JSON.parse(await readFile(path.join(fixture,`${active}.json`),'utf8'));
const provider = { name:'mock', async generateResponse(){ return 'Estou aqui com você.'; } };
beforeEach(async()=>{ await rm(process.env.MAYUNA_DATA_DIR,{recursive:true,force:true});await cp(fixture,process.env.MAYUNA_DATA_DIR,{recursive:true}); });
after(()=>rm(root,{recursive:true,force:true}));
const stateFile = () => path.join(process.env.MAYUNA_DATA_DIR,`${active}.json`);

test('loads the existing identity without rewriting memories, events or snapshots', async()=>{
 const before=await readFile(stateFile());const runtime=new CompanionRuntime(provider);await runtime.initialize();
 assert.deepEqual(await readFile(stateFile()),before);
 const state=runtime.getClientState();assert.equal(state.identity.id,active);assert.deepEqual(state.memories,original.state.memories);assert.deepEqual(state.core,original.state.core);
 assert.equal(state.meta.eventCount,original.events.length);assert.equal(state.meta.snapshotCount,original.snapshots.length);
 assert.equal(runtime.verify().valid,true);
 const json=JSON.stringify(state);assert.ok(!json.includes('PRIVATE KEY'));assert.ok(!json.includes('privateKey'));assert.ok(!json.includes('cryptographicIdentity'));
});
test('missing private key never creates or replaces the identity', async()=>{
 const pointer=await readFile(path.join(process.env.MAYUNA_DATA_DIR,'active-companion.json'));
 await unlink(path.join(process.env.MAYUNA_DATA_DIR,'secure',`${active}.key.json`));
 await assert.rejects(new CompanionRuntime(provider).initialize(),/Nenhuma identidade/);
 assert.deepEqual(await readFile(path.join(process.env.MAYUNA_DATA_DIR,'active-companion.json')),pointer);
 assert.deepEqual(JSON.parse(await readFile(stateFile(),'utf8')),original);
});
test('wrong private key cannot operate an existing Companion',async()=>{
 await writeFile(path.join(process.env.MAYUNA_DATA_DIR,'secure',`${active}.key.json`),JSON.stringify({privateKey:generateIdentity().privateKey}));
 await assert.rejects(new CompanionRuntime(provider).initialize(),/Nenhuma identidade/);
});
test('corrupt active state is reported and never replaced with a new Companion',async()=>{
 const pointer=await readFile(path.join(process.env.MAYUNA_DATA_DIR,'active-companion.json'));
 await writeFile(stateFile(),'{"state":');
 await assert.rejects(new CompanionRuntime(provider).initialize(),/corrompido/);
 assert.deepEqual(await readFile(path.join(process.env.MAYUNA_DATA_DIR,'active-companion.json')),pointer);
 assert.equal(await readFile(stateFile(),'utf8'),'{"state":');
});
test('missing/corrupt active pointer does not abandon existing companions',async()=>{
 const pointer=path.join(process.env.MAYUNA_DATA_DIR,'active-companion.json');await unlink(pointer);
 await assert.rejects(new CompanionRuntime(provider).initialize(),/identidades sem ponteiro/);
 await writeFile(pointer,'not-json');await assert.rejects(new CompanionRuntime(provider).initialize());
});
test('parallel chats are serialized; original events and snapshots remain intact',async()=>{
 let concurrent=0,peak=0;
 const runtime=new CompanionRuntime({name:'mock',async generateResponse(){peak=Math.max(peak,++concurrent);await new Promise(r=>setTimeout(r,8));concurrent--;return 'Estou aqui com você.';}});
 await runtime.initialize();await Promise.all([runtime.chat('Olá Mayuna'),runtime.chat('Como está?'),runtime.chat('Vamos conversar')]);
 assert.equal(peak,1);assert.equal(runtime.getClientState().meta.eventCount,original.events.length+3);
 assert.equal(runtime.verify().valid,true);
 const saved=JSON.parse(await readFile(stateFile(),'utf8'));assert.deepEqual(saved.events.slice(0,original.events.length),original.events);assert.deepEqual(saved.snapshots.slice(0,original.snapshots.length),original.snapshots);
 const resumed=new CompanionRuntime(provider);await resumed.initialize();assert.deepEqual(resumed.getClientState(),runtime.getClientState());
});
test('provider failure does not grant XP or change memories and the queue recovers',async()=>{
 let fail=true;const runtime=new CompanionRuntime({name:'mock',async generateResponse(){if(fail)throw Error('Offline');return 'Estou aqui com você.';}});await runtime.initialize();const before=structuredClone(runtime.getClientState());
 await assert.rejects(runtime.chat('Olá'),/Offline/);assert.deepEqual(runtime.getClientState(),before);fail=false;await runtime.chat('Olá');assert.equal(runtime.getClientState().meta.eventCount,before.meta.eventCount+1);
});
