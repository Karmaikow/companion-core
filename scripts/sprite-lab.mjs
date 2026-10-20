import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1060, height: 840 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5199/sprite-lab.html'); await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/claude-0/shots/lab.png' }); console.log(errs); await b.close();
