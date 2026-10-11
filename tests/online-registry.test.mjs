import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { OnlineRegistry, SupabaseRegistryStore, createRegistryHandler } from '../dist/portability/online-registry.js';
import { generateIdentity, signData, stableJson } from '../dist/crypto/crypto.js';

const token=()=>randomBytes(32).toString('hex');
const device=name=>({id:token(),name,platform:'Linux'});
function identity(){
  const keys=generateIdentity(),id=`MC-TEST-${randomUUID().replaceAll('-','').toUpperCase()}`;
  return {keys,id,request(action,payload){
    const body={action,id,publicKey:keys.publicKey,payload,timestamp:Date.now(),nonce:randomUUID()};
    return {...body,signature:signData(stableJson(body),keys.privateKey)};
  }};
}
class Store {
  rows=new Map(); reads=0;writes=0;fail=false;dropNext=false;
  async read(key){this.reads++;if(this.fail)throw Error('secret-backend-detail');return structuredClone(this.rows.get(key));}
  async compareAndSwap(key,revision,entry){
    if(this.fail)throw Error('secret-backend-detail');
    if((this.rows.get(key)?.revision??null)!==revision)return false;
    this.rows.set(key,{revision:(revision??0)+1,entry:structuredClone(entry)});this.writes++;
    if(this.dropNext){this.dropNext=false;throw Error('lost reply');}
    return true;
  }
  async health(){if(this.fail)throw Error('secret-backend-detail');}
}

test('independent online workers grant exactly one concurrent session and persist replay protection',async()=>{
  const store=new Store(),owner=identity();
  const a=new OnlineRegistry(store),b=new OnlineRegistry(store);
  const source={session:token(),recovery:token(),device:device('Origem')};
  const registration=owner.request('register',source);
  await a.execute(registration);
  await assert.rejects(new OnlineRegistry(store).execute(registration),/já utilizada/);
  const transfer={transferId:randomUUID(),secret:token(),bundleHash:token()};
  await a.execute(owner.request('recollect',{session:source.session,...transfer}));
  const destinations=['Windows','Celular'].map(name=>({...transfer,session:token(),recovery:token(),device:device(name)}));
  const claims=await Promise.allSettled([a.execute(owner.request('awaken',destinations[0])),b.execute(owner.request('awaken',destinations[1]))]);
  assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(claims.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
  const winner=claims.findIndex(x=>x.status==='fulfilled');
  const state=await new OnlineRegistry(store).execute(owner.request('status',{}));
  assert.equal(state.device.name,destinations[winner].device.name);
  await assert.rejects(a.execute(owner.request('register',source)),e=>e.status===409);
  const stored=JSON.stringify([...store.rows.values()]);
  for(const secret of [owner.keys.privateKey,source.session,source.recovery,transfer.secret,destinations[winner].session])assert.ok(!stored.includes(secret));
});

test('concurrent first registration cannot overwrite the winning owner session',async()=>{
  const store=new Store(),owner=identity();
  const outcomes=await Promise.allSettled(Array.from({length:5},(_,i)=>new OnlineRegistry(store).execute(owner.request('register',{session:token(),recovery:token(),device:device(`Device ${i}`)}))));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(store.writes,1);
});

test('lost database response is retried idempotently with a new signed request after worker restart',async()=>{
  const store=new Store(),owner=identity(),registry=new OnlineRegistry(store);
  const source={session:token(),recovery:token(),device:device('Origem')};
  await registry.execute(owner.request('register',source));
  const transfer={transferId:randomUUID(),secret:token(),bundleHash:token()};
  store.dropNext=true;
  await assert.rejects(registry.execute(owner.request('recollect',{session:source.session,...transfer})),/lost reply/);
  assert.equal((await new OnlineRegistry(store).execute(owner.request('recollect',{session:source.session,...transfer}))).status,'recollected');
  const target={...transfer,session:token(),recovery:token(),device:device('Destino')};
  store.dropNext=true;
  await assert.rejects(registry.execute(owner.request('awaken',target)),/lost reply/);
  assert.equal((await new OnlineRegistry(store).execute(owner.request('awaken',target))).device.name,'Destino');
});

test('invalid signatures, malformed requests and oversized bodies never access storage',async()=>{
  const store=new Store(),handler=createRegistryHandler(store),owner=identity();
  const forged=owner.request('status',{});forged.signature=Buffer.alloc(64).toString('base64');
  for(const [body,status] of [[JSON.stringify(forged),401],['null',401],['{',400],['x'.repeat(64001),413]]){
    const result=await handler(new Request('https://registry.test/registry',{method:'POST',headers:{'Content-Type':'application/json'},body}));
    assert.equal(result.status,status);
  }
  const expired=owner.request('status',{});expired.timestamp-=120000;
  assert.equal((await handler(new Request('https://registry.test/registry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(expired)}))).status,401);
  assert.equal(store.reads,0);assert.equal(store.writes,0);
});

test('health reports storage outages and the handler never relays backend secrets',async()=>{
  const store=new Store(),handler=createRegistryHandler(store),owner=identity();store.fail=true;
  for(const request of [new Request('https://registry.test/health'),new Request('https://registry.test/registry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(owner.request('status',{}))})]){
    const response=await handler(request);assert.equal(response.status,503);
    assert.ok(!(await response.text()).includes('secret-backend-detail'));
  }
  store.fail=false;assert.equal((await handler(new Request('https://registry.test/health'))).status,200);
});

test('Supabase adapter limits secret keys to the backend and does not expose error bodies',async()=>{
  const secret='sb_secret_TEST_ONLY';let headers;
  const store=new SupabaseRegistryStore('https://project.supabase.co',secret,async(_url,options)=>{
    headers=options.headers;return new Response(JSON.stringify({error:secret}),{status:500});
  });
  await assert.rejects(store.read('MC-TEST:hash'),e=>e.status===503&&!e.message.includes(secret));
  assert.equal(headers.apikey,secret);assert.equal(headers.Authorization,undefined);
  const legacy=new SupabaseRegistryStore('https://project.supabase.co','legacy-test-jwt',async(_url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer legacy-test-jwt');return Response.json([]);
  });
  assert.equal(await legacy.read('MC-TEST:hash'),undefined);
});
