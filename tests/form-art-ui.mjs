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
 await page.click('#evolutionPreview');await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d');
 assert.equal(await page.locator('.companion-body-canvas').isVisible(),true);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  if(process.env.MAYUNA_SCREENSHOT_DIR){await mkdir(process.env.MAYUNA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.MAYUNA_SCREENSHOT_DIR,`sprite-${width}.png`)});}
  const box=await page.locator('.companion-body-canvas').boundingBox();assert.ok(box.width>0&&box.x>=0&&box.x+box.width<=width+1);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await enter();await page.locator('.mobile-dock [data-open-panel="menu"]').click();await page.locator('#panel-menu [data-open-panel="companion"]').click();await page.click('#artOpen');await page.locator('#artDownload').waitFor({state:'visible'});
 assert.match(await page.locator('#artDownload').getAttribute('href'),new RegExp(after.artwork.id));
 await page.locator('#artEditor details').evaluate(el=>el.open=true);await page.click('#artGenerate');await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('créditos'));
 await page.click('#evolutionPreview');await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d');
 assert.ok(await page.locator('.companion-body-canvas').evaluate(c=>c.width>0 && c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]>0),'reduced motion must paint asynchronously loaded art');
 assert.deepEqual(errors,[]);console.log('PASS: owner auth, prompt, import/preview without mutation, apply, private PNG, cross-origin rejection, desktop/mobile sprite, reload, reduced motion, paid-consent gate; no JS errors.');
}finally{await browser?.close();if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}await rm(root,{recursive:true,force:true});}
