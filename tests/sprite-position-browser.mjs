// Real browser flow: local video -> sheet -> per-direction drafts -> another action -> GameViewport atlas.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined,headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const server=await readFile(new URL('../src/server/web-server.ts',import.meta.url),'utf8');
 const csp=/setHeader\('Content-Security-Policy', "([^"]+)"/.exec(server)[1];
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='studio.test')return route.abort();
  try{const body=await readFile(new URL('../web'+u.pathname,import.meta.url));const ext=u.pathname.split('.').pop();return route.fulfill({body,contentType:({js:'text/javascript',html:'text/html',css:'text/css',json:'application/json',png:'image/png'})[ext]||'application/octet-stream',headers:ext==='html'?{'Content-Security-Policy':csp}:{}});}catch{return route.fulfill({status:404,body:'Not found'});}
 });
 const draft=()=>page.evaluate(async()=>{const {readSpriteDraft}=await import('/modules/sprite-store.js');return (await readSpriteDraft('MC-POSITIONS:form:1'))?.atlas;});
 await page.goto('https://studio.test/sprite-studio.html?id=MC-POSITIONS&generation=1');
 await page.waitForFunction(()=>document.querySelector('#automaticSprites button'));

 const upload=async(position,color)=>{
  const data=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=32;c.height=64;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,32,64);return c.toDataURL().split(',')[1];},color);
  await page.locator('#positionInputs input[data-position="'+position+'"]').setInputFiles({name:'pose.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('guardada. Revise'));
 };
 // Every action and compass direction exposes an individual upload, even without a sheet.
 for(const a of ['idle','walk','fly','attack','hurt','faint','pet','sleep','happy','defend']){
  await page.locator('#actionTabs [data-action='+a+']').click();
  for(const d of ['S','SW','W','NW','N','NE','E','SE']){
   await page.locator('#directionCompass [data-direction='+d+']').click();
   assert.ok(await page.locator('#positionInputs input[type=file]').count()>=1);
  }
 }
 await page.locator('#actionTabs [data-action=attack]').click();
 await upload(0,'red');
 await page.locator('#addPosition').click();assert.equal(await page.locator('#positionInputs input').count(),10);
 await page.evaluate(()=>document.querySelector('#status').textContent='');await upload(1,'blue');
 let a=await draft();assert.equal(a.clips.attack.S.frames.length,2);assert.equal(a.clips.attack.S.fps,10);
 await page.locator('#saveAndNext').click();
 await page.locator('#directionCompass [data-direction=N]').click();await page.evaluate(()=>document.querySelector('#status').textContent='');await upload(0,'green');
 await page.locator('#actionTabs [data-action=walk]').click();await page.evaluate(()=>document.querySelector('#status').textContent='');await upload(0,'yellow');
 a=await draft();const attack=structuredClone(a.clips.attack.S.frames),walk=structuredClone(a.clips.walk.S.frames);
 await page.locator('#actionTabs [data-action=attack]').click();await page.evaluate(()=>document.querySelector('#status').textContent='');await upload(0,'purple');
 a=await draft();assert.notEqual(a.clips.attack.S.frames[0],attack[0]);assert.equal(a.clips.attack.S.frames[1],attack[1]);assert.deepEqual(a.clips.walk.S.frames,walk);assert.ok(a.clips.attack.N);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#automaticSprites button'));
 assert.equal(await page.locator('#positionInputs input').count(),9);
 await page.locator('#apply').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('aplicado'));
 await page.setViewportSize({width:393,height:852});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: 80 action/direction uploads, add position, replacement isolation, persistence, apply and mobile.');
}finally{await browser.close();}
