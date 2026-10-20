// Empacota a Edge Function `refuge` num único arquivo para publicar via MCP/API.
// Uso: npm run sync:rules && node scripts/bundle-refuge.mjs  ->  dist-fn/refuge/index.js
import { build } from 'esbuild';
await build({
  entryPoints: ['supabase/functions/refuge/index.ts'],
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  external: ['npm:*', 'jsr:*'], minifySyntax: true, minifyWhitespace: true, legalComments: 'none', charset: 'ascii',
  outfile: 'dist-fn/refuge/index.js',
});
console.log('ok -> dist-fn/refuge/index.js');
