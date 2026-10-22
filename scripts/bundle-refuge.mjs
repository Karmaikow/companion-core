// Empacota a Edge Function `refuge`.
// Uso: npm run sync:rules && node scripts/bundle-refuge.mjs
//  -> dist-fn/refuge/index.js        (arquivo único, para publicar inteiro via MCP/API)
//  -> client/public/fn/refuge.<hash>.js + dist-fn/refuge-stub/ (publicação leve: o stub importa o módulo servido
//     pelo site em produção; o Supabase embute o módulo remoto no deploy, então ele fica congelado naquela versão)
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const base = {
  entryPoints: ['supabase/functions/refuge/index.ts'],
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  minifySyntax: true, minifyWhitespace: true, legalComments: 'none', charset: 'ascii',
};
await build({ ...base, external: ['npm:*', 'jsr:*'], outfile: 'dist-fn/refuge/index.js' });

// módulo remoto: sem `npm:` (o stub injeta o createClient do supabase-js)
const shim = {
  name: 'sb-shim',
  setup(b) {
    b.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: 'sb', namespace: 'sb-shim' }));
    b.onLoad({ filter: /.*/, namespace: 'sb-shim' }, () => ({ contents: 'export const createClient = (...a) => globalThis.__sbCreateClient(...a);', loader: 'js' }));
  },
};
const r = await build({ ...base, plugins: [shim], write: false, outfile: 'out.js' });
const code = r.outputFiles[0].text;
const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
mkdirSync('client/public/fn', { recursive: true });
for (const f of readdirSync('client/public/fn')) if (/^refuge\..*\.js$/.test(f)) rmSync('client/public/fn/' + f);
writeFileSync(`client/public/fn/refuge.${hash}.js`, code);
mkdirSync('dist-fn/refuge-stub', { recursive: true });
writeFileSync('dist-fn/refuge-stub/deps.js', `import { createClient } from 'npm:@supabase/supabase-js@2';\nglobalThis.__sbCreateClient = createClient;\n`);
writeFileSync('dist-fn/refuge-stub/index.js', `import './deps.js';\nimport 'https://companion-core-two.vercel.app/fn/refuge.${hash}.js';\n`);
console.log(`ok -> dist-fn/refuge/index.js · client/public/fn/refuge.${hash}.js · dist-fn/refuge-stub/`);
