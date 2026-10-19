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
 const draft=()=>page.evaluate(async()=>{const {readSpriteDraft}=await import('/modules/sprite-store.js');return (await readSpriteDraft('MC-WORKFLOW:form:1'))?.atlas;});
 await page.goto('https://studio.test/sprite-studio.html?id=MC-WORKFLOW&generation=1');
 await page.waitForFunction(()=>document.querySelector('#automaticSprites button'));
 await page.locator('#actionTabs [data-action=attack]').click();
 assert.equal(await page.locator('#coverage .coverage-label').textContent(),'Ataque');
 assert.equal(await page.locator('#coverage .coverage-label').count(),1);
 assert.equal(await page.locator('#directionCompass button').count(),8);
 await page.locator('#megaSheetImport > summary').click();await page.locator('#videoImport summary').click();
 await page.locator('#videoFile').setInputFiles(new URL('./fixtures/studio-video.webm',import.meta.url).pathname);
 await page.waitForFunction(()=>!document.querySelector('#videoExtract').disabled);
 assert.equal(await page.locator('#videoFps').inputValue(),'10');await page.locator('#videoKey').check();
 await page.locator('#videoExtract').click();
 await page.waitForFunction(()=>document.querySelector('#sheetCount').value==='16',null,{timeout:25000});
 assert.equal(await page.locator('#sheetFps').inputValue(),'10');
 await page.locator('#sheetImport').click();await page.waitForFunction(()=>document.querySelector('#timeline').children.length===16);
 const video=await page.evaluate(async()=>{
  const {readSpriteDraft}=await import('/modules/sprite-store.js');const s=await readSpriteDraft('MC-WORKFLOW:form:1'),b=await createImageBitmap(s.blob),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);
  const fw=s.atlas.frameWidth,fh=s.atlas.frameHeight,last=s.atlas.frameCount-1;
  const sample=(frame,px,py)=>[...x.getImageData(frame%s.atlas.columns*fw+px,Math.floor(frame/s.atlas.columns)*fh+py,1,1).data];
  return{count:s.atlas.frameCount,first:sample(0,32,32),last:sample(last,185,32),background:sample(0,128,128)};
 });
 assert.equal(video.count,16);assert.ok(video.first[0]>150&&video.first[3]>0);assert.ok(video.last[0]>150&&video.last[3]>0);assert.equal(video.background[3],0);
 for(let i=1;i<=8;i++){await page.locator('#saveAndNext').click();await page.waitForFunction(n=>document.querySelector('#actionProgress').textContent.includes(n+' de 8'),i);}
 assert.equal(await page.locator('#directionCompass [data-complete=true]').count(),8);
 assert.match(await page.locator('#status').textContent(),/oito direções/);
 assert.equal(await page.evaluate(async()=>{const {readSprite}=await import('/modules/sprite-store.js');return await readSprite('MC-WORKFLOW:form:1');}),null);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#automaticSprites button'));
 assert.equal(await page.locator('#actionTabs [aria-current=page]').getAttribute('data-action'),'attack');
 assert.equal(await page.locator('#directionCompass [data-complete=true]').count(),8);
 // Reopening loses the transient source, so map a new variable-count sheet into the next action.
 await page.locator('#nextAction').click();assert.equal(await page.locator('#actionTabs [aria-current=page]').getAttribute('data-action'),'hurt');
 await page.locator('#actionTabs [data-action=walk]').click();await page.locator('#megaSheetImport > summary').click();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=128;c.height=80;const x=c.getContext('2d');for(let i=0;i<37;i++){x.fillStyle='rgb('+i+',100,200)';x.fillRect(i%8*16,Math.floor(i/8)*16,16,16);}return c.toDataURL().split(',')[1];});
 await page.locator('#sheetFile').setInputFiles({name:'37-frames.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>!document.querySelector('#sheetCrop').disabled);
 for(const [k,v]of Object.entries({columns:8,rows:5,frameWidth:16,frameHeight:16,gapX:0,gapY:0,marginX:0,marginY:0}))await page.locator('#sheet-'+k).fill(String(v));
 await page.locator('#sheetCount').fill('37');await page.locator('#sheetCrop').click();
 await page.waitForFunction(()=>document.querySelector('#sheetStatus').textContent.includes('37 quadros'));
 await page.locator('#sheetImport').click();await page.waitForFunction(()=>document.querySelector('#timeline').children.length===53);
 let atlas=await draft();assert.equal(atlas.frameCount,53);assert.equal(Object.keys(atlas.clips.attack).length,8);assert.equal(Object.keys(atlas.studio.reviewed.attack).length,8);assert.equal(atlas.clips.walk.S.frames[0],16);
 // Reuse the same sheet for another action: no duplicate frames, other actions stay saved.
 await page.locator('#actionTabs [data-action=idle]').click();await page.locator('#sheetImport').click();
 await page.waitForFunction(async()=>{const {readSpriteDraft}=await import('/modules/sprite-store.js');return Boolean((await readSpriteDraft('MC-WORKFLOW:form:1'))?.atlas.clips.idle?.S);});
 atlas=await draft();assert.equal(atlas.frameCount,53);assert.ok(atlas.clips.idle.S);assert.ok(atlas.clips.walk.S);assert.equal(atlas.clips.idle.S.frames[0],16);
 await page.locator('#frames').fill('16,18,17');await page.locator('#saveAndNext').click();
 await page.waitForFunction(()=>document.querySelector('#actionProgress').textContent.includes('1 de 8'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#automaticSprites button'));
 atlas=await draft();assert.deepEqual(atlas.clips.idle.S.frames,[16,18,17]);
 assert.equal(await page.locator('#directionCompass [aria-pressed=true]').getAttribute('data-direction'),'SW');
 await page.locator('#apply').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('aplicado'));
 const applied=await page.evaluate(async()=>{const {readSprite}=await import('/modules/sprite-store.js');return (await readSprite('MC-WORKFLOW:form:1')).atlas;});assert.ok(applied.clips.attack.S);assert.deepEqual(applied.clips.idle.S.frames,[16,18,17]);
 await page.setViewportSize({width:393,height:852});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#directionCompass').screenshot({path:process.env.STUDIO_SCREENSHOT||'/tmp/studio-compass.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: local video/CSP/chroma, 16+37 frames, one action at a time, compass, eight durable direction saves, resume, action preservation, source reuse, manual ordering, isolated apply and mobile layout.');
}finally{await browser.close();}
