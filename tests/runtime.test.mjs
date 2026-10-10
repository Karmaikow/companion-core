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
await bootstrap.createCompanion({name:'Mayuna',ownerName:'Didi',preferredAddress:'Didi',archetype:'curious'});
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

test('empty installation awaits ritual; queued duplicate creation is blocked, including old test flag',async()=>{
 const isolated=await mkdtemp(path.join(tmpdir(),'companion-onboarding-'));
 const previous=process.env.MAYUNA_ALLOW_EXTRA_COMPANIONS;
 try{
  process.env.MAYUNA_ALLOW_EXTRA_COMPANIONS='1';
  const runtime=new CompanionRuntime(provider,isolated);await runtime.initialize();
  assert.equal(runtime.getActiveId(),null);assert.deepEqual(await runtime.listCompanions(),[]);
  assert.throws(()=>runtime.getClientState(),e=>e.status===409);await assert.rejects(runtime.chat('Olá'),e=>e.status===409);
  const input={name:'Lunaya',ownerName:'Diego',preferredAddress:'Didi',soulColor:'#64834b',traits:['openness-0','agreeableness-2']};
  await assert.rejects(runtime.createCompanion({...input,traits:['invalid']}),/inválido/);
  assert.equal(runtime.hasCompanion(),false);
  const results=await Promise.allSettled([runtime.createCompanion(input),runtime.createCompanion({...input,name:'Segunda'})]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.status,409);
  const state=results[0].value;assert.equal(state.identity.name,'Lunaya');assert.equal(state.profile.appearance.soulColor,'#64834b');assert.ok(state.profile.appearance.formInfluences.includes('Protetora'));assert.equal(state.personality.loyalty,85);assert.equal(state.profile.preferences.favoriteColor,undefined);assert.equal(state.profile.creation.ownerFavoriteColor,undefined);assert.ok(!state.memories.some(m=>m.title.startsWith('Cor favorita')));
  assert.equal((await runtime.listCompanions()).length,1);assert.equal(runtime.getCreationPolicy().canCreate,false);assert.equal(runtime.verify().valid,true);
  await runtime.chat('Olá Lunaya');const saved=await readFile(path.join(isolated,`${state.identity.id}.json`));
  const restarted=new CompanionRuntime(provider,isolated);await restarted.initialize();assert.deepEqual(restarted.getClientState(),runtime.getClientState());
  await assert.rejects(restarted.createCompanion({...input,name:'Outra'}),/já possui/);assert.deepEqual(await readFile(path.join(isolated,`${state.identity.id}.json`)),saved);
 }finally{if(previous===undefined)delete process.env.MAYUNA_ALLOW_EXTRA_COMPANIONS;else process.env.MAYUNA_ALLOW_EXTRA_COMPANIONS=previous;await rm(isolated,{recursive:true,force:true});}
});

test('failed first ritual persists no identity and invalid choices can be retried',async()=>{
 const isolated=await mkdtemp(path.join(tmpdir(),'companion-invalid-'));
 try{
  const runtime=new CompanionRuntime(provider,isolated);await runtime.initialize();
  const input={name:'Lunaya',ownerName:'Diego',preferredAddress:'Didi',soulColor:'#64834b',traits:['openness-0']};
  await assert.rejects(runtime.createCompanion({...input,traits:['energy-0','energy-1']}),/apenas uma/);
  await assert.rejects(runtime.createCompanion({...input,soulColor:'green'}),/cor válida/);
  assert.deepEqual(await runtime.listCompanions(),[]);assert.equal(runtime.getActiveId(),null);
  await runtime.createCompanion(input);assert.equal(runtime.verify().valid,true);
 }finally{await rm(isolated,{recursive:true,force:true});}
});
