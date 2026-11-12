#!/usr/bin/env node
/**
 * Traz os modelos/imagens do bucket público `world-assets` do Supabase para o próprio site (Vercel).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run assets:migrate            # baixa de verdade
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run assets:migrate -- --dry-run  # só lista o que seria baixado
 *
 * O que faz:
 *  1. Lê os catálogos (biomas, cidade, criaturas, itens, habilidades, missões, config) e coleta todas as URLs
 *     `.../storage/v1/object/public/world-assets/...` que o jogo realmente usa (rascunhos inclusive).
 *  2. Baixa cada arquivo único para client/public/assets/world/<mesmo caminho> (pula o que já existe com o mesmo tamanho).
 *  3. Gera scripts/out/rewrite-urls.sql, que troca as URLs do banco por /assets/world/... — rode SÓ DEPOIS de
 *     commitar, fazer o deploy na Vercel e conferir que os arquivos abrem no site.
 *
 * Não apaga nada no Supabase. A chave service_role só é usada para ler as tabelas; nunca é gravada em arquivo.
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'client', 'public', 'assets', 'world');
const OUT = join(ROOT, 'scripts', 'out');
const BASE = (process.env.SUPABASE_URL ?? 'https://rqdukyenuecrshzmofdo.supabase.co').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');

if (!KEY) { console.error('Faltou SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API). Ela só é lida aqui, não é salva.'); process.exit(1); }

/** tabela → coluna jsonb onde podem aparecer URLs de assets */
const SOURCES = [
  ['biomes', 'assets'], ['biomes', 'settings'], ['biomes', 'palette'],
  ['city_layouts', 'data'], ['creatures', 'data'], ['items', 'data'], ['skills', 'data'], ['missions', 'data'], ['game_config', 'values'],
];
const URL_RE = /https?:\/\/[^/"\\\s]+\/storage\/v1\/object\/public\/world-assets\/([^"\\\s]+)/g;

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const urls = new Map(); // caminho no bucket → URL completa
const perTable = new Map();

for (const [table, col] of SOURCES) {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=${col}`, { headers });
  if (!r.ok) { console.error(`Falha ao ler ${table}.${col}: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
  const text = JSON.stringify(await r.json());
  let n = 0;
  for (const m of text.matchAll(URL_RE)) { urls.set(decodeURIComponent(m[1]), m[0]); n++; }
  if (n) perTable.set(`${table}.${col}`, n);
}

console.log(`Arquivos únicos em uso: ${urls.size}`);
for (const [k, n] of perTable) console.log(`  ${k}: ${n} referência(s)`);
if (DRY) { for (const p of urls.keys()) console.log('  ' + p); process.exit(0); }

let done = 0, skipped = 0, bytes = 0; const failed = [];
const queue = [...urls.entries()];
async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const [path, url] = job;
    const file = join(DEST, path);
    if (!file.startsWith(DEST)) { failed.push([path, 'caminho inválido']); continue; }
    try {
      const head = await stat(file).catch(() => null);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (head && head.size === buf.length) { skipped++; continue; }
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, buf);
      bytes += buf.length; done++;
      console.log(`  ✓ ${path} (${(buf.length / 1048576).toFixed(1)} MB)`);
    } catch (e) { failed.push([path, String(e.message ?? e)]); console.log(`  ✗ ${path}: ${e.message ?? e}`); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

await mkdir(OUT, { recursive: true });
const prefixes = [...new Set([...urls.values()].map((u) => u.slice(0, u.indexOf('/world-assets/') + '/world-assets/'.length)))];
const sql = ['-- Rode DEPOIS do deploy com os arquivos no site. Troca as URLs do Supabase por caminhos do próprio site.'];
for (const [table, col] of SOURCES) for (const p of prefixes) {
  sql.push(`update public.${table} set ${col} = replace(${col}::text, '${p}', '/assets/world/')::jsonb where ${col}::text like '%${p}%';`);
}
await writeFile(join(OUT, 'rewrite-urls.sql'), sql.join('\n') + '\n');
await writeFile(join(OUT, 'world-assets-manifest.json'), JSON.stringify({ files: [...urls.keys()], failed }, null, 2));

console.log(`\nBaixados: ${done} (${(bytes / 1048576).toFixed(1)} MB) · já existiam: ${skipped} · falhas: ${failed.length}`);
console.log('SQL de troca de URLs: scripts/out/rewrite-urls.sql (ainda NÃO aplicado).');
if (failed.length) process.exit(2);
