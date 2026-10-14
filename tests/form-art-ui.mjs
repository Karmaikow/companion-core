// Optional browser integration: PLAYWRIGHT_MODULE and MAYUNA_TEST_BROWSER work like ui-smoke.mjs.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=await mkdtemp(path.join(tmpdir(),'art-ui-'));
const port='4351';
const child=spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,MAYUNA_DATA_DIR:root,MAYUNA_AI_PROVIDER:'mock',PORT:port,HOST:'127.0.0.1',COMPANION_REGISTRY_URL:'',COMPANION_APP_TOKEN:''},stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('startup timeout')),8000);child.stdout.on('data',x=>{if(x.toString().includes('Interface:')){clearTimeout(timeout);resolve();}});child.on('exit',()=>reject(Error('server exited')));});
 browser=await chromium.launch({headless:true,...(process.env.MAYUNA_TEST_BROWSER?{executablePath:process.env.MAYUNA_TEST_BROWSER,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage','--use-angle=swiftshader']}: {})});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=`http://127.0.0.1:${port}`;
 assert.equal((await page.request.get(base+'/api/companion/art')).status(),401);
 const auth=await page.request.post(base+'/api/auth/setup',{data:{username:'tester',password:'OnlyTests-12345!'}});assert.equal(auth.status(),200);
 const created=await page.request.post(base+'/api/companions',{data:{name:'Lunaya',ownerName:'Didi',preferredAddress:'Didi',archetype:'curious'}});assert.equal(created.status(),201);
 const state=await created.json();
 const stateBefore=await readFile(path.join(root,state.identity.id+'.json'),'utf8');
 async function enter(){await page.goto(base);await page.locator('#enterWorld').waitFor({state:'visible'});await page.click('#enterWorld');await page.waitForFunction(()=>!document.body.classList.contains('is-locked'));}
 await enter();
 const launch=page.locator('[data-open-panel="companion"]:visible').first();await launch.click();
 await page.click('#artOpen');await page.locator('#artEditor').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('Pronto'));
 assert.match(await page.locator('#artPrompt').inputValue(),/Lunaya/);
 // A disposable raster drawn only for testing the animation/import pipeline.
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=256;c.height=256;const g=c.getContext('2d');g.fillStyle='#ac80ff';g.beginPath();g.arc(128,128,80,0,Math.PI*2);g.fill();return c.toDataURL('image/png');});
 await page.setInputFiles('#artFile',{name:'test-form.png',mimeType:'image/png',buffer:Buffer.from(png.slice(22),'base64')});
 await page.locator('#artApply').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#artApply').disabled);
 assert.equal(await readFile(path.join(root,state.identity.id+'.json'),'utf8'),stateBefore,'preview must not write state');
 await page.click('#artApply');await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('Arte aplicada'));
 const after=await (await page.request.get(base+'/api/companion/state')).json();assert.deepEqual(after.core,state.core);assert.deepEqual(after.memories,state.memories);
 const denied=await page.request.post(base+'/api/companion/art/apply',{headers:{Origin:'https://evil.example'},data:{id:state.identity.id,generation:0,image:png}});assert.equal(denied.status(),403);
 const art=await page.request.get(base+`/api/companion/art/${state.identity.id}/${after.artwork.id}`);assert.equal(art.status(),200);assert.equal(art.headers()['cache-control'],'no-store');
 // Regression: the generated Mayuna strip was 2172px wide, not divisible by 8.
 // Change frames AFTER import too: applying must normalize the original again.
 const strip=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2172;c.height=724;const g=c.getContext('2d');for(let i=0;i<8;i++){g.fillStyle=`hsl(${i*40} 70% 60%)`;g.fillRect(i*c.width/8+30,240,200,240);}return c.toDataURL('image/png');});
 const beforeStrip=await readFile(path.join(root,state.identity.id+'.json'),'utf8');
 await page.setInputFiles('#artFile',{name:'mayuna-2172.png',mimeType:'image/png',buffer:Buffer.from(strip.slice(22),'base64')});
 await page.waitForFunction(()=>!document.querySelector('#artApply').disabled);
 await page.fill('#artFrames','8');await page.fill('#artFps','4');
 assert.equal(await readFile(path.join(root,state.identity.id+'.json'),'utf8'),beforeStrip);
 await page.click('#artApply');await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('Arte aplicada'));
 assert.match(await page.locator('#artStatus').textContent(),/2172 × 724 → 2168 × 724/);
 const animated=await (await page.request.get(base+'/api/companion/state')).json();
 assert.equal(animated.artwork.frames,8);assert.equal(animated.artwork.fps,4);assert.notEqual(animated.artwork.id,after.artwork.id);assert.equal(animated.artworkHistory.length,1);
 assert.deepEqual(animated.core,state.core);assert.deepEqual(animated.memories,state.memories);
 const stored=await readFile(path.join(root,'artwork',state.identity.id,animated.artwork.id+'.png'));
 assert.equal(stored.readUInt32BE(16),2168);assert.equal(stored.readUInt32BE(20),724);
 const alpha=await page.evaluate(async(url)=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d');g.drawImage(img,0,0);return [g.getImageData(0,0,1,1).data[3],g.getImageData(80,300,1,1).data[3]];},base+`/api/companion/art/${state.identity.id}/${animated.artwork.id}`);
 assert.deepEqual(alpha,[0,255]);
 // Dimensions over the old limits, alpha, JPEG/WebP conversion and the PNG
 // compression fallback are checked in the same browser used for import.
 const preparedChecks=await page.evaluate(async()=>{
  const {normalizeArtImage,decodeArtImage}=await import('/modules/art-image.js');
  const c=document.createElement('canvas');c.width=3000;c.height=3000;const g=c.getContext('2d');g.fillStyle='#ff8080';g.fillRect(500,500,2000,2000);
  const big=await normalizeArtImage(await decodeArtImage(c.toDataURL('image/png')));
  const probe=await decodeArtImage(big.dataUrl);const out=document.createElement('canvas');out.width=probe.naturalWidth;out.height=probe.naturalHeight;out.getContext('2d').drawImage(probe,0,0);
  const topAlpha=out.getContext('2d').getImageData(0,0,1,1).data[3];
  const formats=[];for(const type of ['image/jpeg','image/webp']){const prepared=await normalizeArtImage(await decodeArtImage(c.toDataURL(type)));formats.push(prepared.dataUrl.startsWith('data:image/png;base64,'));}
  c.width=1400;c.height=1000;const noisy=g.createImageData(c.width,c.height);let seed=1;for(let i=0;i<noisy.data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;noisy.data[i]=seed&255;}g.putImageData(noisy,0,0);
  const raw=c.toDataURL('image/png');const inputBytes=atob(raw.split(',')[1]).length;
  const compressed=await normalizeArtImage(await decodeArtImage(raw));
  return {big:{width:big.width,height:big.height,bytes:big.bytes},topAlpha,formats,inputBytes,compressed:{width:compressed.width,height:compressed.height,bytes:compressed.bytes}};
 });
 assert.deepEqual([preparedChecks.big.width,preparedChecks.big.height],[2048,2048]);assert.equal(preparedChecks.topAlpha,0);assert.deepEqual(preparedChecks.formats,[true,true]);
 assert.ok(preparedChecks.inputBytes>4000000);assert.ok(preparedChecks.compressed.bytes<=4000000);assert.ok(preparedChecks.compressed.width<1400);
 // A large input is also imported through the UI and persisted by the API.
 const large=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=3000;c.height=3000;const g=c.getContext('2d');g.fillStyle='#ac80ff';g.beginPath();g.arc(1500,1500,1000,0,Math.PI*2);g.fill();return c.toDataURL('image/png');});
 await page.fill('#artFrames','1');await page.setInputFiles('#artFile',{name:'large-form.png',mimeType:'image/png',buffer:Buffer.from(large.slice(22),'base64')});await page.waitForFunction(()=>!document.querySelector('#artApply').disabled);
 assert.match(await page.locator('#artStatus').textContent(),/3000 × 3000 → 2048 × 2048/);
 await page.click('#artApply');await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('Arte aplicada'));
 const current=await (await page.request.get(base+'/api/companion/state')).json();assert.equal(current.artworkHistory.length,2);
 const persisted=JSON.parse(await readFile(path.join(root,state.identity.id+'.json'),'utf8'));assert.equal(persisted.state.artwork.id,current.artwork.id);
 const invalidBefore=await readFile(path.join(root,state.identity.id+'.json'),'utf8');
 await page.setInputFiles('#artFile',{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('Não foi possível abrir'));
 assert.equal(await page.locator('#artApply').isDisabled(),true);assert.equal(await readFile(path.join(root,state.identity.id+'.json'),'utf8'),invalidBefore);
 await page.click('#evolutionPreview');await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d');
 assert.equal(await page.locator('.companion-body-canvas').isVisible(),true);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  if(process.env.MAYUNA_SCREENSHOT_DIR){await mkdir(process.env.MAYUNA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.MAYUNA_SCREENSHOT_DIR,`sprite-${width}.png`)});}
  const box=await page.locator('.companion-body-canvas').boundingBox();assert.ok(box.width>0&&box.x>=0&&box.x+box.width<=width+1);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await enter();await page.locator('.mobile-dock [data-open-panel="menu"]').click();await page.locator('#panel-menu [data-open-panel="companion"]').click();await page.click('#artOpen');await page.locator('#artDownload').waitFor({state:'visible'});
 assert.match(await page.locator('#artDownload').getAttribute('href'),new RegExp(current.artwork.id));
 await page.locator('#artEditor details').evaluate(el=>el.open=true);await page.click('#artGenerate');await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('créditos'));
 await page.click('#evolutionPreview');await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d');
 assert.ok(await page.locator('.companion-body-canvas').evaluate(c=>c.width>0 && c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]>0),'reduced motion must paint asynchronously loaded art');
 assert.deepEqual(errors,[]);console.log('PASS: 2172px/8-frame regression, large-image UI import, alpha preservation, JPEG/WebP conversion, >4 MB PNG reduction, invalid-image handling, persistence/history/reload, owner auth, private PNG, desktop/mobile rendering and reduced motion; no JS errors.');
}finally{await browser?.close();if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}await rm(root,{recursive:true,force:true});}
