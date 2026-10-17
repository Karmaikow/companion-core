import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createStudioHandler} from '../dist/server/asset-studio-cloud.js';
import {assetPrompt} from '../dist/studio/asset-direction.js';
import {FormImageProvider} from '../dist/server/form-art.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=';
const user='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const brief={name:'Árvore rosa',kind:'tree',prompt:'Árvore de copa rosa com folhas em camadas',palette:'Rosa e verde-musgo'};
const body=()=>({brief,requestId:id,paidConsent:true,references:[{name:'Estudo',image:png}]});
async function fixture(options={}){
  const jobs=new Map(),uploads=[],calls=[];let generations=0;
  const backend=async(url,init={})=>{
    calls.push({url,init});
    if(url.endsWith('/auth/v1/user'))return Response.json({id:user},{status:options.unauthorized?401:200});
    if(url.includes('/studio_admins?'))return Response.json(options.nonAdmin?[]:[{user_id:user}]);
    if(url.includes('/storage/v1/')){uploads.push({url,init});if(options.uploadFailure)throw Error('backend secret response');return Response.json({});}
    if(url.endsWith('/studio_assets')&&init.method==='POST'){
      const row=JSON.parse(init.body);if(jobs.has(row.id))return new Response('',{status:409});jobs.set(row.id,row);return Response.json([row]);
    }
    if(url.includes('/studio_assets?id=eq.')&&init.method==='PATCH'){
      const row={...jobs.get(id),...JSON.parse(init.body)};jobs.set(id,row);return Response.json([row]);
    }
    throw Error('Unexpected mock path');
  };
  const provider={status:()=>({configured:!options.unconfigured,model:'image-model'}),generate:async(prompt,consent,refs)=>{generations++;assert.match(prompt,/orthographic/);assert.equal(consent,true);assert.equal(refs.length,1);if(options.providerFailure)throw Error('A API de imagens recusou o pedido (429).');return png;}};
  const handler=createStudioHandler({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable',COMPANION_IMAGE_API_KEY:'server-only-secret'},request:backend,provider});
  const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  return {jobs,uploads,calls,get generations(){return generations;},request:(input=body(),method='POST',authorized=true)=>fetch(base,{method,headers:{...(authorized?{Authorization:'Bearer test-user-token'}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(input)}:{})}),close:async()=>{server.close();server.closeAllConnections();await once(server,'close');}};
}
test('Studio authenticates and authorizes before any generation or reservation',async()=>{
  for(const [options,expected]of [[{},401],[{nonAdmin:true},403],[{unconfigured:true},503]]){
    const f=await fixture(options);try{const r=await f.request(body(),'POST',expected!==401);assert.equal(r.status,expected);assert.equal(f.generations,0);assert.equal(f.jobs.size,0);assert.doesNotMatch(JSON.stringify(await r.json()),/server-only-secret/);}finally{await f.close();}
  }
});
test('Studio rejects absent consent and malformed references; status does not generate',async()=>{
  const f=await fixture();try{
    const status=await f.request(null,'GET');assert.equal(status.status,200);assert.equal((await status.json()).configured,true);
    for(const input of [{...body(),paidConsent:false},{...body(),references:[{name:'bad',image:'https://attacker/secret'}]},{...body(),references:Array(4).fill({name:'x',image:png})}])assert.equal((await f.request(input)).status,400);
    assert.equal(f.jobs.size,0);assert.equal(f.generations,0);
  }finally{await f.close();}
});
test('Studio reserves once, stores private references and output, returns only a confirmed draft',async()=>{
  const f=await fixture();try{
    const results=await Promise.all([f.request(),f.request()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.generations,1);
    const result=await results.find(r=>r.status===200).json();assert.equal(result.asset.status,'draft');assert.equal(result.asset.metadata.generation.state,'ready');assert.equal(result.asset.created_by,undefined);
    assert.equal(result.asset.metadata.references[0].purpose,'style-reference-only');assert.equal(f.uploads.length,2);
    assert.equal(f.uploads.every(x=>x.init.headers.Authorization==='Bearer test-user-token'),true);
    assert.doesNotMatch(JSON.stringify(result),/test-user-token|server-only-secret/);
  }finally{await f.close();}
});
test('Provider or storage failure is never reported as generated success and cannot repeat same paid job',async()=>{
  for(const options of [{providerFailure:true},{uploadFailure:true}]){
    const f=await fixture(options);try{const r=await f.request();assert.ok(r.status>=500);const result=await r.json();assert.equal(result.asset,undefined);assert.equal(result.image,undefined);assert.doesNotMatch(result.error,/backend secret/);assert.equal(f.jobs.get(id).metadata.generation.state,'failed');assert.equal((await f.request()).status,409);assert.equal(f.generations,options.uploadFailure?0:1);}finally{await f.close();}
  }
});
test('Studio direction holds camera, outlines, scale and light beyond palette; image provider sends all references',async()=>{
  const prompt=assetPrompt(brief);for(const token of ['orthographic','outlines','relative scale','upper left','transparent alpha','references only'])assert.ok(prompt.includes(token),token);
  let call;const provider=new FormImageProvider('/unused',async(url,init)=>{call={url,init};return Response.json({data:[{b64_json:png.slice(22)}]});},{COMPANION_IMAGE_API_KEY:'test-only',COMPANION_IMAGE_MODEL:'configured-model'});
  await provider.generate(prompt,true,[Buffer.from(png.slice(22),'base64'),Buffer.from(png.slice(22),'base64')]);
  assert.match(call.url,/edits$/);assert.equal(call.init.body.getAll('image[]').length,2);assert.equal(call.init.body.get('background'),'transparent');assert.equal(call.init.body.get('model'),'configured-model');
});
