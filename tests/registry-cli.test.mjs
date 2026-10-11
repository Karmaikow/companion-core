import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const run = (script, args, env) => exec(process.execPath, [script, ...args], { env: { ...process.env, ...env } });

test('crystal diagnostic reports authority without exposing session secrets or changing data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'crystal-diagnostic-'));
  try {
    await mkdir(path.join(root, '.crystal'));
    const file = path.join(root, '.crystal/session.json');
    const original = JSON.stringify({ version: 2, sessions: { test: {
      id: 'MC-TEST', phase: 'active', authority: 'http://127.0.0.1:4174',
      device: { name: 'Test device' }, sessionSecret: 'PRIVATE-SECRET', recoveryCode: 'PRIVATE-CODE'
    } } });
    await writeFile(file, original);
    await writeFile(path.join(root, 'active-companion.json'), JSON.stringify({ id: 'MC-TEST' }));
    const { stdout } = await run('scripts/check-crystal-setup.mjs', [], {
      MAYUNA_DATA_DIR: root, COMPANION_REGISTRY_URL: 'https://example.test/functions/v1/companion-registry'
    });
    const result = JSON.parse(stdout);
    assert.equal(result.activeCompanionId, 'MC-TEST');
    assert.equal(result.sessions[0].needsRegistryMigration, true);
    assert.doesNotMatch(stdout, /PRIVATE-/);
    assert.equal(await readFile(file, 'utf8'), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('registry import defaults to a dry run and requires stopped origins before writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'registry-import-'));
  try {
    const config = path.join(root, 'migration.json');
    await writeFile(path.join(root, 'registry.json'), '{}');
    await writeFile(config, JSON.stringify({
      targetAuthority: 'https://unreachable.invalid/functions/v1/companion-registry',
      sources: [{ authority: 'http://127.0.0.1:4174', file: 'registry.json' }]
    }));
    const env = { COMPANION_REGISTRY_DATABASE_URL: '', COMPANION_REGISTRY_ADMIN_KEY: '' };
    const { stdout } = await run('scripts/import-online-registry.mjs', [config], env);
    assert.match(stdout, /Simulação/);
    await assert.rejects(run('scripts/import-online-registry.mjs', [config, '--write'], env),
      error => /Pare os registros de origem/.test(error.stderr));
    assert.equal(await readFile(path.join(root, 'registry.json'), 'utf8'), '{}');
  } finally { await rm(root, { recursive: true, force: true }); }
});
