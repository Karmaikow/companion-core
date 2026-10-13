import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DesktopAISettings} from '../dist/ai/desktop-settings.js';
test('desktop AI persists privately, masks credentials and preserves same-provider key',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'desktop-ai-'));
 try{
 const settings=new DesktopAISettings({MAYUNA_DATA_DIR:root});await settings.initialize();
 await assert.rejects(settings.save({provider:'groq',secret:'test-key'}),/Free/);
 await settings.save({provider:'groq',secret:'test-key',freePlanConfirmed:true});
 assert.equal(JSON.stringify(settings.status()).includes('test-key'),false);
 assert.equal((await stat(settings.file)).mode&0o777,0o600);
 await settings.save({provider:'groq',secret:'',freePlanConfirmed:true});
 const reloaded=new DesktopAISettings({MAYUNA_DATA_DIR:root});await reloaded.initialize();assert.equal(reloaded.name,'groq');
 await assert.rejects(reloaded.save({provider:'openai',model:'test',secret:''}),/chave/);
 assert.equal(reloaded.name,'groq');
 await reloaded.save({provider:'ollama',baseUrl:'http://127.0.0.1:11434',model:'test'});
 const saved=JSON.parse(await readFile(settings.file,'utf8'));assert.equal(saved.secret,'');
 await assert.rejects(reloaded.save({provider:'ollama',baseUrl:'http://example.com'}),/HTTPS/);
 assert.equal(JSON.parse(await readFile(settings.file,'utf8')).baseUrl,'http://127.0.0.1:11434');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('desktop settings HTTP requires owner login, rejects cross-origin writes and never returns key', {timeout:15000},async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 const root=await mkdtemp(path.join(tmpdir(),'desktop-http-'));
 const child=spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,MAYUNA_DATA_DIR:root,MAYUNA_AI_PROVIDER:'ollama',HOST:'127.0.0.1',PORT:'4348',COMPANION_REGISTRY_URL:'',COMPANION_APP_TOKEN:''},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),8000);child.stdout.on('data',x=>{if(x.toString().includes('Interface:')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error('server exited'));});});
 const base='http://127.0.0.1:4348';
 assert.equal((await fetch(base+'/api/conversation/settings')).status,401);
 const login=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'tester',password:'long-test-password'})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const body=JSON.stringify({provider:'groq',secret:'test-secret-private',freePlanConfirmed:true});
 assert.equal((await fetch(base+'/api/conversation/settings',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://evil.example'},body})).status,403);
 const save=await fetch(base+'/api/conversation/settings',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body});assert.equal(save.status,200);assert.equal((await save.text()).includes('test-secret-private'),false);
 const get=await fetch(base+'/api/conversation/settings',{headers:{Cookie:cookie}});assert.equal(get.headers.get('cache-control'),'no-store');const status=await get.json();assert.equal(status.provider,'groq');assert.equal(status.hasSecret,true);
 }finally{if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}await rm(root,{recursive:true,force:true});}
});
