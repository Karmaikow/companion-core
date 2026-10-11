import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mobileRegexps } from './android-regexp-compat.mjs';
const repo = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: repo,
  entryPoints: ['dist/server/web-server.js'],
  outfile: 'android/build/assets/core/server.cjs',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  write: false,
  define: { 'import.meta.url': '__companionEntryUrl' },
  banner: { js: "const __companionEntryUrl = require('node:url').pathToFileURL(__filename).href;" },
});
for (const output of result.outputFiles) {
  await mkdir(path.dirname(output.path), { recursive: true });
  await writeFile(output.path, mobileRegexps(output.text));
}
