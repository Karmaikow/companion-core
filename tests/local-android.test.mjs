import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAIProvider } from '../dist/ai/provider-factory.js';
import { AIContextBuilder } from '../dist/ai/ai-context.js';
import { CompanionCore } from '../dist/core/core.js';
import { MAYUNA_PROFILE } from '../dist/companions/mayuna.js';
const state=CompanionCore.create(MAYUNA_PROFILE).getState();
test('fresh Android defaults to local, preserves grounded identity and never contacts cloud without model',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'local-ai-'));const fetch=globalThis.fetch;
 globalThis.fetch=async()=>{assert.fail('must not contact any endpoint');};
 try{
  const ai=createAIProvider({MAYUNA_AI_PROVIDER:'android',COMPANION_APP_TOKEN:'test',COMPANION_ANDROID_SETTINGS:path.join(dir,'gateway.json')});
  assert.match(await ai.generateResponse(AIContextBuilder.build(state,'Quem sou eu?')),/Didi/);
  await assert.rejects(ai.generateResponse(AIContextBuilder.build(state,'Vamos imaginar uma aventura?')),/Baixe a IA local/);
  assert.equal(ai.activeProvider,'local');
  await writeFile(path.join(dir,'gateway.json'),'{broken');
  await assert.rejects(ai.generateResponse(AIContextBuilder.build(state,'Vamos imaginar uma aventura?')),/Configuração de IA inválida/);
 }finally{globalThis.fetch=fetch;await rm(dir,{recursive:true,force:true});}
});
