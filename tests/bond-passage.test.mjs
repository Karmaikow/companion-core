import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {SessionRegistry} from '../dist/portability/registry.js';
import {RegistryClient} from '../dist/portability/registry-client.js';
import {CompanionRuntime} from '../dist/server/companion-runtime.js';
import {validateInvitation} from '../dist/portability/bond-passage.js';
import {openCrystal,crystalHash} from '../dist/portability/crystal.js';
import {mergeRegistries} from '../dist/portability/registry-migration.js';
import {writeFileAtomic} from '../dist/storage/store.js';
import {AIContextBuilder} from '../dist/ai/ai-context.js';
import {signData,stableJson} from '../dist/crypto/crypto.js';
const password='Passagem-test-password-2026';
const token=()=>randomBytes(32).toString('hex');
const input={name:'Lunaya',ownerName:'Diego',preferredAddress:'Didi',soulColor:'#faf80d',traits:['openness-0']};
const provider={name:'mock',async generateResponse(){return 'Olá, que bom conversar.';}};
// Exercise real signed registry transactions and disk persistence without opening sockets.
async function setup(){
 const root=await mkdtemp(path.join(tmpdir(),'bond-')),registries=new Map();
 const original=RegistryClient.prototype.request;
 RegistryClient.prototype.request=async function(action,id,publicKey,privateKey,payload){
  const registry=registries.get(this.url);if(!registry)throw Error('Registry unavailable');
  const unsigned={action,id,publicKey,payload,timestamp:Date.now(),nonce:randomUUID()};
  return registry.execute({...unsigned,signature:signData(stableJson(unsigned),privateKey)});
 };
 async function addRegistry(name){const file=path.join(root,name+'.json'),registry=new SessionRegistry(file);await registry.initialize();const url=`https://${name}.example`;registries.set(url,registry);return {file,url};}
 const central=await addRegistry('central');
 return {root,central,registries,addRegistry,async runtime(name,url=central.url){const r=new CompanionRuntime(provider,path.join(root,name),url);await r.initialize();return r;},async close(){RegistryClient.prototype.request=original;await rm(root,{recursive:true,force:true});}};
}

test('gift requires both consents and recipient key; preserves history, resets bond, revokes source and recovery',async()=>{
 const f=await setup();try{
  const source=await f.runtime('source'),target=await f.runtime('target'),outsider=await f.runtime('outsider');await source.createCompanion(input);await source.chat('Minha cor favorita é verde-musgo.');const before=source.getClientState();
  const invitation=await target.bondInvitation('Ana','Aninha');
  await assert.rejects(source.giftCrystal(password,'Origem',JSON.stringify(invitation),false),/compartilhamento/);
  await assert.rejects(source.giftCrystal(password,'Origem',JSON.stringify({...invitation,name:'Outra pessoa'}),true),/Convite/);
  const exported=await source.giftCrystal(password,'Origem',JSON.stringify(invitation),true);
  await assert.rejects(source.chat('Oi'),/recolhida/);await assert.rejects(target.awakenCrystal(exported.file,password,'Destino'),/aceite/);
  const preview=await target.previewCrystal(exported.file,password);assert.equal(preview.gift.forThisAccount,true);assert.equal(preview.gift.recipient,'Ana');assert.equal(preview.previousPerson,'Didi');
  await assert.rejects(outsider.awakenCrystal(exported.file,password,'Outro',undefined,true),/outro acesso/);
  const payload=await openCrystal(exported.file,password),client=new RegistryClient(f.central.url);
  await assert.rejects(client.request('awaken',payload.data.state.identity.id,payload.data.state.identity.cryptographicIdentity.publicKey,payload.privateKey,{session:token(),recovery:token(),device:{id:token(),name:'Intruso',platform:'Linux'},transferId:payload.transferId,secret:payload.transferSecret,bundleHash:crystalHash(exported.file)}),/destinatário/);
  const result=await target.awakenCrystal(exported.file,password,'Destino',undefined,true);
  assert.equal(result.state.identity.id,before.identity.id);assert.equal(result.state.profile.companionOf.name,'Ana');assert.equal(result.state.profile.appearance.soulColor,before.profile.appearance.soulColor);assert.equal(result.state.bond.value,0);assert.equal(result.state.core.level,before.core.level);assert.notEqual(result.recoveryCode,exported.recoveryCode);
  assert.equal(target.verify().valid,true);const disk=JSON.parse(await readFile(path.join(f.root,'target',`${before.identity.id}.json`),'utf8'));
  assert.deepEqual(disk.events.slice(0,payload.data.events.length),payload.data.events);assert.equal(disk.events.filter(event=>event.type==='BOND_PASSAGE').length,1);assert.ok(disk.state.memories.some(m=>m.content.includes('verde-musgo')));
  const context=AIContextBuilder.build(disk.state,'Qual minha cor favorita?');assert.equal(context.knownPerson.name,'Ana');assert.ok(!context.preferenceMemories.some(m=>m.content.includes('verde-musgo')));assert.match(context.systemPrompt,/vínculos anteriores: Didi/);
  await assert.rejects(source.cancelCrystal());await assert.rejects(client.request('recover',payload.data.state.identity.id,payload.data.state.identity.cryptographicIdentity.publicKey,payload.privateKey,{session:token(),recovery:exported.recoveryCode,nextRecovery:token(),device:{id:token(),name:'Origem',platform:'Linux'}}),/recuperação incorreto/);
  const restart=await f.runtime('target');assert.equal(restart.getClientState().profile.companionOf.name,'Ana');await restart.chat('Oi');
  const personal=await restart.recollectCrystal(password,'Destino');assert.equal((await openCrystal(personal.file,password)).gift,undefined);
 }finally{await f.close();}
});

