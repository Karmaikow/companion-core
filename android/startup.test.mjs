import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const token = 'isolated-android-bootstrap-test-capability';
const credentials = { username: 'bootstrap-test', password: 'BootstrapTest-Only123!' };
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'companion-bootstrap-'));
  const core = path.join(root, 'core');
  await mkdir(core);
  await copyFile(path.join(repo, 'android/bootstrap.cjs'), path.join(core, 'bootstrap.cjs'));
  await copyFile(path.join(repo, 'android/build/assets/core/server.cjs'), path.join(core, 'server.cjs'));
  await cp(path.join(repo, 'web'), path.join(core, 'web'), { recursive: true });
  return { root, core };
}
function launch(core) {
  const child = spawn(process.execPath, [path.join(core, 'bootstrap.cjs')], {
    cwd: tmpdir(), env: { ...process.env, COMPANION_APP_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.closed = once(child, 'close');
  child.ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('startup timeout')), 10000);
    child.stdout.on('data', data => { if (data.toString().includes('Interface:')) { clearTimeout(timer); resolve(); } });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); reject(Error(`startup exit ${code}`)); });
  });
  child.ready.catch(() => {});
  return child;
}
async function stop(child) { if (child.exitCode === null && child.signalCode === null) child.kill(); await child.closed; }
async function request(route, body, cookie = '') {
  return fetch('http://127.0.0.1:4187' + route, {
    method: body ? 'POST' : 'GET', headers: { 'X-Companion-App': token, Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test('packaged CJS entry creates account and Companion, then restores both after restart', async () => {
  const { root, core } = await fixture(); let child;
  try {
    child = launch(core); await child.ready;
    assert.equal((await fetch('http://127.0.0.1:4187/api/health')).status, 403);
    assert.equal((await request('/api/health')).status, 200);
    const setup = await request('/api/auth/setup', credentials);
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie').split(';')[0];
    const created = await request('/api/companions', { name: 'Bootstrap', ownerName: 'Tester', preferredAddress: 'Tester', soulColor: '#64834b', traits: ['openness-0'] }, cookie);
    assert.equal(created.status, 201);
    const state = await created.json();
    await stop(child);
    child = launch(core); await child.ready;
    const login = await request('/api/auth/login', credentials);
    assert.equal(login.status, 200);
    const hub = await (await request('/api/companions', undefined, login.headers.get('set-cookie').split(';')[0])).json();
    assert.equal(hub.activeId, state.identity.id);
    assert.match(await readFile(path.join(root, 'core-startup.log'), 'utf8'), /JavaScript iniciado/);
  } finally { if (child) await stop(child); await rm(root, { recursive: true, force: true }); }
});
test('bootstrap records async startup failures without disclosing the error message', async () => {
  const { root, core } = await fixture(); let child;
  try {
    await writeFile(path.join(core, 'server.cjs'), "Promise.reject(new Error('secret-must-not-appear'));");
    child = launch(core);
    const [code] = await child.closed;
    assert.equal(code, 1);
    const log = await readFile(path.join(root, 'core-startup.log'), 'utf8');
    assert.match(log, /Falha: Error/);
    assert.doesNotMatch(log, /secret-must-not-appear/);
    assert.match(await readFile(path.join(root, 'core-startup-stage.txt'), 'utf8'), /Falha:/);
  } finally { if (child) await stop(child); await rm(root, { recursive: true, force: true }); }
});
