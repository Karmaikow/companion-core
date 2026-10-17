// Isolated cloud contract test: all auth, catalog, storage and image-service calls
// are intercepted. No production writes or paid image requests occur.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const root=path.resolve('web'),user='11111111-1111-4111-8111-111111111111';
const server=createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))throw Error();const data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png');res.end(data);}catch{res.writeHead(404);res.end();}
});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage();const rows=new Map(),files=new Map(),errors=[];let admin=true,configured=false,paidPosts=0;
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({user})=>localStorage.setItem('companion-core.supabase.session.v1',JSON.stringify({access_token:'test-browser-token',refresh_token:'test-refresh',expires_at:Date.now()+3600000,user:{id:user,email:'test@example.invalid'}})),{user});
 await page.route('**/modules/runtime-mode.js',route=>route.fulfill({contentType:'text/javascript',body:`export const mode='cloud';export const cloudConfig={url:'https://studio-test.supabase.co',publishableKey:'public-test'};`}));
 await page.route('https://studio-test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':base,'access-control-allow-headers':'authorization,apikey,content-type,prefer,x-upsert','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'};
  const send=(value,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(value)});
  if(req.method()==='OPTIONS')return send({});
  assert.equal(req.headers().authorization,'Bearer test-browser-token');
  if(url.pathname.endsWith('/studio_admins'))return send(admin?[{user_id:user}]:[]);
  if(url.pathname.endsWith('/studio_assets')){
   if(req.method()==='POST'){assert.ok(admin);const row={...req.postDataJSON(),created_at:new Date().toISOString()};assert.equal(row.status,'draft');rows.set(row.id,row);return send([row],201);}
   if(req.method()==='PATCH'){const id=url.searchParams.get('id').slice(3);const row={...rows.get(id),...req.postDataJSON()};rows.set(id,row);return send([row]);}
   return send([...rows.values()].filter(r=>admin||r.status==='published'));
  }
  if(url.pathname.startsWith('/storage/v1/object/')){
   const name=decodeURIComponent(url.pathname.split('/companion-studio/')[1]);
   if(!admin&&!([...rows.values()].some(r=>r.status==='published'&&r.object_path===name)))return send({},403);
   if(req.method()==='POST'){files.set(name,req.postDataBuffer());return send({});}
   if(!files.has(name))return send({},404);
   return route.fulfill({headers,contentType:'image/png',body:files.get(name)});
  }
  throw Error('Unexpected cloud test request '+url.pathname);
 });
 await page.route('**/api/studio',route=>{
  if(route.request().method()==='POST'){paidPosts++;return route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'Provedor indisponível no teste; nenhuma imagem retornada.'})});}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({configured,model:'test-model'})});
 });
 await page.goto(base+'/asset-studio.html');await page.waitForFunction(()=>document.querySelector('#accountStatus').textContent.includes('rascunhos privados'));
 assert.equal(await page.locator('#storage').inputValue(),'cloud');assert.equal(await page.locator('#generate').isDisabled(),true);
 await page.setInputFiles('#referenceFiles','web/assets/refuge/mayuna-reference.png');await page.waitForFunction(()=>document.querySelectorAll('.ref').length===1);
 await page.setInputFiles('#assetFile','web/assets/refuge/mayuna-reference.png');await page.waitForFunction(()=>document.querySelector('#imageBadge').textContent==='IMPORTADA');
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('na sua conta'));
 assert.equal(rows.size,1);assert.equal(files.size,2);assert.equal([...rows.values()][0].metadata.references[0].purpose,'style-reference-only');
 await page.reload();await page.locator('.asset-tile').click();await page.waitForFunction(()=>document.querySelectorAll('.ref').length===1&&document.querySelector('#imageBadge').textContent==='IMPORTADA');
 configured=true;await page.reload();await page.waitForFunction(()=>!document.querySelector('#generate').disabled);await page.locator('#paidConsent').check();await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#feedback').classList.contains('error'));
 assert.equal(paidPosts,1);assert.equal(await page.locator('.option').count(),0);assert.match(await page.locator('#feedback').textContent(),/indisponível/);
 admin=false;for(const row of rows.values())row.status='published';await page.reload();await page.waitForFunction(()=>document.querySelector('#accountStatus').textContent.includes('sem edição'));assert.equal(await page.locator('#save').isDisabled(),true);
 await page.locator('.asset-tile').click();await page.waitForFunction(()=>document.querySelector('#imageBadge').textContent==='IMPORTADA');assert.equal(await page.locator('.ref').count(),0,'private references are not requested by catalog readers');
 assert.deepEqual(errors,[]);console.log('PASS: cloud account integration, private draft upload/download/reopen, missing credentials, generation failure has no fake result, non-admin read-only. All cloud calls mocked.');
}finally{await browser?.close();server.close();server.closeAllConnections();}
