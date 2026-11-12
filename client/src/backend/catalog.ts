/**
 * Leitura dos catálogos públicos do jogo (o que o ADM publica) pela rota /api/catalog, que a Vercel guarda em cache.
 * Se a rota não existir (ex.: `vite` local) ou falhar, cai na leitura direta no Supabase, como era antes.
 * Dentro da aba, a mesma leitura é reaproveitada por 60 s (várias telas pedem o mesmo catálogo).
 */
import { supabase } from './online';

export type CatalogName = 'creatures' | 'items' | 'skills' | 'biomes' | 'city' | 'config';

const DIRECT: Record<CatalogName, () => PromiseLike<{ data: unknown; error: unknown }>> = {
  creatures: () => supabase().from('creatures').select('slug,name,data').eq('status', 'published'),
  items: () => supabase().from('items').select('slug,name,data').eq('status', 'published'),
  skills: () => supabase().from('skills').select('slug,name,data').eq('status', 'published'),
  biomes: () => supabase().from('biomes').select('slug,name,description,palette,settings,assets,status').eq('status', 'published'),
  city: () => supabase().from('city_layouts').select('data').eq('slug', 'aster').eq('status', 'published'),
  config: () => supabase().from('game_config').select('values').eq('id', 1),
};

const TTL = 60_000;
const memo = new Map<CatalogName, { at: number; p: Promise<unknown[]> }>();

async function load(name: CatalogName): Promise<unknown[]> {
  try {
    const r = await fetch(`/api/catalog?t=${name}`, { headers: { Accept: 'application/json' } });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const body = await r.json();
      if (Array.isArray(body)) return body;
    }
  } catch { /* rota indisponível: leitura direta */ }
  const { data, error } = await DIRECT[name]();
  if (error) throw error instanceof Error ? error : new Error(String((error as { message?: string }).message ?? error));
  return (data as unknown[]) ?? [];
}

/** Linhas do catálogo (mesmo formato que o Supabase devolvia). Rejeita se nem o Supabase respondeu. */
export function fetchCatalog<T = Record<string, unknown>>(name: CatalogName): Promise<T[]> {
  const hit = memo.get(name);
  if (hit && Date.now() - hit.at < TTL) return hit.p as Promise<T[]>;
  const p = load(name);
  memo.set(name, { at: Date.now(), p });
  p.catch(() => { if (memo.get(name)?.p === p) memo.delete(name); }); // falha não fica guardada
  return p as Promise<T[]>;
}

/** O catálogo de configuração do jogo (`game_config.values`), ou null. */
export async function fetchGameConfig(): Promise<Record<string, unknown> | null> {
  const rows = await fetchCatalog<{ values?: Record<string, unknown> }>('config');
  return rows[0]?.values ?? null;
}