test('cancelled gifts cannot awaken; expired or altered invitations cannot pause the source',async()=>{
 const f=await setup();try{
  const source=await f.runtime('source'),target=await f.runtime('target');await source.createCompanion(input);const invitation=await target.bondInvitation('Ana','Ana');
  const expired={...invitation,expiresAt:new Date(Date.now()-1).toISOString()};assert.throws(()=>validateInvitation(expired));await assert.rejects(source.giftCrystal(password,'Origem',JSON.stringify(expired),true));
  const exported=await source.giftCrystal(password,'Origem',JSON.stringify(invitation),true);await source.cancelCrystal();await source.chat('Oi');
  await assert.rejects(target.awakenCrystal(exported.file,password,'Destino',undefined,true));assert.equal(target.hasCompanion(),false);assert.equal(source.getClientState().profile.companionOf.name,'Diego');
 }finally{await f.close();}
});

test('gift acceptance survives a lost central response without duplicate passage events',async()=>{
 const f=await setup();try{
  const source=await f.runtime('source'),target=await f.runtime('target');await source.createCompanion(input);const invitation=await target.bondInvitation('Ana','Ana');const exported=await source.giftCrystal(password,'Origem',JSON.stringify(invitation),true);
  const original=RegistryClient.prototype.request;let dropped=false;
  RegistryClient.prototype.request=async function(action,...args){const result=await original.call(this,action,...args);if(action==='awaken'&&!dropped){dropped=true;throw Error('Lost response');}return result;};
  try{await assert.rejects(target.awakenCrystal(exported.file,password,'Destino',undefined,true),/Lost response/);}finally{RegistryClient.prototype.request=original;}
  const restart=await f.runtime('target');assert.equal(restart.getClientState().profile.companionOf.name,'Ana');assert.equal(restart.verify().valid,true);
  const disk=JSON.parse(await readFile(path.join(f.root,'target',`${restart.getActiveId()}.json`),'utf8'));assert.equal(disk.events.filter(e=>e.type==='BOND_PASSAGE').length,1);
 }finally{await f.close();}
});

