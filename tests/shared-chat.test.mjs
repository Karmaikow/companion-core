import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSharedChatHandler} from '../dist/server/shared-chat.js';
import {generateIdentity,signData,stableJson} from '../dist/crypto/crypto.js';
const keys=generateIdentity();
function signed(overrides={}){
 const value={action:'companion-chat:v1',id:'MC-TEST',publicKey:keys.publicKey,timestamp:Date.now(),nonce:randomUUID(),payload:{sessionHash:'a'.repeat(64),context:{identity:{companionId:'MC-TEST'},systemPrompt:'Test',userMessage:'Hello',recentMessages:[]}},...overrides};
 return {...value,signature:signData(stableJson(value),keys.privateKey)};
}
const request=input=>new Request('https://example.com/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
test('shared chat validates signature, domain, time, size and context before quota or provider',async()=>{
 let calls=0;const handler=createSharedChatHandler({reserve:async()=>{calls++;return 200;}},'test',async()=>{calls++;return 'Hi';});
 for(const input of [{},signed({action:'register'}),signed({timestamp:Date.now()-70000}),{...signed(),signature:'invalid'},signed({payload:{sessionHash:'a'.repeat(64),context:{}}})])assert.ok((await handler(request(input))).status>=400);
 assert.equal((await handler(request({x:'x'.repeat(48000)}))).status,413);assert.equal(calls,0);
 const response=await handler(request(signed()));assert.equal(response.status,200);assert.equal((await response.json()).text,'Hi');assert.equal(calls,2);
});
test('quota denial, replay and disabled service fail closed without calling Groq',async()=>{
 let calls=0;for(const status of [401,409,429]){
 const handler=createSharedChatHandler({reserve:async()=>status},'test',async()=>{calls++;return 'Hi';});assert.equal((await handler(request(signed()))).status,status);
 }
 const disabled=createSharedChatHandler({reserve:async()=>{calls++;return 200;}},'',async()=>{calls++;return '';});assert.equal((await disabled(request(signed()))).status,503);assert.equal(calls,0);
});
