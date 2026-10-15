import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'refuge-browser-')),port=4187;
const child=spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,PORT:String(port),MAYUNA_AI_PROVIDER:'mock',MAYUNA_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('server timeout')),25000);child.stdout.on('data',d=>{if(d.toString().includes('Interface:')){clearTimeout(timeout);resolve();}});child.on('exit',()=>reject(Error('server exit')));});
 browser=await chromium.launch({headless:true,...(process.env.MAYUNA_TEST_BROWSER?{executablePath:process.env.MAYUNA_TEST_BROWSER}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 // Mock AI intentionally has no desktop conversation settings endpoint.
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!['/api/companion/art/sprite','/api/conversation/settings'].some(p=>m.location().url.endsWith(p)))errors.push(m.text()+' '+m.location().url);});
 await page.goto(`http://127.0.0.1:${port}/refuge-lab.html`);await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.refugeReady==='true');
 await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d');
 const before=await page.locator('.entity-target').boundingBox();await page.mouse.click(900,680);await page.waitForTimeout(1200);const after=await page.locator('.entity-target').boundingBox();assert.ok(Math.hypot(before.x-after.x,before.y-after.y)>5,'click should move sprite');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/refuge-desktop.png'});
 await page.goto(`http://127.0.0.1:${port}/sprite-studio.html?id=MC-MAYUNA-REFUGE-LAB&generation=1`);await page.waitForFunction(()=>document.querySelector('#timeline').children.length===8);
 await page.check('#appendMode');await page.setInputFiles('#sourceFile','web/assets/refuge/mayuna-walk.png');await page.waitForFunction(()=>document.querySelector('#timeline').children.length===16);assert.equal(await page.locator('#frames').inputValue(),'8,9,10,11,12,13,14,15');await page.click('#saveClip');
 await page.click('#apply');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('aplicado'));await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('carregado'));assert.equal(await page.locator('#timeline button').count(),16);
 const download=page.waitForEvent('download');await page.click('#exportJson');assert.equal((await download).suggestedFilename(),'atlas.json');await page.screenshot({path:'test-results/sprite-studio.png'});
 await page.setViewportSize({width:390,height:844});await page.goto(`http://127.0.0.1:${port}/refuge-lab.html`);await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d');await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.refugeReady==='true');await page.screenshot({path:'test-results/refuge-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS: GLB loading, desktop movement, sprite save/reload/export, mobile layout; no browser errors.');
 const base=`http://127.0.0.1:${port}`;
 assert.equal((await page.request.post(base+'/api/auth/setup',{data:{username:'tester',password:'OnlyTests-12345!'}})).status(),200);
 const created=await page.request.post(base+'/api/companions',{data:{name:'Mayuna',ownerName:'Didi',preferredAddress:'Didi',archetype:'curious'}});assert.equal(created.status(),201);
 const state=await created.json();await page.setViewportSize({width:1440,height:950});await page.goto(base);await page.locator('#enterWorld').waitFor({state:'visible'});await page.click('#enterWorld');await page.waitForFunction(()=>!document.body.classList.contains('is-locked'));
 await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.refugeReady==='true');
 const soul=await page.locator('.entity-target').boundingBox();await page.mouse.click(920,620);await page.waitForTimeout(250);const still=await page.locator('.entity-target').boundingBox();assert.equal(still.x,soul.x,'soul must remain stationary');
 await page.locator('[data-open-panel="companion"]:visible').first().click();await page.click('#evolutionPreview');await page.waitForFunction(()=>document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d');
 await page.screenshot({path:'test-results/refuge-main-core.png'});
 const studioHref=await page.locator('#spriteStudioLink').getAttribute('href');assert.ok(studioHref.includes(encodeURIComponent(state.identity.id)));
 const context=await(await page.request.get(base+'/api/companion/art')).json();
 const denied=await page.request.post(base+'/api/companion/art/sprite',{data:{id:context.id,generation:context.generation,prompt:'Create a transparent sprite walking cycle.',reference:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',paidConsent:false}});assert.notEqual(denied.status(),200);
 assert.deepEqual(errors,[]);console.log('PASS: main Core integration, stationary soul, bird preview, scoped studio link, paid generation consent gate.');
}finally{await browser?.close();child.kill();await new Promise(r=>child.once('exit',r));await rm(root,{recursive:true,force:true});}
