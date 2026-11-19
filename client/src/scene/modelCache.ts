/**
 * Cache local dos modelos que vêm por endereço assinado (o corpo e as animações de cada Companion, guardados no
 * Supabase). O endereço muda a cada sessão — o token é novo — então o cache normal do navegador nunca acerta e o
 * mesmo arquivo era baixado de novo em toda visita (vários segundos de espera e tráfego do Supabase, que é a cota
 * que já estourou uma vez). Aqui o arquivo fica guardado no aparelho pela parte do endereço que NÃO muda (o caminho,
 * que já traz a versão do arquivo: `v1-<data>-nome.glb`), por 90 dias.
 *
 * Os modelos servidos pelo próprio site não passam por aqui: para eles vale o cache do navegador (vercel.json).
 * Se algo falhar (navegador sem Cache Storage, sem espaço, rede), o jogo carrega pelo endereço original, como antes.
 */

const CACHE_NAME = 'cc-modelos-v1';
/** tempo que um modelo fica guardado no aparelho */
export const MODEL_CACHE_DAYS = 90;
/** no máximo este tanto de arquivos guardados (os mais antigos saem primeiro) */
export const MODEL_CACHE_MAX = 60;
const STAMP = 'x-cc-guardado-em';

/** A chave do arquivo: o endereço sem o token (e sem nada depois do `?`). */
export const modelCacheKey = (url: string, base: string): string => { const u = new URL(url, base); return u.origin + u.pathname; };

/**
 * Vale guardar? Só arquivo .glb (inteiro num arquivo só) que venha de outro endereço ou com token: é o que o cache
 * do navegador não resolve. `blob:` e `data:` já estão na memória.
 */
export function shouldCacheModel(url: string, base: string): boolean {
  if (/^(blob|data):/i.test(url)) return false;
  let u: URL;
  try { u = new URL(url, base); } catch { return false; }
  if (!/^https?:$/.test(u.protocol) || !/\.glb$/i.test(u.pathname)) return false;
  return u.origin !== new URL(base).origin || u.searchParams.has('token');
}

/** O arquivo guardado ainda vale? (`savedAt` e `now` em ms) */
export const modelCacheFresh = (savedAt: number, now: number): boolean => Number.isFinite(savedAt) && savedAt <= now && now - savedAt < MODEL_CACHE_DAYS * 86_400_000;

/** Quais chaves apagar: as vencidas e, passando do limite, as mais antigas. `entries`: [chave, guardado em]. */
export function modelCacheEvict(entries: readonly [string, number][], now: number, max = MODEL_CACHE_MAX): string[] {
  const out = entries.filter(([, at]) => !modelCacheFresh(at, now)).map(([k]) => k);
  const keep = entries.filter(([, at]) => modelCacheFresh(at, now)).sort((a, b) => b[1] - a[1]);
  return [...out, ...keep.slice(max).map(([k]) => k)];
}

export const modelCacheStats = { hits: 0, misses: 0, bytesSaved: 0 };
let cleaned = false;

/**
 * O endereço de onde carregar o modelo: do aparelho (um endereço `blob:` com o arquivo guardado) ou, na primeira
 * vez, o próprio arquivo recém-baixado — que já fica guardado. `release` libera o `blob:` depois de carregado.
 */
export async function cachedModelUrl(url: string): Promise<{ url: string; release: () => void }> {
  const plain = { url, release: () => {} };
  if (typeof caches === 'undefined' || typeof location === 'undefined' || !shouldCacheModel(url, location.href)) return plain;
  try {
    const cache = await caches.open(CACHE_NAME), key = modelCacheKey(url, location.href), now = Date.now();
    if (!cleaned) { cleaned = true; void cleanup(cache, now); }
    const hit = await cache.match(key);
    if (hit && modelCacheFresh(Number(hit.headers.get(STAMP)), now)) {
      const blob = await hit.blob();
      modelCacheStats.hits++; modelCacheStats.bytesSaved += blob.size;
      const obj = URL.createObjectURL(blob);
      return { url: obj, release: () => URL.revokeObjectURL(obj) };
    }
    const res = await fetch(url);
    if (!res.ok) return plain;
    const blob = await res.blob();
    modelCacheStats.misses++;
    // guarda em segundo plano: sem espaço ou com o cache bloqueado, o modelo carrega do mesmo jeito
    void cache.put(key, new Response(blob, { headers: { 'content-type': blob.type || 'model/gltf-binary', [STAMP]: String(now) } })).catch(() => {});
    const obj = URL.createObjectURL(blob);
    return { url: obj, release: () => URL.revokeObjectURL(obj) };
  } catch { return plain; }
}

async function cleanup(cache: Cache, now: number) {
  try {
    const keys = await cache.keys();
    const entries: [string, number][] = [];
    for (const k of keys) { const r = await cache.match(k); entries.push([k.url, Number(r?.headers.get(STAMP))]); }
    for (const k of modelCacheEvict(entries, now)) await cache.delete(k);
  } catch { /* fica para a próxima */ }
}
