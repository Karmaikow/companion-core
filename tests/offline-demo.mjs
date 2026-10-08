// Optional browser test: same Playwright environment as ui-smoke.mjs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const types={js:'text/javascript',css:'text/css',html:'text/html',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=pathname==='/'?'/index.html':pathname;if(file.includes('..')||file.startsWith('/api/'))throw Error();res.setHeader('Content-Type',types[file.split('.').pop()]||'text/plain');res.end(file==='/modules/runtime-mode.js'?"export const mode='demo';":await readFile(new URL('../web'+file,import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.MAYUNA_TEST_BROWSER?{executablePath:process.env.MAYUNA_TEST_BROWSER,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage','--use-angle=swiftshader']}:{})});
 const context=await browser.newContext();const page=await context.newPage();const errors=[],apiRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))apiRequests.push(r.url());});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.click('#enterWorld');await page.waitForFunction(()=>!document.body.classList.contains('is-locked'));assert.equal(await page.locator('#connectionLabel').textContent(),'Prévia · sem Core');
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 await context.setOffline(true);await page.reload();await page.click('#enterWorld');await page.waitForFunction(()=>!document.body.classList.contains('is-locked'));
 await page.locator('.companion-summary [data-open-panel="chat"]').click();await page.fill('#chatInput','qual é meu nome?');await page.click('.send-button');await page.waitForFunction(()=>document.querySelector('.chat-bubble.companion')?.textContent.includes('prévia'));
 assert.equal(await page.locator('#eventCount').textContent(),'0');assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);
 const cached=await page.evaluate(async()=>{const items=[];for(const k of await caches.keys())for(const r of await (await caches.open(k)).keys())items.push(new URL(r.url).pathname);return items;});assert.ok(cached.length>10);assert.ok(cached.every(p=>!p.startsWith('/api/')));
 console.log('PASS: synthetic demo, offline reload, chat fixture, no API network calls or cached Core data.');
}finally{await browser?.close();server.close();}
