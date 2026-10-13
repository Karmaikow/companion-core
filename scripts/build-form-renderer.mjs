// Ships the pinned renderer locally: APK and browsers never depend on an external CDN.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
await mkdir(new URL('../web/modules/', import.meta.url), { recursive: true });
await build({ entryPoints:[fileURLToPath(new URL('../dist/core/manifestation.js',import.meta.url))], outfile:fileURLToPath(new URL('../web/modules/manifestation-rules.js',import.meta.url)), bundle:true, format:'esm', platform:'browser', target:'es2022' });
await build({ entryPoints: [fileURLToPath(new URL('../web/scene/companion-body.js', import.meta.url))], outfile: fileURLToPath(new URL('../web/modules/companion-body.js', import.meta.url)), bundle: true, external: ['../modules/http.js'], format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' });
