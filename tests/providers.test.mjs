import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider, OnlineUnavailableError } from '../dist/ai/openai-provider.js';
import { createAIProvider, HybridAIProvider } from '../dist/ai/provider-factory.js';
import { AIContextBuilder } from '../dist/ai/ai-context.js';
import { CompanionCore } from '../dist/core/core.js';
import { MAYUNA_PROFILE } from '../dist/companions/mayuna.js';
const context = AIContextBuilder.build(CompanionCore.create(MAYUNA_PROFILE).getState(), 'Vamos nos preparar para explorar?', [{role:'USER',content:'Oie'},{role:'COMPANION',content:'Oi, Didi!'}]);

test('OpenAI sends grounded expression context only and parses Responses text', async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');
   assert.equal(options.headers.Authorization,'Bearer TEST-ONLY');
   const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.model,'test-model');
   assert.ok(body.instructions.includes('Didi'));assert.ok(body.instructions.includes('azul-safira'));
   assert.deepEqual(body.input.map(x=>x.role),['user','assistant','user']);
   assert.equal(body.tools,undefined);assert.equal(body.previous_response_id,undefined);
   assert.ok(!/PRIVATE KEY|privateKey|cryptographicIdentity/.test(options.body));
   return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Vamos, Didi!'}]}]});
  };
  assert.equal(await new OpenAIProvider('TEST-ONLY','test-model').generateResponse(context),'Vamos, Didi!');
 } finally {globalThis.fetch=original;}
});
test('identity questions stay grounded without an API request',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async()=>{throw Error('Should not call API');};
  const question=AIContextBuilder.build(CompanionCore.create(MAYUNA_PROFILE).getState(),'Você sabe meu nome?');
  assert.match(await new OpenAIProvider('TEST-ONLY','test-model').generateResponse(question),/Didi/);
 }finally{globalThis.fetch=original;}
});
test('API errors do not relay response bodies or secrets; unfinished output rejected',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async()=>new Response('private prompt TEST-ONLY',{status:401});
  await assert.rejects(new OpenAIProvider('TEST-ONLY','test-model').generateResponse(context), e=> /HTTP 401/.test(e.message)&&!e.message.includes('TEST-ONLY')&&!e.message.includes('private prompt'));
  globalThis.fetch=async()=>Response.json({status:'incomplete',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'partial'}]}]});
  await assert.rejects(new OpenAIProvider('TEST-ONLY','test-model').generateResponse(context),/não concluiu/);
 }finally{globalThis.fetch=original;}
});
test('hybrid falls back on connectivity failure, preserves context, and resumes online',async()=>{
 let down=true,localCalls=0;
 const online={name:'openai',async generateResponse(c){assert.equal(c,context);if(down)throw new OnlineUnavailableError('offline');return 'online';}};
 const offline={name:'ollama',async generateResponse(c){assert.equal(c,context);localCalls++;return 'local';}};
 const hybrid=new HybridAIProvider(online,offline);
 assert.equal(await hybrid.generateResponse(context),'local');assert.equal(hybrid.activeProvider,'ollama');
 down=false;assert.equal(await hybrid.generateResponse(context),'online');assert.equal(hybrid.activeProvider,'openai');assert.equal(localCalls,1);
 online.generateResponse=async()=>{throw Error('HTTP 429');};
 await assert.rejects(hybrid.generateResponse(context),/429/);assert.equal(localCalls,1);
});
test('factory preserves Ollama default and rejects missing configuration or unsafe mock',()=>{
 assert.equal(createAIProvider({}).name,'ollama');
 assert.throws(()=>createAIProvider({MAYUNA_AI_PROVIDER:'openai'}),/OPENAI_API_KEY/);
 assert.throws(()=>createAIProvider({MAYUNA_AI_PROVIDER:'openai',OPENAI_API_KEY:'TEST-ONLY'}),/MAYUNA_OPENAI_MODEL/);
 assert.throws(()=>createAIProvider({MAYUNA_AI_PROVIDER:'mock'}),/isolado/);
 assert.throws(()=>createAIProvider({MAYUNA_AI_PROVIDER:'typo'}),/inválido/);
 assert.equal(createAIProvider({MAYUNA_AI_PROVIDER:'hybrid',OPENAI_API_KEY:'TEST-ONLY',MAYUNA_OPENAI_MODEL:'test-model'}).name,'hybrid');
});
