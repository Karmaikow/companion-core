// Empacota a Edge Function `refuge` (sincronizando `shared/rules` automaticamente antes).
// Uso: npm run bundle:fn (ou node scripts/bundle-refuge.mjs)
//  -> dist-fn/refuge/index.js        (arquivo único, para publicar inteiro via MCP/API)
//  -> client/public/fn/refuge.<hash>.js + dist-fn/refuge-stub/ (publicação leve: o stub baixa o código servido pelo
//     site em produção ao iniciar, confere o SHA-256 fixado e o executa; o Supabase não aceita importar desse domínio)
import './sync-rules.mjs';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';

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
const r = await build({ ...base, format: 'iife', plugins: [shim], write: false, outfile: 'out.js' });
const code = r.outputFiles[0].text;
const sha = createHash('sha256').update(code).digest('hex'), hash = sha.slice(0, 12);
mkdirSync('client/public/fn', { recursive: true });
writeFileSync(`client/public/fn/refuge.${hash}.js`, code);
// guarda as 3 versões mais novas: a função publicada continua achando a dela até o stub novo ser publicado
const olds = readdirSync('client/public/fn').filter((f) => /^refuge\..*\.js$/.test(f)).map((f) => ({ f, t: statSync('client/public/fn/' + f).mtimeMs })).sort((a, b) => b.t - a.t);
for (const { f } of olds.slice(3)) rmSync('client/public/fn/' + f);
mkdirSync('dist-fn/refuge-stub', { recursive: true });
writeFileSync('dist-fn/refuge-stub/deps.js', `import { createClient } from 'npm:@supabase/supabase-js@2';\nglobalThis.__sbCreateClient = createClient;\n`);
writeFileSync('dist-fn/refuge-stub/index.js', `// Carrega o código da função servido pelo site (conferido pelo SHA-256) e o executa.
import './deps.js';
const URL_ = 'https://companion-core-two.vercel.app/fn/refuge.${hash}.js';
const SHA = '${sha}';
const code = await (await fetch(URL_)).text();
const got = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)))).map((b) => b.toString(16).padStart(2, '0')).join('');
if (got !== SHA) throw new Error('refuge: código remoto não confere (' + got.slice(0, 12) + ')');
new Function(code)();
`);
console.log(`ok -> dist-fn/refuge/index.js · client/public/fn/refuge.${hash}.js · dist-fn/refuge-stub/`);
