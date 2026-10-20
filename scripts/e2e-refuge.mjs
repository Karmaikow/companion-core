// Teste de ponta a ponta da função `refuge` contra o Supabase real.
// Uso: node scripts/e2e-refuge.mjs "oi" "seu nome vai ser Lumi" ...
// Cria um usuário convidado (anônimo) descartável e imprime cada turno.
const URL = process.env.SUPABASE_URL ?? 'https://rqdukyenuecrshzmofdo.supabase.co';
const KEY = process.env.SUPABASE_KEY ?? 'sb_publishable_fIg0d4DQ3aUpLL6541ZSaA_iYyRY7BW';

async function post(path, body, token) {
  const r = await fetch(URL + path, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

const signup = await post('/auth/v1/signup', { data: { e2e: true } });
console.log('anon signup', signup.status, signup.data?.user?.id ?? signup.data);
const token = signup.data?.access_token;
if (!token) process.exit(1);

const call = (action, extra = {}) => post('/functions/v1/refuge', { action, ...extra }, token);

const setup = process.env.SETUP ? JSON.parse(process.env.SETUP) : null;
const created = await call('create', setup ? { setup } : {});
console.log('create', created.status, created.data?.error ?? JSON.stringify(created.data?.companion?.discoveries), 'provider=', created.data?.provider);

for (const msg of process.argv.slice(2)) {
  const t0 = Date.now();
  const r = await call('chat', { message: msg });
  const turn = r.data?.turn;
  console.log(`\n> ${msg}\n< [${r.status} ${turn?.source ?? '-'} ${Date.now() - t0}ms${turn?.diag ? ' ' + turn.diag : ''}] ${turn?.reply ?? r.data?.error}`);
  if (turn?.completed?.length) console.log('  descobertas:', turn.completed.join(', '), JSON.stringify(r.data.companion.discoveries));
  if (turn?.rejected?.length) console.log('  rejeitadas:', JSON.stringify(turn.rejected));
  if (turn?.secrets?.length) console.log('  SEGREDOS:', turn.secrets.join(', '));
  if (turn?.recipes?.length) console.log('  RECEITAS:', turn.recipes.join(', '));
  if (turn) console.log('  xp:', turn.xp.total, turn.xp.reason, turn.xp.boosted ? '(impulso)' : '', 'memórias novas:', turn.newMemories);
}
if (process.env.MUSE) {
  await new Promise((r) => setTimeout(r, 47_000));
  const m = await call('muse');
  console.log('\n[muse]', m.status, m.data?.turn?.reply ?? '(não puxou assunto)');
}
const fin = await call('state');
console.log('\nMEMÓRIAS:'); for (const m of fin.data?.memories ?? []) console.log(' -', m.subject.padEnd(9), m.content);
console.log('RECEITAS:', JSON.stringify((fin.data?.recipes ?? []).map((r) => ({ n: r.name, i: r.ingredients }))));
console.log('SEGREDOS:', (fin.data?.secrets ?? []).map((x) => x.key).join(', '), '| impulso:', fin.data?.boost);
console.log('\nuser', signup.data.user.id);
