// Optional: npm install --no-save --package-lock=false playwright
// npx playwright install chromium && node tests/ui-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const data = await mkdtemp(path.join(tmpdir(),'mayuna-ui-'));
const port = process.env.MAYUNA_TEST_PORT || '4296';
const server = spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,PORT:port,MAYUNA_AI_PROVIDER:'mock',MAYUNA_DATA_DIR:data},stdio:['ignore','pipe','pipe']});
let browser;
try {
 await Promise.race([new Promise((resolve,reject)=>{server.stdout.on('data',x=>{if(x.toString().includes('Interface:'))resolve();});server.on('exit',code=>reject(Error(`Server exited ${code}`)));}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Startup timeout')),5000);t.unref();})]);
 browser = await chromium.launch({headless:true,...(process.env.MAYUNA_TEST_BROWSER ? {executablePath:process.env.MAYUNA_TEST_BROWSER,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage','--use-angle=swiftshader']} : {})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const unlock=async()=>{
  await page.waitForFunction(()=>!document.querySelector('#accessForm').hidden || !document.querySelector('#continuityScreen').hidden);
  if(await page.locator('#accessForm').isVisible()){
   await page.fill('#accessUsername','didi-test');await page.fill('#accessPassword','OnlyTests-12345!');
   if(await page.locator('#accessConfirm').isVisible())await page.fill('#accessConfirm','OnlyTests-12345!');await page.click('#accessSubmit');
  }
  await page.locator('#enterWorld').waitFor({state:'visible'});await page.click('#enterWorld');await page.waitForFunction(()=>!document.body.classList.contains('is-locked'));
 };
 if(process.env.MAYUNA_SCREENSHOT_DIR){await page.goto(`http://127.0.0.1:${port}`);await page.locator('#accessForm').waitFor({state:'visible'});await page.screenshot({path:path.join(process.env.MAYUNA_SCREENSHOT_DIR,'entrada.png')});}
 const sizes=[[1440,900],[1366,768],[1024,640],[1920,1080],[390,844],[360,640],[844,390]];
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${port}`);await unlock();await page.waitForFunction(()=>document.querySelector('#connectionLabel').textContent==='Core ativo');
  const bounds=await page.evaluate(()=>{
   const selectors=innerWidth>920?['.bottom-hud','.skill-slots','.passive-list','#hotbar']:['#mobileHotbar','.mobile-passives','.mobile-dock'];
   return {doc:[document.body.scrollWidth,document.body.scrollHeight],chat:document.querySelector('#panel-chat').getBoundingClientRect().toJSON(),controls:selectors.map(selector=>({selector,rect:document.querySelector(selector).getBoundingClientRect().toJSON()}))};
  });
  assert.ok(bounds.doc[0]<=width && bounds.doc[1]<=height,`${width}×${height}: document overflow`);
  for(const {selector,rect} of bounds.controls) assert.ok(rect.x>=0&&rect.y>=0&&rect.right<=width+1&&rect.bottom<=height+1,`${width}×${height}: ${selector} outside viewport`);
  assert.ok(bounds.chat.x>=0&&bounds.chat.y>=0&&bounds.chat.right<=width+1&&bounds.chat.bottom<=height+1,`${width}×${height}: inline chat outside viewport`);
  assert.equal(await page.locator('#appShell').getAttribute('data-view-mode'),'refugio');
  if(width>920){
   const desktopWorld=page.locator('.desktop-nav [data-view-mode="world"]');await desktopWorld.click();
   assert.equal(await page.locator('#appShell').getAttribute('data-view-mode'),'world');assert.equal(await page.locator('#panel-chat').isVisible(),false);assert.ok(await page.locator('.bottom-hud').isVisible());
   await page.locator('.desktop-nav [data-view-mode="refugio"]').click();
   assert.equal(await page.locator('#panel-chat').isVisible(),true);assert.equal(await page.locator('.bottom-hud').isVisible(),false);
   assert.equal(await page.locator('#panel-chat').evaluate(el=>getComputedStyle(el).resize),'both');
  }else{
   await page.locator('.mobile-dock [data-view-mode="world"]').click();assert.equal(await page.locator('#mobileHotbar').isVisible(),true);assert.equal(await page.locator('#panel-chat').isVisible(),false);
   await page.locator('.mobile-dock [data-view-mode="refugio"]').click();assert.equal(await page.locator('#mobileHotbar').isVisible(),false);assert.equal(await page.locator('#panel-chat').isVisible(),true);
  }
  const open=width>920?'.companion-summary [data-open-panel="chat"]':'.mobile-dock [data-open-panel="chat"]';await page.locator(open).click();
  assert.equal(await page.locator('#overlay').isVisible(),false,`${width}×${height}: chat must stay inline, without modal overlay`);
  const chat=await page.locator('#panel-chat').boundingBox();assert.ok(chat.x>=0&&chat.y>=0&&chat.x+chat.width<=width+1&&chat.y+chat.height<=height+1,`${width}×${height}: inline chat must stay in viewport`);assert.equal(await page.locator('#panel-chat .chat-header').isVisible(),false,`${width}×${height}: chat should have no framed titlebar`);
  assert.equal(await page.locator('#chatInput').isFocused(),true);
  if(process.env.MAYUNA_SCREENSHOT_DIR && [1440,390].includes(width))await page.screenshot({path:path.join(process.env.MAYUNA_SCREENSHOT_DIR,`hud-${width}.png`)});
 }
 await page.setViewportSize({width:1440,height:900});
 const panel=page.locator('[data-panel="companion-summary"]');
 await panel.locator('[data-window-min]').click();assert.ok(await panel.evaluate(el=>el.classList.contains('is-minimized')));await panel.locator('[data-window-min]').click();
 const box=await panel.locator('.panel-titlebar').boundingBox();await page.mouse.move(box.x+60,box.y+25);await page.mouse.down();await page.mouse.move(530,260,{steps:10});await page.mouse.up();assert.ok(await panel.evaluate(el=>el.classList.contains('is-floating')));
 const moved=await panel.boundingBox();await page.reload();await unlock();assert.ok(Math.abs((await panel.boundingBox()).x-moved.x)<2);
 await panel.locator('[data-window-close]').click();assert.equal(await panel.isVisible(),false);
 await page.locator('.topbar [data-open-panel="settings"]').click();await page.locator('#panelControls button').first().click();assert.equal(await panel.isVisible(),true);
 await page.locator('#resetLayout').click();assert.equal(await panel.evaluate(el=>el.classList.contains('is-floating')),false);
 await page.selectOption('#interfaceStyle','obsidian');await page.locator('[data-theme="#4f6f52"]').click();await page.reload();await unlock();assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiStyle),'obsidian');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent')),'#4f6f52');
 const world=await page.locator('#worldFrame').boundingBox();await page.locator('#immersiveToggle').click();assert.ok((await page.locator('#worldFrame').boundingBox()).width>world.width);await page.locator('#immersiveToggle').click();
 await page.locator('.companion-summary [data-open-panel="chat"]').click();await page.fill('#chatInput','Olá Mayuna');await page.locator('.send-button').click();await page.waitForSelector('.chat-bubble.companion:not(.thinking)');assert.equal(await page.locator('#eventCount').textContent(),'2');
 await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await unlock();assert.equal(await page.locator('#worldCanvas').count(),1);
 await page.locator('.companion-summary [data-open-panel="chat"]').click();await page.fill('#chatInput','Estou bem, qual é o meu nome?');await page.locator('.send-button').click();await page.waitForFunction(()=>[...document.querySelectorAll('.chat-bubble.companion')].some(el=>el.textContent.includes('Didi')));
 await page.keyboard.press('Escape');await page.click('#logoutButton');await page.locator('#accessForm').waitFor({state:'visible'});assert.ok(await page.locator('#appShell').evaluate(el=>el.inert));assert.equal(await page.locator('.chat-bubble').count(),0);await unlock();
 assert.deepEqual(errors,[]);console.log('PASS: 7 viewport sizes, inline chat, reserved controls, window lifecycle, preferences, immersive view, recognition, logout, reduced motion; no JS errors.');
} finally {await browser?.close();server.kill();await once(server,'exit');await rm(data,{recursive:true,force:true});}
