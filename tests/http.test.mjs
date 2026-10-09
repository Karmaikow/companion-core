import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('HTTP boundaries: local owner, remote pairing, DTO, interaction and revocation', { timeout: 20_000 }, async()=>{
 const data=await mkdtemp(path.join(tmpdir(),'mayuna-http-'));
 const origin='https://mayuna.example';
 const server=spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:'4294',MAYUNA_REMOTE_ORIGIN:origin,MAYUNA_DATA_DIR:data,MAYUNA_AI_PROVIDER:'mock'},stdio:['ignore','pipe','pipe']});
 let stderr=''; server.stderr.on('data',chunk=>{stderr+=chunk;});
 try {
  await Promise.race([new Promise((resolve,reject)=>{server.stdout.on('data',x=>{if(x.toString().includes('Interface:'))resolve();});server.on('error',reject);server.on('exit',code=>reject(Error(`Server exited ${code}: ${stderr}`)));}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error(`Startup timeout: ${stderr}`)),20000);timer.unref();})]);
  const base='http://127.0.0.1:4294';
  assert.equal((await fetch(base+'/api/companion/state')).status,401);
  assert.equal((await fetch(base+'/api/companions')).status,401);
  const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'test-user',password:'OnlyTests-12345!'})});assert.equal(setup.status,200);
  const cookie=setup.headers.get('set-cookie').split(';')[0];
  const request=(url,options={})=>fetch(url,{...options,headers:{...options.headers,Cookie:cookie}});
  const state=await (await request(base+'/api/companion/state')).json();assert.equal(state.meta.provider,'mock');assert.ok(!JSON.stringify(state).includes('PRIVATE KEY'));
  for(const url of ['/data/active-companion.json','/src/core/core.ts','/%2e%2e%2fdata/active-companion.json','/missing.js'])assert.notEqual((await request(base+url)).status,200);
  assert.equal((await request(base+'/api/companion/state',{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await request(base+'/api/companion/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:''})})).status,400);
  const response=await request(base+'/api/companion/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Olá Mayuna'})});assert.equal(response.status,200);const chat=await response.json();assert.equal(chat.state.identity.id,state.identity.id);assert.equal(chat.state.meta.eventCount,state.meta.eventCount+1);
  assert.equal((await (await request(base+'/api/companion/verify')).json()).valid,true);
  const hubBefore=await (await request(base+'/api/companions')).json();assert.equal(hubBefore.companions.length,1);assert.equal(hubBefore.creationPolicy.additionalCreationForTesting,true);assert.equal(hubBefore.creationPolicy.groups.length,10);
  const createdResponse=await request(base+'/api/companions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Aurora',ownerName:'Diego',preferredAddress:'Didi',soulColor:'#64834b',traits:['openness-0','agreeableness-0']})});assert.equal(createdResponse.status,201);const created=await createdResponse.json();assert.equal(created.identity.name,'Aurora');assert.equal(created.profile.appearance.soulColor,'#64834b');assert.notEqual(created.identity.id,state.identity.id);
  assert.equal((await request(base+'/api/companions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Aurora',ownerName:'Diego',preferredAddress:'Didi',soulColor:'#64834b',traits:['openness-0','agreeableness-0']})})).status,409);
  const hubAfter=await (await request(base+'/api/companions')).json();assert.equal(hubAfter.companions.length,2);
  const activate=await request(base+`/api/companions/${state.identity.id}/activate`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(activate.status,200);assert.equal((await activate.json()).identity.id,state.identity.id);

  const page=await request(base+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
  // A real browser includes its local Origin on the owner POST. This must work.
  const ownerHeaders={Origin:base,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/remote/pairing/code',{method:'POST',headers:ownerHeaders,body:'{}'})).status,401);
  assert.equal((await request(base+'/api/remote/pairing/code',{method:'POST',headers:{...ownerHeaders,Origin:origin},body:'{}'})).status,403);
  const codeResponse=await request(base+'/api/remote/pairing/code',{method:'POST',headers:ownerHeaders,body:'{}'});
  assert.equal(codeResponse.status,200); const pair=await codeResponse.json();
  const preflight=await fetch(base+'/api/remote/connect',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  assert.equal((await fetch(base+'/api/remote/state',{headers:{Origin:origin}})).status,401);
  const connect=()=>fetch(base+'/api/remote/connect',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:pair.code})});
  const connected=await connect();assert.equal(connected.status,200);const session=await connected.json();
  assert.equal((await connect()).status,401);
  const remote=(route,options={})=>fetch(base+'/api/remote/'+route,{...options,headers:{Origin:origin,Authorization:`Bearer ${session.token}`,...options.headers}});
  const remoteState=await (await remote('state')).json();assert.equal(remoteState.identity.id,state.identity.id);
  assert.ok(!/privateKey|PRIVATE KEY|cryptographicIdentity/.test(JSON.stringify(remoteState)));
  assert.equal((await remote('state',{headers:{Origin:'https://attacker.example'}})).status,403);
  const remoteChat=await remote('chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Olá, Mayuna'})});
  assert.equal(remoteChat.status,200);assert.equal((await remoteChat.json()).state.meta.eventCount,chat.state.meta.eventCount+1);
  assert.equal((await (await remote('verify')).json()).valid,true);
  assert.equal((await remote('logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);
  assert.equal((await remote('state')).status,401);
 }finally {
  if(server.exitCode===null&&server.signalCode===null){const exited=once(server,'exit');server.kill();await exited;}
  await rm(data,{recursive:true,force:true});
 }
});
