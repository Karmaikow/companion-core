import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: repo,
  entryPoints: ['dist/server/web-server.js'],
  outfile: 'android/build/assets/core/server.cjs',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  define: { 'import.meta.url': '__companionEntryUrl' },
  banner: { js: "const __companionEntryUrl = require('node:url').pathToFileURL(__filename).href;" },
});
