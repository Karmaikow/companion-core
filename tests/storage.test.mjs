import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'companion-store-'));
const { writeFileAtomic } = await import('../dist/storage/store.js');
after(() => rm(root, { recursive: true, force: true }));

test('atomic writes remain complete under concurrent replacements and leave no temporary files', async () => {
  const target = path.join(root, 'companion.json');
  const payloads = Array.from({ length: 30 }, (_, index) => ({ index, body: String(index).repeat(20_000) }));
  await Promise.all(payloads.map(value => writeFileAtomic(target, JSON.stringify(value))));
  const stored = JSON.parse(await readFile(target, 'utf8'));
  assert.ok(payloads.some(value => value.index === stored.index && value.body === stored.body));
  assert.deepEqual(await readdir(root), ['companion.json']);
});

test('atomic files use owner-only permissions where supported', async () => {
  if (process.platform === 'win32') return;
  const target = path.join(root, 'private.json');
  await writeFileAtomic(target, '{"ok":true}');
  assert.equal((await stat(target)).mode & 0o777, 0o600);
});
