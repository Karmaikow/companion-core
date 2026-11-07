/**
 * Dados da wiki: tudo vem direto das regras do jogo (`shared/rules`), então a wiki nunca fica atrás do código.
 * O catálogo publicado no banco (itens e monstros que o Administrador criou) entra por uma *foto* opcional,
 * `/wiki-data.json`, lida uma vez (não gasta a cota do servidor). Sem a foto, valem os padrões do código.
 */
import {
  DEFAULT_ITEMS, DEFAULT_CREATURES, DISTORCIDOS, ITEM_TYPES, RARITIES, ELEMENTS, SPECIES, TIERS, TIER_UP, TIER_KEYS,
  WEAPON_TECHNIQUES, COMBO_FINISHERS, COMBO_LINKS, INFUSIONS, STYLE_RANKS, TECH_EVOLUTIONS, ELEMENT_SETS, SET_TIERS,
  REFINES, NODE_KINDS, DEFAULT_BIOME_RESOURCES, DEFAULT_WAR, GATES, GATE_IDS, GENERAL, WAR_TITLE, LAGRIMA, CRYSTAL_DRAIN,
  hordeSchedule, bossAtSec, ARCHETYPES, TEMPERAMENTS, TIMES, FAMILY_TIERS, TIER_ORDER, ANALYSIS_TARGET, MOCHILA_CAPACITY,
  COMBO_WINDOW, COMBO_PERFECT_BONUS, creatureStatsAt,
} from '@rules';
import type { ItemDef, CreatureDef } from '@rules';

