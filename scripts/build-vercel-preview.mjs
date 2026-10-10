import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const webRoot = new URL('../web/', import.meta.url);
const outputRoot = new URL('../vercel-output/', import.meta.url);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(webRoot, outputRoot, { recursive: true });

await cp(
  new URL('../dist/core/color-names.js', import.meta.url),
  new URL('../vercel-output/modules/color-names.js', import.meta.url)
);
await writeFile(
  new URL('../vercel-output/modules/runtime-mode.js', import.meta.url),
  "// Generated for the public Vercel preview. No local Core or AI provider is contacted.\\nexport const mode = 'demo';\\n",
  'utf8'
);

const expectedEntry = fileURLToPath(new URL('../vercel-output/index.html', import.meta.url));
console.log(`Static demo preview prepared at ${expectedEntry}`);
