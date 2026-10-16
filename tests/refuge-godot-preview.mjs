import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const data=await mkdtemp(path.join(os.tmpdir(),'mayuna-godot-preview-'));
const port=4196,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['dist/server/web-server.js'],{env:{...process.env,PORT:String(port),MAYUNA_DATA_DIR:data,MAYUNA_AI_PROVIDER:'mock'},stdio:['ignore','pipe','pipe']});
let browser;
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Core server timeout')),20000);server.stdout.on('data',chunk=>{if(String(chunk).includes('Interface:')){clearTimeout(timer);resolve();}});server.once('exit',()=>reject(Error('Core server stopped')));});
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const setup=await context.request.post(base+'/api/auth/setup',{data:{username:'godot-preview',password:'RefugePreview-12345!'}});assert.equal(setup.status(),200);
  const created=await context.request.post(base+'/api/companions',{data:{name:'Mayuna',ownerName:'Didi',preferredAddress:'Didi',archetype:'curious'}});assert.equal(created.status(),201);
  await page.goto(base+'/refuge-godot.html');
  await page.waitForFunction(()=>document.querySelector('#name').textContent==='Mayuna');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('pronta'));
  await page.waitForTimeout(500);

  const before=await page.locator('#mayunaHit').boundingBox();
  await page.mouse.click(430,640);
  await page.waitForTimeout(1000);
  const after=await page.locator('#mayunaHit').boundingBox();
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y)>5,'Mayuna walks to a clicked floor point');

  await page.locator('#mayunaHit').click();
  await page.waitForFunction(()=>document.querySelector('#bond').textContent==='1');
  assert.match(await page.locator('#status').textContent(),/carinho|carinho/i);

  await page.locator('#chatInput').fill('Minha cor favorita é verde-musgo.');
  await page.locator('#send').click();
  await page.waitForFunction(()=>document.querySelector('#messages').textContent.includes('Mayuna:'));
  await page.waitForFunction(()=>document.querySelector('#memories').textContent!=='0');
  const xpAfterChat=await page.locator('#coreXp').textContent();
  assert.notEqual(xpAfterChat,'0/100 XP','conversation keeps using the Core XP event');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#memories').textContent!=='0');
  assert.equal(await page.locator('#bond').textContent(),'1','affection persisted in Core state after reload');

  await page.setViewportSize({width:390,height:844});
  await page.reload();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile layout has no horizontal overflow');
  await page.locator('#mobileChat').click();
  assert.ok((await page.locator('#chatPanel').getAttribute('class')).includes('open'),'mobile chat can be opened');
  assert.deepEqual(errors,[]);
  console.log('PASS: 3D refuge page, Mayuna click-to-move, Core affection, persistent chat/memory/XP, and mobile chat.');
}finally{await browser?.close();server.kill();await rm(data,{recursive:true,force:true});}
