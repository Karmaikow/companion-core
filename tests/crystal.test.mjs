import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir, platform as osPlatform} from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {CompanionCore} from '../dist/core/core.js';
import {MAYUNA_PROFILE} from '../dist/companions/mayuna.js';
import {CompanionRuntime} from '../dist/server/companion-runtime.js';
import {SessionRegistry,registryHttpServer} from '../dist/portability/registry.js';
import {RegistryClient} from '../dist/portability/registry-client.js';
import {sealCrystal,openCrystal,signCrystalData,crystalHash} from '../dist/portability/crystal.js';
import {signData,stableJson} from '../dist/crypto/crypto.js';
const password='Cristal-test-password-2026';
const token=()=>randomBytes(32).toString('hex');
const currentPlatform=osPlatform()==='win32'?'Windows':osPlatform()==='darwin'?'macOS':osPlatform()==='linux'?'Linux':'Outro';
const input={name:'Lunaya',ownerName:'Diego',preferredAddress:'Didi',soulColor:'#faf80d',traits:['openness-0']};
const provider={name:'mock',async generateResponse(){return 'Olá, Didi.';}};
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'crystal-'));const registry=new SessionRegistry(path.join(root,'registry.json'));await registry.initialize();const server=registryHttpServer(registry);server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;return{root,registry,server,url,async close(){await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}};}

 test('authenticated encryption preserves identity; wrong password, modified ciphertext and forged state are rejected',async()=>{
 const core=CompanionCore.create(MAYUNA_PROFILE);const payload={version:1,authority:'https://registry.example',transferId:randomUUID(),transferSecret:token(),exportedAt:new Date().toISOString(),data:core.getData(),privateKey:core.getPrivateKey(),stateSignature:signCrystalData(core.getData(),core.getPrivateKey())};
 const file=await sealCrystal(payload,password);assert.ok(!file.includes('PRIVATE KEY'));assert.ok(!file.includes(core.getState().identity.id));
 assert.deepEqual((await openCrystal(file,password)).data,payload.data);
 await assert.rejects(openCrystal(file,'Incorrect-password-123'),/senha incorreta/);
 const broken=JSON.parse(file);broken.ciphertext=(broken.ciphertext[0]==='A'?'B':'A')+broken.ciphertext.slice(1);await assert.rejects(openCrystal(JSON.stringify(broken),password));
 payload.data.state.core.xp=999;await assert.rejects(sealCrystal(payload,password),/histórico inválido/);
 await assert.rejects(openCrystal(file,'short'));
 });

 test('runtime recollection blocks chat across restart; one destination awakens, replay and old source are blocked',async()=>{
 const f=await fixture();try{
  const sourceRoot=path.join(f.root,'source'),targetRoot=path.join(f.root,'target');
  let source=new CompanionRuntime(provider,sourceRoot,f.url);await source.initialize();await source.createCompanion(input);await source.chat('Minha cor favorita é verde-musgo.');
  const before=source.getClientState();await assert.rejects(source.recollectCrystal('short','PC Trabalho'));assert.equal(source.getClientState().meta.crystalPhase,'active'); // enrolled by prior chat, still active
  const exported=await source.recollectCrystal(password,'PC Trabalho');assert.equal(exported.status.phase,'recollected');assert.equal(exported.status.server.status,'recollected');
  await assert.rejects(source.chat('Oi'),/recolhida/);assert.equal(source.getClientState().meta.eventCount,before.meta.eventCount);
  source=new CompanionRuntime(provider,sourceRoot,f.url);await source.initialize();await assert.rejects(source.chat('Oi'),/recolhida/);
  assert.equal((await source.recollectCrystal(password,'PC Trabalho')).file,exported.file);
  const target=new CompanionRuntime(provider,targetRoot,f.url);await target.initialize();
  await assert.rejects(target.awakenCrystal(exported.file,'Incorrect-password-123','Notebook Casa'));assert.equal(target.hasCompanion(),false);
  const result=await target.awakenCrystal(exported.file,password,'Notebook Casa');assert.equal(result.state.identity.id,before.identity.id);assert.deepEqual(result.state.memories,before.memories);assert.equal(target.verify().valid,true);
  assert.equal(result.status.server.device.name,'Notebook Casa');assert.equal(result.status.server.device.platform,currentPlatform);assert.ok(result.status.server.sessionId);assert.notEqual(result.recoveryCode,exported.recoveryCode);
  await target.chat('Oi');await assert.rejects(source.cancelCrystal());
  const other=new CompanionRuntime(provider,path.join(f.root,'other'),f.url);await other.initialize();await assert.rejects(other.awakenCrystal(exported.file,password,'Celular'),e=>e.status===409&&e.details.device.name==='Notebook Casa');assert.equal(other.hasCompanion(),false);
  const restarted=new CompanionRuntime(provider,path.join(f.root,'other'),f.url);await restarted.initialize();assert.equal(restarted.hasCompanion(),false);
  const registryContents=await readFile(path.join(f.root,'registry.json'),'utf8');assert.ok(!registryContents.includes('PRIVATE KEY'));assert.ok(!registryContents.includes('verde-musgo'));assert.ok(!registryContents.includes(result.recoveryCode));
  const current=await readFile(path.join(targetRoot,`${before.identity.id}.json`),'utf8');await assert.rejects(target.awakenCrystal(exported.file,password,'Notebook Casa'),/antigo/);assert.equal(await readFile(path.join(targetRoot,`${before.identity.id}.json`),'utf8'),current);
 }finally{await f.close();}
 });

 test('cancellation reactivates source and makes its old Crystal unusable; different owned identity stays intact',async()=>{
 const f=await fixture();try{
 const source=new CompanionRuntime(provider,path.join(f.root,'source'),f.url);await source.initialize();await source.createCompanion(input);const exported=await source.recollectCrystal(password,'Trabalho');await source.cancelCrystal();await source.chat('Oi');
 const empty=new CompanionRuntime(provider,path.join(f.root,'empty'),f.url);await empty.initialize();await assert.rejects(empty.awakenCrystal(exported.file,password,'Casa'));assert.equal(empty.hasCompanion(),false);
 const other=new CompanionRuntime(provider,path.join(f.root,'other'),f.url);await other.initialize();await other.createCompanion({...input,name:'Mayuna'});const original=other.getClientState();await assert.rejects(other.awakenCrystal(exported.file,password,'Casa'),/outra Companion/);assert.equal(other.getClientState().identity.id,original.identity.id);
 }finally{await f.close();}
 });

 test('server serializes concurrent claims, persists authorization and rejects replayed signed requests after restart',async()=>{
 const f=await fixture();try{
 const core=CompanionCore.create(MAYUNA_PROFILE),id=core.getState().identity.id,pub=core.getState().identity.cryptographicIdentity.publicKey,key=core.getPrivateKey();const client=new RegistryClient(f.url),session=token(),recovery=token(),device={id:token(),name:'Origem',platform:'Linux'};
 const req=(action,payload)=>client.request(action,id,pub,key,payload);
 const unsigned={action:'register',id,publicKey:pub,payload:{session,recovery,device},timestamp:Date.now(),nonce:randomUUID()};const signed={...unsigned,signature:signData(stableJson(unsigned),key)};await f.registry.execute(signed);
 const restart=new SessionRegistry(path.join(f.root,'registry.json'));await restart.initialize();await assert.rejects(restart.execute(signed),/já utilizada/);
 const transferId=randomUUID(),secret=token(),bundleHash=token();await req('recollect',{session,transferId,secret,bundleHash});
 const claims=await Promise.allSettled(['Casa','Celular'].map(name=>req('awaken',{session:token(),recovery:token(),device:{id:token(),name,platform:'Android'},transferId,secret,bundleHash})));
 assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);assert.equal(claims.filter(x=>x.status==='rejected').length,1);
 }finally{await f.close();}
 });

 test('recovery requires its separate code, revokes old session and recovers only the Crystal history',async()=>{
 const f=await fixture();try{
 const source=new CompanionRuntime(provider,path.join(f.root,'source'),f.url);await source.initialize();await source.createCompanion(input);const exported=await source.recollectCrystal(password,'Trabalho');
 const target=new CompanionRuntime(provider,path.join(f.root,'target'),f.url);await target.initialize();const active=await target.awakenCrystal(exported.file,password,'Casa');await target.chat('Oi');
 const replacement=new CompanionRuntime(provider,path.join(f.root,'replacement'),f.url);await replacement.initialize();await assert.rejects(replacement.awakenCrystal(exported.file,password,'Celular',token()),/recuperação incorreto/);
 const restored=await replacement.awakenCrystal(exported.file,password,'Celular',active.recoveryCode);assert.equal(restored.state.meta.eventCount,1);await assert.rejects(target.chat('Oi'),e=>e.status===409&&e.details.device.name==='Celular');
 }finally{await f.close();}
 });

 test('lost recollect and awaken responses retry the same durable transaction after restart',async()=>{
 const {CrystalManager}=await import('../dist/portability/crystal-manager.js');const f=await fixture();try{
 const core=CompanionCore.create(MAYUNA_PROFILE);const sourceRoot=path.join(f.root,'source'),targetRoot=path.join(f.root,'target');
 let source=new CrystalManager(sourceRoot,f.url);await source.initialize();const sourceRequest=source.client.request.bind(source.client);let dropped=false;
 source.client.request=async(...args)=>{const result=await sourceRequest(...args);if(args[0]==='recollect'&&!dropped){dropped=true;throw Object.assign(Error('Lost response'),{status:503});}return result;};
 await assert.rejects(source.recollect(core,password,'Origem'));assert.equal(source.getPhase(),'exporting');await assert.rejects(source.assertActive(core));
 const pending=JSON.parse(await readFile(path.join(sourceRoot,'.crystal/session.json'),'utf8'));assert.ok(!JSON.stringify(pending).includes('PRIVATE KEY'));
 source=new CrystalManager(sourceRoot,f.url);await source.initialize();const exported=await source.recollect(core,password,'Origem');assert.equal(exported.file,pending.bundle);
 let target=new CrystalManager(targetRoot,f.url);await target.initialize();const targetRequest=target.client.request.bind(target.client);dropped=false;
 target.client.request=async(...args)=>{const result=await targetRequest(...args);if(args[0]==='awaken'&&!dropped){dropped=true;throw Object.assign(Error('Lost response'),{status:503});}return result;};
 await assert.rejects(target.awaken(exported.file,password,'Destino'));assert.equal(target.getPhase(),'importing');assert.equal((await target.status()).server.device.name,'Destino');
 target=new CrystalManager(targetRoot,f.url);await target.initialize();const imported=await target.resumeImport();assert.equal(imported.core.getState().identity.id,core.getState().identity.id);assert.equal(imported.core.verifyLocal().valid,true);assert.equal(target.getPhase(),'active');
 assert.ok(!(await readFile(path.join(targetRoot,'.crystal/session.json'),'utf8')).includes('PRIVATE KEY'));await target.assertActive(imported.core);await assert.rejects(source.cancel(core));
 }finally{await f.close();}
 });

 test('missing central authority disables transfers, and enrolled sessions fail closed during outages',async()=>{
 const {CrystalManager}=await import('../dist/portability/crystal-manager.js');const root=await mkdtemp(path.join(tmpdir(),'crystal-disabled-'));try{
 const core=CompanionCore.create(MAYUNA_PROFILE);const manager=new CrystalManager(root,'');await manager.initialize();await assert.rejects(manager.recollect(core,password,'Origem'),/REGISTRY_URL/);await manager.assertActive(core);assert.equal(manager.getPhase(),'local');
 }finally{await rm(root,{recursive:true,force:true});}
 const f=await fixture();try{
 const runtime=new CompanionRuntime(provider,path.join(f.root,'source'),f.url);await runtime.initialize();await runtime.createCompanion(input);await runtime.chat('Oi');const before=runtime.getClientState();await new Promise(resolve=>f.server.close(resolve));
 await assert.rejects(runtime.chat('Oi'),/indisponível/);assert.equal(runtime.getClientState().meta.eventCount,before.meta.eventCount);
 }finally{await f.close();}
 });

 test('another public key cannot reserve an existing identity ID or read its active session',async()=>{
 const f=await fixture();try{
 const first=CompanionCore.create(MAYUNA_PROFILE),other=CompanionCore.create(MAYUNA_PROFILE),id=first.getState().identity.id;const client=new RegistryClient(f.url);
 const owner=(action,payload)=>client.request(action,id,first.getState().identity.cryptographicIdentity.publicKey,first.getPrivateKey(),payload);
 const outsider=(action,payload)=>client.request(action,id,other.getState().identity.cryptographicIdentity.publicKey,other.getPrivateKey(),payload);
 await outsider('register',{session:token(),recovery:token(),device:{id:token(),name:'Outra identidade',platform:'Windows'}});
 await owner('register',{session:token(),recovery:token(),device:{id:token(),name:'Trabalho do Didi',platform:'Linux'}});
 assert.equal((await owner('status',{})).device.name,'Trabalho do Didi');assert.equal((await outsider('status',{})).device.name,'Outra identidade');
 }finally{await f.close();}
 });

 test('Hub can reactivate the same Companion already active in the local Crystal session',async()=>{
 const f=await fixture();const root=path.join(f.root,'hub');try{
  const {LocalStore,writeFileAtomic}=await import('../dist/storage/store.js');const store=new LocalStore(root);
  const mayuna=CompanionCore.create(MAYUNA_PROFILE);const otherProfile=structuredClone(MAYUNA_PROFILE);otherProfile.name='Lunaya';otherProfile.companionOf={name:'Diego',preferredAddress:'Didi'};const lunaya=CompanionCore.create(otherProfile);
  for(const core of [mayuna,lunaya]){await store.save(core.getData());await store.savePrivateKey(core.getState().identity.id,core.getPrivateKey());}
  await writeFileAtomic(path.join(root,'active-companion.json'),JSON.stringify({id:lunaya.getState().identity.id}));
  await writeFileAtomic(path.join(root,'.crystal','session.json'),JSON.stringify({authority:f.url,id:mayuna.getState().identity.id,device:{id:token(),name:'PC Windows',platform:'Windows'},session:token(),recovery:token(),phase:'active'}));
  const runtime=new CompanionRuntime(provider,root,f.url);await runtime.initialize();assert.equal(runtime.getActiveId(),lunaya.getState().identity.id);
  const selected=await runtime.activateCompanion(mayuna.getState().identity.id);assert.equal(selected.identity.id,mayuna.getState().identity.id);assert.equal(selected.meta.crystalPhase,'active');
  const status=await runtime.crystalStatus();assert.equal(status.server.status,'active');assert.equal(status.server.device.name,'PC Windows');
 }finally{await f.close();}
 });

 test('owner HTTP export/import transfers a large encrypted file; APIs never expose plaintext keys',async()=>{
 const {spawn}=await import('node:child_process');const {LocalStore,writeFileAtomic}=await import('../dist/storage/store.js');const f=await fixture();const children=[];
 const launch=async(root,port)=>{const child=spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),MAYUNA_AI_PROVIDER:'mock',MAYUNA_DATA_DIR:root,COMPANION_REGISTRY_URL:f.url},stdio:['ignore','pipe','pipe']});children.push(child);let stderr='';child.stderr.on('data',x=>stderr+=x);await Promise.race([new Promise((resolve,reject)=>{child.stdout.on('data',x=>{if(x.toString().includes('Interface:'))resolve();});child.on('exit',()=>reject(Error(`Startup failed: ${stderr}`)));}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);timer.unref();})]);return`http://127.0.0.1:${port}`;};
 try{
 const core=CompanionCore.create(MAYUNA_PROFILE),sourceRoot=path.join(f.root,'source');core.addMemory('SIGNIFICANT','Uma memória extensa','Uma lembrança para testar a transferência. '.repeat(4000),80);const store=new LocalStore(sourceRoot);await store.save(core.getData());await store.savePrivateKey(core.getState().identity.id,core.getPrivateKey());await writeFileAtomic(path.join(sourceRoot,'active-companion.json'),JSON.stringify({id:core.getState().identity.id}));
 const source=await launch(sourceRoot,4298),target=await launch(path.join(f.root,'target'),4299);
 const setup=async base=>{const response=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'crystal-owner',password:'OnlyTests-12345!'})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];};
 const sourceCookie=await setup(source),targetCookie=await setup(target);
 const post=(base,cookie,action,body)=>fetch(base+'/api/crystal/'+action,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 assert.equal((await post(target,'','awaken',{file:'not-a-crystal',password})).status,401);
 const exportResponse=await post(source,sourceCookie,'recollect',{password,deviceName:'PC Trabalho'});assert.equal(exportResponse.status,200);const exported=await exportResponse.json();assert.ok(exported.file.length>64_000);assert.ok(!JSON.stringify(exported).includes('PRIVATE KEY'));
 const importResponse=await post(target,targetCookie,'awaken',{password,file:exported.file,deviceName:'Notebook Casa'});assert.equal(importResponse.status,200);const imported=await importResponse.json();assert.equal(imported.state.identity.id,core.getState().identity.id);assert.ok(!JSON.stringify(imported).includes('PRIVATE KEY'));assert.equal(imported.status.server.device.name,'Notebook Casa');
 const status=await(await fetch(source+'/api/crystal/status',{headers:{Cookie:sourceCookie}})).json();assert.equal(status.phase,'recollected');assert.equal(status.server.device.name,'Notebook Casa');assert.ok(!JSON.stringify(status).includes(exported.recoveryCode));
 }finally{for(const child of children){if(child.exitCode===null){child.kill();await once(child,'exit');}}await f.close();}
 });
