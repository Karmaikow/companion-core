import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAIProvider} from '../dist/ai/provider-factory.js';

test('embedded Core requires app capability before any auth or data route',async()=>{
 const data=await mkdtemp(path.join(tmpdir(),'embedded-core-'));
 const server=spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:'4298',MAYUNA_DATA_DIR:data,MAYUNA_AI_PROVIDER:'mock',COMPANION_APP_TOKEN:'test-private-app-capability',COMPANION_REGISTRY_URL:''},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{server.stdout.on('data',x=>{if(x.toString().includes('Interface:'))resolve();});server.on('error',reject);server.on('exit',()=>reject(Error('startup failed')));});
  const base='http://127.0.0.1:4298';
  assert.equal((await fetch(base+'/api/health')).status,403);
  assert.equal((await fetch(base+'/api/auth/status')).status,403);
  assert.equal((await fetch(base+'/api/auth/status',{headers:{Cookie:'companion_app=wrong'}})).status,403);
  assert.equal((await fetch(base+'/api/auth/status',{headers:{Cookie:'companion_app=test-private-app-capability'}})).status,200);
  assert.equal((await fetch(base+'/api/health',{headers:{'X-Companion-App':'test-private-app-capability'}})).status,200);
 }finally{server.kill();await once(server,'exit');await rm(data,{recursive:true,force:true});}
});

test('Android provider does not silently enable mock or paid API',()=>{
 assert.throws(()=>createAIProvider({MAYUNA_AI_PROVIDER:'android'}));
 const provider=createAIProvider({MAYUNA_AI_PROVIDER:'android',COMPANION_APP_TOKEN:'test',COMPANION_ANDROID_SETTINGS:'/not-present'});
 assert.equal(provider.name,'ollama');
});
