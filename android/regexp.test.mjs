import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { mobileRegexps } from '../scripts/android-regexp-compat.mjs';

test('mobile build preserves Unicode names without requiring property escapes', () => {
  const source = String.raw`/^[\p{L}][\p{L} '\-]{1,39}$/u`;
  const expanded = mobileRegexps(source);
  assert.doesNotMatch(expanded, /\\[pP]\{/);
  const original = vm.runInNewContext(source), mobile = vm.runInNewContext(expanded);
  for (const name of ['Didi', 'Lunaya', 'João', 'Érica', '李明', 'Мария', '𐐀𐐁', "D'Ávila", 'Ana-Maria', '7Teste', '😀😀', '<script>', '', 'A', 'A'.repeat(41)]) {
    assert.equal(mobile.test(name), original.test(name), name);
  }
  assert.equal(mobileRegexps('const text="\\\\p{L}";'), 'const text="\\\\p{L}";');
});
test('packaged server contains no unsupported Unicode property escapes', async () => {
  const code = await readFile(new URL('./build/assets/core/server.cjs', import.meta.url), 'utf8');
  assert.equal(mobileRegexps(code), code);
  assert.doesNotThrow(() => new vm.Script(code));
});
