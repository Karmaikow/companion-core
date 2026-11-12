/**
 * Catálogos públicos do jogo (criaturas, itens, habilidades, biomas, cidade, config) servidos com cache na borda da Vercel.
 *
 * Antes, cada jogador abrindo o jogo fazia essas leituras direto no Supabase. Agora a primeira leitura a cada ~5 min
 * vai ao Supabase e todos os demais recebem a cópia em cache (stale-while-revalidate). As edições do ADM aparecem
 * em até ~5 min, sem novo deploy. Usa só a chave publicável: a RLS vale exatamente como valia para o navegador.
 *
 * GET /api/catalog?t=creatures|items|skills|biomes|city|config
 */

const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://rqdukyenuecrshzmofdo.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_fIg0d4DQ3aUpLL6541ZSaA_iYyRY7BW';

/** Só estas leituras são possíveis (lista fechada: a rota não é um proxy genérico do banco). */
const QUERIES: Record<string, string> = {
  creatures: 'creatures?select=slug,name,data&status=eq.published',
  items: 'items?select=slug,name,data&status=eq.published',
  skills: 'skills?select=slug,name,data&status=eq.published',
  biomes: 'biomes?select=slug,name,description,palette,settings,assets,status&status=eq.published',
  city: 'city_layouts?select=data&slug=eq.aster&status=eq.published',
  config: 'game_config?select=values&id=eq.1',
};

interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(name: string, value: string): void; json(body: unknown): void; end(): void }

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).end(); return; }
  const raw = req.query?.t;
  const name = Array.isArray(raw) ? raw[0] : raw;
  const q = name ? QUERIES[name] : undefined;
  if (!q) { res.status(400).json({ error: 'catálogo desconhecido' }); return; }
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' } });
    if (!r.ok) { res.setHeader('Cache-Control', 'no-store'); res.status(502).json({ error: 'falha ao ler o catálogo' }); return; }
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).json(data);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'falha ao ler o catálogo' });
  }
}
