#!/usr/bin/env node
/**
 * Limpa o Storage do Supabase depois da migração dos modelos para a Vercel.
 *
 *   npm run storage:cleanup                    # SÓ MOSTRA o que seria apagado (padrão, não apaga nada)
 *   npm run storage:cleanup -- --apply         # apaga: (1) modelos já migrados e (2) APKs antigos
 *   npm run storage:cleanup -- --apply --unused  # também apaga os arquivos do world-assets que nenhum catálogo usa
 *
 * Exige SUPABASE_SERVICE_ROLE_KEY. Regras de segurança:
 *  - nunca mexe no bucket `companion-studio`;
 *  - um arquivo de world-assets só é "migrado" se existir a cópia em client/public/assets/world/<mesmo caminho>
 *    E nenhum catálogo do banco ainda apontar para ele;
 *  - "sem uso" = não está no site nem em nenhum catálogo (só apaga com --unused; não há backup desses arquivos);
 *  - em companion-downloads, mantém só a pasta android/vX.Y.Z de maior versão e apaga as outras.
 */
import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(ROOT, 'client', 'public', 'assets', 'world');
const BASE = (process.env.SUPABASE_URL ?? 'https://rqdukyenuecrshzmofdo.supabase.co').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');
const UNUSED = process.argv.includes('--unused');
if (!KEY) { console.error('Faltou SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API).'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

/** Lista todos os objetos de um bucket (recursivo). */
async function listAll(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${BASE}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) });
    if (!r.ok) throw new Error(`listar ${bucket}/${prefix}: HTTP ${r.status} ${await r.text()}`);
    const page = await r.json();
    for (const it of page) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) out.push(...await listAll(bucket, path)); // pasta
      else out.push({ path, size: Number(it.metadata?.size ?? 0) });
    }
    if (page.length < 1000) break;
  }
  return out;
}

// 1) o que os catálogos do banco ainda referenciam do world-assets
const TABLES = [['biomes', 'assets,settings,palette'], ['city_layouts', 'data'], ['creatures', 'data'], ['items', 'data'], ['skills', 'data'], ['missions', 'data'], ['game_config', 'values']];
let catalogText = '';
for (const [t, cols] of TABLES) {
  const r = await fetch(`${BASE}/rest/v1/${t}?select=${cols}`, { headers: H });
  if (!r.ok) { console.error(`Falha ao ler ${t}: HTTP ${r.status}`); process.exit(1); }
  catalogText += JSON.stringify(await r.json());
}
const stillReferenced = (p) => catalogText.includes(`world-assets/${p}`) || catalogText.includes(`world-assets/${encodeURI(p)}`);

// 2) world-assets
const plan = { migrated: [], unused: [], kept: [], apk: [] };
for (const f of await listAll('world-assets')) {
  const onSite = await stat(join(LOCAL, f.path)).then((s) => s.isFile(), () => false);
  if (stillReferenced(f.path)) plan.kept.push(f);
  else if (onSite) plan.migrated.push({ bucket: 'world-assets', ...f });
  else plan.unused.push({ bucket: 'world-assets', ...f });
}

// 3) APKs: mantém só a maior versão
const apks = await listAll('companion-downloads');
const ver = (p) => (p.match(/android\/v(\d+)\.(\d+)\.(\d+)\//) ?? []).slice(1).map(Number);
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0); return 0; };
const versions = apks.map((f) => ver(f.path)).filter((v) => v.length === 3).sort(cmp);
const newest = versions.at(-1);
for (const f of apks) {
  const v = ver(f.path);
  if (v.length === 3 && newest && cmp(v, newest) < 0) plan.apk.push({ bucket: 'companion-downloads', ...f });
}

const sum = (l) => l.reduce((n, f) => n + f.size, 0);
console.log(`world-assets — já migrados (cópia no site, sem referência no banco): ${plan.migrated.length} arquivo(s), ${mb(sum(plan.migrated))}`);
console.log(`world-assets — sem uso (nem no site nem em catálogo):               ${plan.unused.length} arquivo(s), ${mb(sum(plan.unused))}${UNUSED ? '' : '  [só com --unused]'}`);
console.log(`world-assets — ainda referenciados no banco (mantidos):             ${plan.kept.length} arquivo(s), ${mb(sum(plan.kept))}`);
console.log(`companion-downloads — APKs antigos (mantém v${newest?.join('.') ?? '?'}):  ${plan.apk.length} arquivo(s), ${mb(sum(plan.apk))}`);
for (const f of [...plan.migrated, ...(UNUSED ? plan.unused : []), ...plan.apk]) console.log(`   - ${f.bucket}/${f.path} (${mb(f.size)})`);
if (!newest) console.log('Nenhuma versão android/vX.Y.Z encontrada: APKs não serão tocados.');

if (!APPLY) { console.log('\nNada foi apagado. Para apagar de verdade, rode de novo com --apply.'); process.exit(0); }

const victims = [...plan.migrated, ...(UNUSED ? plan.unused : []), ...plan.apk];
let freed = 0, failed = 0;
for (const bucket of ['world-assets', 'companion-downloads']) {
  const list = victims.filter((v) => v.bucket === bucket);
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const r = await fetch(`${BASE}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: chunk.map((c) => c.path) }) });
    if (r.ok) freed += sum(chunk); else { failed += chunk.length; console.error(`Falha ao apagar lote de ${bucket}: HTTP ${r.status} ${await r.text()}`); }
  }
}
console.log(`\nApagados: ${mb(freed)} liberados · falhas: ${failed}`);
if (failed) process.exit(2);
