// Ships the pinned renderer locally: APK and browsers never depend on an external CDN.
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../web/modules/', import.meta.url), { recursive: true });
await build({ entryPoints:[new URL('../dist/core/manifestation.js',import.meta.url).pathname], outfile:new URL('../web/modules/manifestation-rules.js',import.meta.url).pathname, bundle:true, format:'esm', platform:'browser', target:'es2022' });
await copyFile(new URL('../node_modules/three/LICENSE', import.meta.url), new URL('../web/modules/THREE-LICENSE.txt', import.meta.url));
await build({ entryPoints: [new URL('../web/scene/companion-body.js', import.meta.url).pathname], outfile: new URL('../web/modules/companion-body.js', import.meta.url).pathname, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' });
