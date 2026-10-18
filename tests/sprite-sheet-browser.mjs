// Run after npm run build: node tests/sprite-sheet-browser.mjs (requires Playwright).
// No server or generation APIs: route real application files through an isolated HTTPS origin.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='sprite.test')return route.abort();
  if(u.pathname==='/world-test')return route.fulfill({contentType:'text/html',body:'<div id="worldFrame" style="position:relative;width:800px;height:600px"></div>'});
  try{const body=await readFile(new URL('../web'+u.pathname,import.meta.url));const ext=u.pathname.split('.').pop();await route.fulfill({body,contentType:({js:'text/javascript',html:'text/html',css:'text/css',json:'application/json',png:'image/png'})[ext]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}
 });
 await page.goto('https://sprite.test/sprite-studio.html?id=MC-MEGA-TEST&generation=1');
 await page.waitForFunction(()=>document.querySelector('#automaticSprites button'));
 await page.locator('#megaSheetImport summary').click();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=3127;c.height=5215;const x=c.getContext('2d');x.fillStyle='#ff00ff';x.fillRect(0,0,c.width,c.height);for(let i=0;i<240;i++){const a=i%12*261,b=Math.floor(i/12)*261;x.clearRect(a,b,256,256);x.fillStyle=`rgb(${i},100,50)`;x.fillRect(a+64,b+64,128,180);}return c.toDataURL().split(',')[1];});
 await page.locator('#sheetFile').setInputFiles({name:'synthetic-mayuna-grid.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>!document.querySelector('#sheetCrop').disabled);
 await page.locator('#sheetCrop').click();
 await page.waitForFunction(()=>document.querySelector('#sheetStatus').textContent.includes('240'));
 await page.locator('#sheetImport').click();
 assert.match(await page.locator('#sheetStatus').textContent(),/pelo menos uma/);
 for(const [i,d]of ['S','SW','W','NW','N','NE','E','SE'].entries())await page.locator('#sheet-range-'+d).fill(`${i*3}-${i*3+2}`);
 await page.locator('#sheetFps').fill('12');
 await page.locator('#sheetImport').click();
 await page.waitForFunction(()=>document.querySelector('#timeline').children.length===240);
 assert.equal(await page.locator('#fps').inputValue(),'12');
 await page.locator('#apply').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('aplicado'));
 const saved=await page.evaluate(async()=>{const {readSprite}=await import('/modules/sprite-store.js');const s=await readSprite('MC-MEGA-TEST:form:1');const b=await createImageBitmap(s.blob);const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);return {width:b.width,height:b.height,atlas:s.atlas,transparent:[...x.getImageData(255,255,1,1).data],last:[...x.getImageData(11*256+100,19*256+100,1,1).data]};});
 assert.equal(saved.width,3072);assert.equal(saved.height,5120);assert.equal(Object.keys(saved.atlas.clips.walk).length,8);assert.equal(saved.atlas.clips.walk.N.fps,12);assert.equal(saved.atlas.clips.walk.N.loop,false);assert.equal(saved.transparent[3],0);assert.deepEqual(saved.last,[239,100,50,255]);
 await page.goto('https://sprite.test/world-test');
 await page.evaluate(async()=>{const {GameViewport,HolographicCoreRenderer}=await import('/modules/game-viewport.js');window.viewport=new GameViewport(document.querySelector('#worldFrame'),new HolographicCoreRenderer());viewport.mount();viewport.setState({identity:{id:'MC-MEGA-TEST',name:'Teste'},core:{evolutionStage:'FIRST'},manifestation:{hasBody:true,generation:1,recipe:{}}});});
 await page.waitForFunction(()=>window.viewport.renderer.body?.available);
 const views=await page.evaluate(()=>{const b=viewport.renderer.body;return [[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1]].map(([x,y])=>{b.setMovement(x,y,1000);b.render(1000);const first=b.canvas.dataset.spriteFrame;b.render(2000);return {dir:b.direction,first:Number(first),last:Number(b.canvas.dataset.spriteFrame),exact:b.canvas.dataset.spriteExact};});});
 for(const [i,v]of views.entries()){assert.equal(v.first,i*3);assert.equal(v.last,i*3+2);assert.equal(v.exact,'true');}
 await page.evaluate(async()=>{const {readSprite,saveSprite}=await import('/modules/sprite-store.js');const s=await readSprite('MC-MEGA-TEST:form:1');s.atlas.clips.walk.SE.frames=[99];await saveSprite('MC-MEGA-TEST:form:1',s);});
 await page.waitForFunction(()=>viewport.renderer.body.atlas?.clips.walk.SE.frames[0]===99);
 await page.evaluate(()=>viewport.setState({...viewport.state,manifestation:{hasBody:true,generation:2,recipe:{}}}));
 assert.equal(await page.evaluate(()=>viewport.renderer.body.available),false);
 await page.evaluate(async()=>{viewport.destroy();const {Refuge3DRenderer}=await import('/modules/refuge-3d.js');window.world3d=new Refuge3DRenderer();world3d.mount(document.querySelector('#worldFrame'));world3d.resize(800,600,1);world3d.setState({identity:{id:'MC-MEGA-TEST',name:'Teste'},manifestation:{hasBody:true,generation:1,recipe:{}}});});
 await page.waitForFunction(()=>window.world3d.body.available);
 const uv=await page.evaluate(()=>{const r=world3d;r.direction='N';r.render(1000);const first=r.texture.offset.toArray();r.render(2000);const last=r.texture.offset.toArray();r.direction='W';r.render(3000);const restart=r.texture.offset.toArray();r.destroy();return {first,last,restart};});
 assert.deepEqual(uv.first,[0,.9]);assert.deepEqual(uv.last,[2/12,.9]);assert.deepEqual(uv.restart,[6/12,.95]);
 assert.deepEqual(errors,[]);
 console.log('PASS: real Studio import, 240 crops/alpha, eight directions, FPS, IndexedDB apply, Canvas and WebGL playback, live reload and generation isolation.');
}finally{await browser.close();}
