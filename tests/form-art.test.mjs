import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {FormArtStore,FormImageProvider,validateArt} from '../dist/server/form-art.js';
import {CompanionRuntime} from '../dist/server/companion-runtime.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=';

test('art validation rejects active formats, oversized dimensions and inconsistent strips',()=>{
 assert.equal(validateArt(png).frames,1);
 assert.throws(()=>validateArt('data:image/svg+xml;base64,AAAA'),/PNG/);
 assert.throws(()=>validateArt(png,2),/pixels/);
 assert.throws(()=>validateArt(png,1,100),/segundo/);
 const large=Buffer.from(png.slice(22),'base64');large.writeUInt32BE(9000,16);
 assert.throws(()=>validateArt('data:image/png;base64,'+large.toString('base64')),/pixels/);
 assert.throws(()=>validateArt('data:image/png;base64,'+Buffer.alloc(50).toString('base64')),/PNG/);
});

test('art is private, survives reload, preserves the earlier image and cannot grant progress',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'form-art-'));
 const provider={name:'test',async generateResponse(){return 'Olá';}};
 try{
 const runtime=new CompanionRuntime(provider,root);await runtime.initialize();
 await runtime.createCompanion({name:'Lunaya',ownerName:'Didi',preferredAddress:'Didi',archetype:'curious'});
 const context=runtime.artContext(),before=runtime.getClientState();
 assert.equal(context.generation,0);assert.match(context.prompt,/chibi/);
 await assert.rejects(runtime.applyArt({id:'MC-OTHER',generation:0,image:png}),/mudou/);
 await assert.rejects(runtime.applyArt({id:context.id,generation:1,image:png}),/mudou/);
 const state=await runtime.applyArt({...context,image:png,frames:1,fps:6});
 assert.deepEqual(state.core,before.core);assert.deepEqual(state.bond,before.bond);assert.deepEqual(state.memories,before.memories);
 assert.equal(state.meta.eventCount,before.meta.eventCount+1);assert.equal(runtime.verify().valid,true);
 const stored=await runtime.artImage(context.id,state.artwork.id);assert.equal(stored.toString('base64'),png.slice(22));
 assert.equal((await stat(path.join(root,'artwork',context.id,state.artwork.id+'.png'))).mode&0o777,0o600);
 await runtime.applyArt({...context,image:png,frames:1,fps:6});assert.equal(runtime.getClientState().meta.eventCount,state.meta.eventCount);
 await runtime.applyArt({...context,image:png,frames:1,fps:8});assert.equal(runtime.getClientState().artworkHistory.length,1);
 const resumed=new CompanionRuntime(provider,root);await resumed.initialize();assert.deepEqual(resumed.getClientState(),runtime.getClientState());
 await assert.rejects(runtime.artImage('MC-OTHER',state.artwork.id),/não encontrada/);
 await assert.rejects(new FormArtStore(root).get('../bad','bad'),/inválida/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('optional image API requires explicit consent, keeps keys private and uses edits for continuity',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'image-api-'));const calls=[];
 try{
 const request=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({data:[{b64_json:png.slice(22)}]}),{status:200});};
 const provider=new FormImageProvider(root,request,{});await provider.initialize();
 await assert.rejects(provider.generate('prompt',false),/Confirme/);assert.equal(calls.length,0);
 await provider.configure({key:'test-private-key'});assert.equal(JSON.stringify(provider.status()).includes('test-private-key'),false);
 assert.equal((await stat(path.join(root,'.access','images.json'))).mode&0o777,0o600);
 assert.equal(await provider.generate('prompt',true),png);assert.match(calls[0].url,/generations$/);assert.equal(JSON.parse(calls[0].init.body).background,'transparent');
 await provider.generate('keep identity',true,validateArt(png).bytes);assert.match(calls[1].url,/edits$/);assert.ok(calls[1].init.body instanceof FormData);assert.equal(calls[1].init.body.get('image[]').type,'image/png');
 const denied=new FormImageProvider(root,async()=>new Response('denied',{status:401}),{});await denied.initialize();await assert.rejects(denied.generate('prompt',true),/401/);
 assert.equal(JSON.parse(await readFile(path.join(root,'.access','images.json'),'utf8')).key,'test-private-key');
 }finally{await rm(root,{recursive:true,force:true});}
});
