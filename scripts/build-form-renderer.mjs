// Ships the pinned renderer locally: APK and browsers never depend on an external CDN.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../web/modules/', import.meta.url), { recursive: true });
await build({ entryPoints:[fileURLToPath(new URL('../dist/studio/asset-direction.js',import.meta.url))], outfile:fileURLToPath(new URL('../web/modules/asset-direction.js',import.meta.url)), bundle:true, format:'esm',platform:'browser',target:'es2022' });
await build({ entryPoints:[fileURLToPath(new URL('../dist/core/manifestation.js',import.meta.url))], outfile:fileURLToPath(new URL('../web/modules/manifestation-rules.js',import.meta.url)), bundle:true, format:'esm', platform:'browser', target:'es2022' });
await build({ entryPoints: [fileURLToPath(new URL('../web/scene/companion-body.js', import.meta.url))], outfile: fileURLToPath(new URL('../web/modules/companion-body.js', import.meta.url)), bundle: true, external: ['../modules/http.js'], format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' });
await build({ entryPoints:[fileURLToPath(new URL('../web/scene/refuge-3d.js',import.meta.url))], outfile:fileURLToPath(new URL('../web/modules/refuge-3d.js',import.meta.url)), bundle:true, external:['../modules/http.js','../modules/manifestation-rules.js','../modules/refuge-navigation.js','../modules/sprite-atlas.js','../modules/sprite-store.js'], format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof' });
await build({ entryPoints:[fileURLToPath(new URL('../web/modules/refuge-godot-preview.js',import.meta.url))], outfile:fileURLToPath(new URL('../web/modules/refuge-godot-preview.bundle.js',import.meta.url)), bundle:true, external:['./api.js'], format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof' });
await copyFile(new URL('../node_modules/three/LICENSE',import.meta.url),new URL('../web/modules/THREE-LICENSE.txt',import.meta.url));

await build({entryPoints:[fileURLToPath(new URL('../web/scene/world-stage.js',import.meta.url))],outfile:fileURLToPath(new URL('../web/modules/world-stage.bundle.js',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',external:['../modules/world-rules.js','../modules/refuge-navigation.js','../modules/sprite-atlas.js','../modules/art-image.js']});
