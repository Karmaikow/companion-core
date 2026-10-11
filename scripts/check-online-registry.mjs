// Explicit live test: creates one disposable registry identity, never reads ./data.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { CompanionRuntime } from '../dist/server/companion-runtime.js';
import { sha256 } from '../dist/crypto/crypto.js';
import { authorityUrl } from '../dist/portability/registry-client.js';

if(!process.argv.includes('--live')||!process.env.COMPANION_REGISTRY_URL)
  throw Error('Defina COMPANION_REGISTRY_URL e use --live para criar uma identidade de teste descartável.');
const url=authorityUrl(process.env.COMPANION_REGISTRY_URL);
const root=await mkdtemp(path.join(tmpdir(),'companion-online-check-'));
const password=randomBytes(32).toString('hex');
const provider={name:'mock',async generateResponse(){return 'Olá, teste de registro.';}};
let registryKey;
try{
  const health=await fetch(url+'/health',{signal:AbortSignal.timeout(15000)});
  assert.equal(health.status,200);
  const source=new CompanionRuntime(provider,path.join(root,'source'),url);
  await source.initialize();
  await source.createCompanion({name:'Teste Registro',ownerName:'Teste',preferredAddress:'Teste',soulColor:'#3f8cff',traits:['openness-0']});
  const id=source.getClientState().identity.id;
  const stored=JSON.parse(await readFile(path.join(root,'source',id+'.json'),'utf8'));
  registryKey=id+':'+sha256(stored.state.identity.cryptographicIdentity.publicKey);
  console.log(JSON.stringify({stage:'test-identity',registryKey}));
  await source.chat('Minha cor favorita é verde-musgo.');
  const before=source.getClientState();
  const exported=await source.recollectCrystal(password,'Teste online — origem');
  const destinations=await Promise.all(['dest-a','dest-b'].map(async name=>{
    const runtime=new CompanionRuntime(provider,path.join(root,name),url);await runtime.initialize();return runtime;
  }));
  const outcomes=await Promise.allSettled(destinations.map((target,i)=>target.awakenCrystal(exported.file,password,`Teste online — destino ${i}`)));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
  const winner=outcomes.findIndex(r=>r.status==='fulfilled');
  const result=outcomes[winner].value;
  assert.equal(result.state.identity.id,id);
  assert.deepEqual(result.state.memories,before.memories);
  assert.equal(destinations[winner].verify().valid,true);
  await assert.rejects(source.cancelCrystal(),e=>e.status===409);
  const restart=new CompanionRuntime(provider,path.join(root,['dest-a','dest-b'][winner]),url);
  await restart.initialize();await restart.chat('Olá novamente');
  assert.equal(restart.getClientState().identity.id,id);
  assert.equal(restart.verify().valid,true);
  console.log(JSON.stringify({ok:true,registryKey,checks:['export','single-winner','memories','integrity','old-source-blocked','restart-and-chat']}));
}finally{
  await rm(root,{recursive:true,force:true});
  if(registryKey)console.log('Identidade descartável no registro (limpeza administrativa): '+registryKey);
}
