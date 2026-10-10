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

const supabaseUrl = process.env.SUPABASE_URL || '';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const hasSupabaseConfig = Boolean(supabaseUrl && publishableKey);
const runtimeModule = [
  '// Generated at build time. The publishable key is public; never place a secret key here.',
  `export const mode = '${hasSupabaseConfig ? 'cloud' : 'demo'}';`,
  `export const cloudConfig = ${JSON.stringify(hasSupabaseConfig ? { url: supabaseUrl.replace(/\/$/, ''), publishableKey } : null)};`,
  ''
].join('\n');

await writeFile(
  new URL('../vercel-output/modules/runtime-mode.js', import.meta.url),
  runtimeModule,
  'utf8'
);

const expectedEntry = fileURLToPath(new URL('../vercel-output/index.html', import.meta.url));
console.log(`Static preview prepared in ${hasSupabaseConfig ? 'Supabase account mode' : 'demo mode'} at ${expectedEntry}`);