test('merge retains authorizations; old Crystal works only after explicit administrative migration',async()=>{
 const f=await setup();try{
  const linux=await f.addRegistry('linux'),windows=await f.addRegistry('windows');
  const source=await f.runtime('work',linux.url);await source.createCompanion(input);const exported=await source.recollectCrystal(password,'Trabalho');
  let home=await f.runtime('home',windows.url);await home.createCompanion({...input,name:'Mayuna'});await home.chat('Oi');const mayuna=home.getActiveId();
  const empty=await f.runtime('empty',windows.url);await assert.rejects(empty.awakenCrystal(exported.file,password,'Casa'),/migração/);
  const linuxEntries=JSON.parse(await readFile(linux.file,'utf8')),windowsEntries=JSON.parse(await readFile(windows.file,'utf8'));
  const merged=mergeRegistries([{authority:linux.url,entries:linuxEntries},{authority:windows.url,entries:windowsEntries}]);assert.equal(Object.keys(merged).length,2);
  const bad=structuredClone(linuxEntries);Object.values(bad)[0].recoveryHash=token();assert.throws(()=>mergeRegistries([{authority:linux.url,entries:linuxEntries},{authority:windows.url,entries:bad}]),/divergentes/);
  f.registries.delete(linux.url);f.registries.delete(windows.url);
  await writeFileAtomic(f.central.file,JSON.stringify(merged));await f.addRegistry('central');
  home=await f.runtime('home');assert.equal((await home.crystalStatus()).migrationAvailable,true);await home.migrateRegistry();await home.chat('Oi');
  const imported=await home.awakenCrystal(exported.file,password,'Casa');assert.equal(imported.state.identity.name,'Lunaya');assert.equal((await home.listCompanions()).length,2);await home.activateCompanion(mayuna);await home.chat('Oi');
 }finally{await f.close();}
});

test('old registry capabilities cannot silently turn a gift into an unrestricted transfer',async()=>{
 const f=await setup();try{
  const source=await f.runtime('source'),target=await f.runtime('target');await source.createCompanion(input);const invitation=await target.bondInvitation('Ana','Ana');
  const request=RegistryClient.prototype.request;
  RegistryClient.prototype.request=async function(action,...args){if(action==='capabilities')return {version:1};return request.call(this,action,...args);};
  try{await assert.rejects(source.giftCrystal(password,'Origem',JSON.stringify(invitation),true),/Atualize/);assert.equal(source.getClientState().meta.crystalPhase,'local');}finally{RegistryClient.prototype.request=request;}
  await source.chat('Oi');
 }finally{await f.close();}
});

test('new human with the same name can record preferences without reusing archived facts',async()=>{
 const f=await setup();try{
  const source=await f.runtime('source'),target=await f.runtime('target');await source.createCompanion(input);await source.chat('Minha cor favorita é verde-musgo.');const invitation=await target.bondInvitation('Diego','Didi');const exported=await source.giftCrystal(password,'Origem',JSON.stringify(invitation),true);
  await target.awakenCrystal(exported.file,password,'Destino',undefined,true);await target.chat('Minha cor favorita é verde-musgo.');
  const state=target.getClientState();const context=AIContextBuilder.build(state,'Qual minha cor favorita?');assert.ok(context.preferenceMemories.some(m=>m.content.includes('verde-musgo')));
 }finally{await f.close();}
});

test('migration CLI defaults to dry run and never overwrites an output or edits the source',async()=>{
 const {spawnSync}=await import('node:child_process');const f=await setup();try{
  const source=await f.runtime('source');await source.createCompanion(input);await source.chat('Oi');const before=await readFile(f.central.file,'utf8');
  const config=path.join(f.root,'migration.json'),output=path.join(f.root,'merged.json');await writeFileAtomic(config,JSON.stringify({targetAuthority:'https://shared.example',output:'merged.json',sources:[{authority:f.central.url,file:'central.json'}]}));
  const run=(...args)=>spawnSync(process.execPath,['scripts/migrate-registry.mjs',config,...args],{encoding:'utf8'});
  assert.equal(run().status,0);await assert.rejects(readFile(output),e=>e.code==='ENOENT');assert.equal(run('--write').status,1);assert.equal(run('--write','--registries-stopped').status,0);
  const saved=await readFile(output,'utf8');assert.equal(run('--write','--registries-stopped').status,1);assert.equal(await readFile(output,'utf8'),saved);assert.equal(await readFile(f.central.file,'utf8'),before);
 }finally{await f.close();}
});
