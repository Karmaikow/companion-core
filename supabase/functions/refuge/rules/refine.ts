/**
 * Refino (Casa dos Ecos): muitos materiais comuns viram um material melhor (padrão 30 → 1, ajustável no Admin em
 * game_config.values.ecos.refine). A qualidade do refinado é a média das faixas do que entrou: refinar coisa boa
 * dá refinado bom, então a afinação da coleta continua valendo. Os refinados entram nas receitas da Forja, das
 * Escolas e da Coleta pela categoria (madeira, minério, planta…) e valem mais nas lojas.
 */
import { MATERIALS, BAND_LABEL, batchKey, bandRank, type Band, type PropKey, type MaterialBatch } from './ecos.ts';

export interface RefineDef { id: string; to: string; from: string[]; label: string }
export const REFINES: RefineDef[] = [
  { id: 'extrato-de-orvalho', to: 'extrato-de-orvalho', from: ['erva-orvalho-folha', 'erva-orvalho-flor', 'erva-orvalho-raiz'], label: 'Plantas de Erva-de-orvalho' },
  { id: 'tabua-nobre', to: 'tabua-nobre', from: ['madeira-salgueiro', 'madeira-carvalho'], label: 'Madeira de Salgueiro ou Carvalho' },
  { id: 'bloco-lapidado', to: 'bloco-lapidado', from: ['pedra-granito', 'pedra-seixo'], label: 'Granito ou Seixo' },
  { id: 'lingote-de-cobre', to: 'lingote-de-cobre', from: ['minerio-cobre'], label: 'Cobre Nativo' },
  { id: 'quartzo-lapidado', to: 'quartzo-lapidado', from: ['quartzo-fragmento'], label: 'Fragmentos de Quartzo' },
];
export const refineById = (id: string) => REFINES.find((r) => r.id === id) ?? null;

const BANDS: Band[] = ['baixa', 'media', 'alta'];
/** nota de um lote (para escolher os melhores ou os mais comuns primeiro) */
const score = (b: { bands: Partial<Record<PropKey, Band>> }) => Object.values(b.bands).reduce((t, x) => t + bandRank(x), 0);

/** Faixas do refinado: média (ponderada pela quantidade) das faixas de quem entrou, por propriedade. */
export function refineBands(r: RefineDef, picks: { material: string; bands: Partial<Record<PropKey, Band>>; qty: number }[]): Partial<Record<PropKey, Band>> {
  const out: Partial<Record<PropKey, Band>> = {};
  for (const p of Object.keys(MATERIALS[r.to].ranges) as PropKey[]) {
    let sum = 0, n = 0;
    for (const b of picks) { const v = b.bands[p]; if (v) { sum += bandRank(v) * b.qty; n += b.qty; } }
    out[p] = n ? BANDS[Math.max(0, Math.min(2, Math.round(sum / n)))] : 'media';
  }
  return out;
}

/** Escolhe `qty` unidades da mochila para um refino: os melhores primeiro (ou os mais comuns). */
export function autoPickRefine(r: RefineDef, bag: MaterialBatch[], qty: number, prefer: 'melhores' | 'comuns' = 'melhores'): { key: string; qty: number }[] | null {
  const fit = bag.filter((b) => r.from.includes(b.material) && b.qty > 0).sort((a, b) => (prefer === 'melhores' ? score(b) - score(a) : score(a) - score(b)));
  const out: { key: string; qty: number }[] = [];
  let left = qty;
  for (const b of fit) { if (left <= 0) break; const t = Math.min(left, b.qty); out.push({ key: b.key, qty: t }); left -= t; }
  return left > 0 ? null : out;
}

/** Confere um refino (servidor): as escolhas somam `qty`, servem para a receita e existem na mochila. */
export function checkRefine(r: RefineDef | null, picks: { key: string; qty: number }[], bag: MaterialBatch[], qty: number):
  { ok: true; take: { key: string; qty: number }[]; give: { key: string; qty: number }; bands: Partial<Record<PropKey, Band>> } | { ok: false; reason: string } {
  if (!r) return { ok: false, reason: 'Refino inexistente.' };
  const merged = new Map<string, number>();
  for (const p of picks) { const q = Math.round(Number(p.qty)); if (q > 0) merged.set(p.key, (merged.get(p.key) ?? 0) + q); }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total !== qty) return { ok: false, reason: `O refino usa exatamente ${qty} unidades.` };
  const used: { material: string; bands: Partial<Record<PropKey, Band>>; qty: number }[] = [];
  for (const [key, q] of merged) {
    const b = bag.find((x) => x.key === key);
    if (!b || !r.from.includes(b.material)) return { ok: false, reason: 'Um dos materiais não serve para esse refino.' };
    if (b.qty < q) return { ok: false, reason: 'Faltam materiais na mochila.' };
    used.push({ material: b.material, bands: b.bands, qty: q });
  }
  const bands = refineBands(r, used);
  return { ok: true, take: [...merged].map(([key, q]) => ({ key, qty: q })), give: { key: batchKey(r.to, bands), qty: 1 }, bands };
}

export const describeBands = (bands: Partial<Record<PropKey, Band>>) => Object.values(bands).map((b) => BAND_LABEL[b as Band]).join(' / ');
