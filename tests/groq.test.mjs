import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GroqProvider, GROQ_MODEL } from '../dist/ai/groq-provider.js';
import { createAIProvider } from '../dist/ai/provider-factory.js';
import { AIContextBuilder } from '../dist/ai/ai-context.js';
import { CompanionCore } from '../dist/core/core.js';
import { MAYUNA_PROFILE } from '../dist/companions/mayuna.js';
const state = CompanionCore.create(MAYUNA_PROFILE).getState();
const context = AIContextBuilder.build(state, 'Vamos imaginar uma aventura?', [{role:'USER',content:'Oi'},{role:'COMPANION',content:'Oi, Didi!'}]);
const answer = () => Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:' Vamos imaginar juntos! ',reasoning:'not-for-chat'}}]});

test('Groq sends expression context only to its fixed endpoint and returns final text', async () => {
  const original=globalThis.fetch;try{
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer TEST-KEY');
      const body=JSON.parse(options.body);assert.equal(body.model,GROQ_MODEL);assert.equal(body.include_reasoning,false);
      assert.equal(body.max_completion_tokens,2048);assert.deepEqual(body.messages.map(x=>x.role),['system','user','assistant','user']);
      assert.ok(body.messages[0].content.includes('Didi'));assert.ok(body.messages[0].content.includes('azul-safira'));
      assert.equal(body.tools,undefined);assert.ok(!/PRIVATE KEY|privateKey|cryptographicIdentity/.test(options.body));return answer();
    };
    assert.equal(await new GroqProvider('TEST-KEY').generateResponse(context),'Vamos imaginar juntos!');
    globalThis.fetch=async()=>{throw Error('identity must stay local');};
    assert.match(await new GroqProvider('TEST-KEY').generateResponse(AIContextBuilder.build(state,'Quem sou eu?')),/Didi/);
  }finally{globalThis.fetch=original;}
});
test('quota, invalid key, network and unfinished output fail without retries or secret disclosure',async()=>{
  const original=globalThis.fetch;try{
    for(const status of [401,403,429,500]){
      let calls=0;globalThis.fetch=async()=>{calls++;return new Response('SECRET-BODY TEST-KEY',{status});};
      await assert.rejects(new GroqProvider('TEST-KEY').generateResponse(context),e=>!e.message.includes('SECRET')&&!e.message.includes('TEST-KEY'));
      assert.equal(calls,1);
    }
    globalThis.fetch=async()=>{throw new TypeError('TEST-KEY');};
    await assert.rejects(new GroqProvider('TEST-KEY').generateResponse(context),/conectar ao Groq/);
    globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]});
    await assert.rejects(new GroqProvider('TEST-KEY').generateResponse(context),/não concluiu/);
  }finally{globalThis.fetch=original;}
});
test('Android requires explicit Free confirmation; settings switch without restart and legacy Ollama stays valid',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'groq-settings-'));const file=path.join(dir,'gateway.json');const original=globalThis.fetch;
  try{
    const provider=createAIProvider({MAYUNA_AI_PROVIDER:'android',COMPANION_APP_TOKEN:'test',COMPANION_ANDROID_SETTINGS:file});
    let calls=0;globalThis.fetch=async()=>{calls++;return answer();};
    await writeFile(file,JSON.stringify({provider:'groq',apiKey:'TEST-KEY'}));
    await assert.rejects(provider.generateResponse(context),/plano Free/);assert.equal(calls,0);
    await writeFile(file,JSON.stringify({provider:'groq',apiKey:'TEST-KEY',freePlanConfirmed:true}));
    assert.equal(await provider.generateResponse(context),'Vamos imaginar juntos!');assert.equal(provider.activeProvider,'groq');
    await writeFile(file,JSON.stringify({baseUrl:'https://ollama.example',model:'gemma3:4b'}));
    globalThis.fetch=async(url)=>{assert.equal(url,'https://ollama.example/api/chat');return Response.json({message:{content:'Ollama works'}});};
    assert.equal(await provider.generateResponse(context),'Ollama works');assert.equal(provider.activeProvider,'ollama');
  }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});