export const pretty = (slug: string) => { const s = slug.replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
export const elLabel = (e: string | null | undefined) => (e ? ELEMENTS[e as keyof typeof ELEMENTS]?.label ?? e : 'Neutra');
export const elColor = (e: string | null | undefined) => (e ? ELEMENTS[e as keyof typeof ELEMENTS]?.glow ?? '#c9c3b6' : '#c9c3b6');
export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export interface Snapshot { items?: ItemDef[]; creatures?: CreatureDef[]; at?: string }
export function buildCatalog(snap: Snapshot | null) {
  const items = snap?.items?.length ? snap.items : DEFAULT_ITEMS;
  const creatures = snap?.creatures?.length ? snap.creatures : [...DEFAULT_CREATURES, ...DISTORCIDOS.creatures];
  return { items, creatures };
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const r = await fetch('/wiki-data.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j === 'object' ? (j as Snapshot) : null;
  } catch { return null; }
}

export const KINDS: Record<string, string> = Object.fromEntries(Object.entries(ITEM_TYPES).map(([k, v]) => [k, v.label]));
export const skillName = (slug: string) => [...WEAPON_TECHNIQUES, ...COMBO_FINISHERS].find((s) => s.slug === slug)?.name ?? (slug === 'basic' ? 'golpe básico' : pretty(slug));

export {
  ITEM_TYPES, RARITIES, ELEMENTS, SPECIES, TIERS, TIER_UP, TIER_KEYS, WEAPON_TECHNIQUES, COMBO_FINISHERS, COMBO_LINKS, INFUSIONS, STYLE_RANKS,
  TECH_EVOLUTIONS, ELEMENT_SETS, SET_TIERS, REFINES, NODE_KINDS, DEFAULT_BIOME_RESOURCES, DEFAULT_WAR, GATES, GATE_IDS, GENERAL, WAR_TITLE,
  LAGRIMA, CRYSTAL_DRAIN, hordeSchedule, bossAtSec, ARCHETYPES, TEMPERAMENTS, TIMES, FAMILY_TIERS, TIER_ORDER, ANALYSIS_TARGET,
  MOCHILA_CAPACITY, COMBO_WINDOW, COMBO_PERFECT_BONUS, creatureStatsAt,
};

export type PageId = 'inicio' | 'itens' | 'monstros' | 'classes' | 'tecnicas' | 'coleta' | 'mecanicas' | 'guerra';
export const PAGES: { id: PageId; label: string; hint: string }[] = [
  { id: 'inicio', label: 'Início', hint: 'Por onde começar' },
  { id: 'itens', label: 'Itens', hint: 'Armas, equipamentos e tiers' },
  { id: 'monstros', label: 'Bestiário', hint: 'Criaturas e Distorcidos' },
  { id: 'classes', label: 'Classes', hint: 'Linhagens de Companions' },
  { id: 'tecnicas', label: 'Técnicas e combos', hint: 'Golpes de arma, essências e Estilo' },
  { id: 'coleta', label: 'Coleta', hint: 'Recursos, abordagens e refino' },
  { id: 'mecanicas', label: 'Mecânicas', hint: 'Carga, conjuntos, tiers e vínculo' },
  { id: 'guerra', label: 'Guerra de Áster', hint: 'Linha do tempo, prêmios e dicas' },
];

export interface SearchEntry { page: PageId; id: string; title: string; kind: string; text: string }
/** Minúsculas e sem acento, para a busca. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Índice da busca: uma linha por verbete. */
export function searchIndex(cat: { items: ItemDef[]; creatures: CreatureDef[] }): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const i of cat.items) out.push({ page: 'itens', id: 'item-' + i.slug, title: i.name, kind: ITEM_TYPES[i.type]?.label ?? 'Item', text: `${i.description} ${i.obtain}` });
  for (const c of cat.creatures) out.push({ page: 'monstros', id: 'mob-' + c.slug, title: c.name, kind: 'Criatura', text: c.description });
  for (const s of Object.values(SPECIES)) out.push({ page: 'classes', id: 'classe-' + s.key, title: s.label, kind: 'Classe', text: `${s.lineage} ${s.vocation}` });
  for (const t of [...WEAPON_TECHNIQUES, ...COMBO_FINISHERS]) out.push({ page: 'tecnicas', id: 'tec-' + t.slug, title: t.name, kind: 'Técnica', text: t.description });
  for (const k of Object.values(NODE_KINDS)) out.push({ page: 'coleta', id: 'rec-' + k.kind, title: k.name, kind: 'Recurso', text: k.sign });
  for (const r of REFINES) out.push({ page: 'coleta', id: 'refino-' + r.id, title: pretty(r.id), kind: 'Refino', text: r.label });
  const mech: [string, string, string][] = [
    ['mec-tiers', 'Tiers (T1 a T5)', 'material poder vínculo evolução arma'],
    ['mec-carga', 'Carga e peso', 'mochila capacidade pesado sobrecarregado'],
    ['mec-conjuntos', 'Conjuntos de essência', 'set peças bônus elemento'],
    ['mec-estilo', 'Estilo (D a S)', 'combo ritmo janela perfeito'],
    ['mec-analise', 'Análise de criaturas', 'bestiário partículas dossiê'],
  ];
  for (const [id, title, text] of mech) out.push({ page: 'mecanicas', id, title, kind: 'Mecânica', text });
  out.push({ page: 'guerra', id: 'guerra-tempo', title: 'Linha do tempo da guerra', kind: 'Guerra', text: 'hordas chefe general portões cristal alistamento fúria' });
  out.push({ page: 'guerra', id: 'guerra-premios', title: 'Recompensas da guerra', kind: 'Guerra', text: 'buff título lágrima da rainha placar reconstrução' });
  return out;
}

export function search(index: SearchEntry[], q: string, max = 40): SearchEntry[] {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: [number, SearchEntry][] = [];
  for (const e of index) {
    const t = norm(e.title), b = norm(e.text + ' ' + e.kind);
    let s = 0, ok = true;
    for (const w of terms) {
      if (t.includes(w)) s += t.startsWith(w) ? 5 : 3;
      else if (b.includes(w)) s += 1;
      else { ok = false; break; }
    }
    if (ok) scored.push([s, e]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, max).map(([, e]) => e);
}
