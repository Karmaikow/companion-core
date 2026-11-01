/**
 * Missões (Admin → Missões): quem pode pegar (pré-requisitos), onde se pega, o que fazer (objetivos), o que se ganha
 * (prêmios), a raridade e a repetição. Funções puras: o servidor confere requisitos e progresso por aqui, com o que
 * ele mesmo registrou (coletas confirmadas, abates, fabricações), e entrega os prêmios uma vez só.
 *
 * Objetivos:
 *  - coletar: juntar N de um material/categoria (faixa mínima opcional), opcionalmente numa região (bioma);
 *  - entregar: tirar N da mochila de coleta e entregar (conta na hora, não volta);
 *  - cacar: derrotar N de uma criatura, de uma família ou qualquer uma (nível mínimo opcional);
 *  - fabricar: fazer N vezes uma receita da Coleta, um preparo das Escolas ou um refino da Casa dos Ecos.
 */
import { clampText } from './text.ts';
import { MATERIALS, CATEGORIES, PROP_LABEL, BAND_LABEL, atLeast, parseBatchKey, batchKey, type ResCategory, type PropKey, type Band } from './ecos.ts';
import { RECIPES } from './ecosPlay.ts';
import { BREWS, CITY_SCHOOLS, type CitySchool } from './escolas.ts';
import { goodById } from './shop.ts';
import { REFINES } from './refine.ts';
import { ELEMENTS, type Element } from './identity.ts';
import { CLASS_LABEL } from './pacto.ts';
import type { SpeciesKey } from './species.ts';

export type MissionRarity = 'comum' | 'incomum' | 'rara' | 'epica' | 'lendaria';
export const MISSION_RARITIES: Record<MissionRarity, { label: string; color: string }> = {
  comum: { label: 'Comum', color: '#c9c3b6' }, incomum: { label: 'Incomum', color: '#7bd47a' }, rara: { label: 'Rara', color: '#6cb8ff' },
  epica: { label: 'Épica', color: '#c58cff' }, lendaria: { label: 'Lendária', color: '#ffb347' },
};
export type MissionRepeat = 'unica' | 'diaria' | 'semanal';
export const MISSION_REPEATS: Record<MissionRepeat, string> = { unica: 'Uma vez', diaria: 'Todo dia', semanal: 'Toda semana' };
/** quem dá a missão (onde se pega e entrega) */
export type MissionGiver = 'livre' | 'casa-dos-ecos' | 'escola-forja' | 'escola-veneno';
export const MISSION_GIVERS: Record<MissionGiver, string> = { livre: 'Em qualquer lugar', 'casa-dos-ecos': 'Casa dos Ecos (Áster)', 'escola-forja': 'Escola da Forja (Áster)', 'escola-veneno': 'Escola do Veneno (Áster)' };
export type ObjectiveKind = 'coletar' | 'entregar' | 'cacar' | 'fabricar';
export const OBJECTIVE_KINDS: Record<ObjectiveKind, string> = { coletar: 'Coletar', entregar: 'Entregar materiais', cacar: 'Caçar monstros', fabricar: 'Fabricar / preparar' };

export interface MissionObjective {
  kind: ObjectiveKind;
  qty: number;
  /** texto livre (vazio = gerado) */
  label?: string;
  // coletar / entregar
  material?: string;
  category?: ResCategory;
  prop?: PropKey;
  min?: Band;
  /** coletar: só conta nesta região (slug do bioma) */
  biome?: string;
  // cacar
  creature?: string;
  family?: string;
  minLevel?: number;
  // fabricar: id de uma receita da Coleta (RECIPES) ou de um preparo das Escolas (BREWS)
  recipe?: string;
}
export interface MissionRequirements {
  /** missões que precisam estar concluídas antes */
  after: string[];
  /** nível de vínculo mínimo */
  bond: number;
  /** matriculada em todas estas escolas */
  schools: CitySchool[];
  /** só estas classes (vazio = todas) */
  classes: SpeciesKey[];
  /** só estas essências (vazio = todas) */
  essences: Element[];
}
export interface MissionRewards {
  lumes: number;
  /** XP de vínculo */
  bond: number;
  /** lotes da mochila de coleta (chave de lote: material|faixas) */
  materials: { key: string; qty: number }[];
  /** itens do Arsenal (slug) */
  items: { item: string; qty: number }[];
  /** desbloqueio (ex.: uma variedade de planta que passa a aparecer só para quem tem) */
  unlock?: string;
}
export interface MissionDef {
  slug: string;
  name: string;
  description: string;
  rarity: MissionRarity;
  repeat: MissionRepeat;
  giver: MissionGiver;
  req: MissionRequirements;
  objectives: MissionObjective[];
  rewards: MissionRewards;
}

/** Desbloqueios conhecidos (prêmio de missão): o que cada um faz. Outros ids valem, mas sem texto próprio. */
export const UNLOCKS: Record<string, string> = {
  'variedade:erva-lunar': 'A Erva-de-orvalho Lunar passa a aparecer no mundo para você',
  'variedade:veio-prateado': 'Veios Prateados passam a aparecer no mundo para você',
  'lendaria:nascente-azul': 'A Nascente Azul (lendária) passa a aparecer no mundo para você',
  'lendaria:arvore-ancestral': 'A Árvore Ancestral (lendária) passa a aparecer no mundo para você',
};
export const unlockText = (id: string) => UNLOCKS[id] ?? `Desbloqueio: ${id}`;

export const MAX_OBJECTIVES = 6;
export const MAX_ACTIVE_MISSIONS = 10;
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const UNLOCK = /^[a-z0-9][a-z0-9:_-]{1,60}$/;
const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const pick = <T extends string>(v: unknown, set: Record<T, unknown>, d: T): T => (typeof v === 'string' && v in set ? (v as T) : d);
const slugs = (v: unknown, max = 12) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && SLUG.test(x)))].slice(0, max) : []);
const BANDS: Record<Band, 1> = { baixa: 1, media: 1, alta: 1 };

function cleanObjective(raw: unknown): MissionObjective | null {
  const o = (raw ?? {}) as Partial<MissionObjective>;
  const kind = pick(o.kind, OBJECTIVE_KINDS, 'coletar');
  const out: MissionObjective = { kind, qty: num(o.qty, 1, 999, 1) };
  const label = clampText(o.label, 80).trim();
  if (label) out.label = label;
  if (kind === 'coletar' || kind === 'entregar') {
    if (typeof o.material === 'string' && o.material in MATERIALS) out.material = o.material;
    else if (typeof o.category === 'string' && o.category in CATEGORIES) out.category = o.category;
    else return null;
    const props = out.material ? Object.keys(MATERIALS[out.material].ranges) : [];
    if (typeof o.prop === 'string' && o.prop in PROP_LABEL && (!out.material || props.includes(o.prop))) { out.prop = o.prop; out.min = pick(o.min, BANDS, 'media'); }
    if (kind === 'coletar' && typeof o.biome === 'string' && SLUG.test(o.biome)) out.biome = o.biome;
  } else if (kind === 'cacar') {
    if (typeof o.creature === 'string' && SLUG.test(o.creature)) out.creature = o.creature;
    else if (typeof o.family === 'string' && SLUG.test(o.family)) out.family = o.family;
    const lv = num(o.minLevel, 0, 60, 0);
    if (lv > 1) out.minLevel = lv;
  } else {
    if (typeof o.recipe !== 'string' || !recipeName(o.recipe)) return null;
    out.recipe = o.recipe;
  }
  return out;
}

export function sanitizeMission(input: unknown): MissionDef | null {
  const m = (input ?? {}) as Partial<MissionDef> & { req?: Partial<MissionRequirements>; rewards?: Partial<MissionRewards> };
  if (typeof m.slug !== 'string' || !SLUG.test(m.slug)) return null;
  const name = clampText(m.name, 60).trim();
  if (!name) return null;
  const req: Partial<MissionRequirements> = m.req ?? {};
  const rw: Partial<MissionRewards> = m.rewards ?? {};
  const objectives = (Array.isArray(m.objectives) ? m.objectives : []).map(cleanObjective).filter((x): x is MissionObjective => !!x).slice(0, MAX_OBJECTIVES);
  return {
    slug: m.slug, name,
    description: clampText(m.description, 400),
    rarity: pick(m.rarity, MISSION_RARITIES, 'comum'),
    repeat: pick(m.repeat, MISSION_REPEATS, 'unica'),
    giver: pick(m.giver, MISSION_GIVERS, 'livre'),
    req: {
      after: slugs(req.after).filter((s) => s !== m.slug),
      bond: num(req.bond, 0, 99, 0),
      schools: Array.isArray(req.schools) ? [...new Set(req.schools.filter((s): s is CitySchool => typeof s === 'string' && s in CITY_SCHOOLS))] : [],
      classes: Array.isArray(req.classes) ? [...new Set(req.classes.filter((s): s is SpeciesKey => typeof s === 'string' && s in CLASS_LABEL))] : [],
      essences: Array.isArray(req.essences) ? [...new Set(req.essences.filter((s): s is Element => typeof s === 'string' && s in ELEMENTS))] : [],
    },
    objectives,
    rewards: {
      lumes: num(rw.lumes, 0, 100_000, 0),
      bond: num(rw.bond, 0, 10_000, 0),
      materials: (Array.isArray(rw.materials) ? rw.materials : []).map((x) => ({ key: String((x as { key?: unknown })?.key ?? ''), qty: num((x as { qty?: unknown })?.qty, 1, 999, 1) })).filter((x) => !!parseBatchKey(x.key)).slice(0, 8),
      items: (Array.isArray(rw.items) ? rw.items : []).map((x) => ({ item: String((x as { item?: unknown })?.item ?? ''), qty: num((x as { qty?: unknown })?.qty, 1, 99, 1) })).filter((x) => SLUG.test(x.item)).slice(0, 8),
      ...(typeof rw.unlock === 'string' && UNLOCK.test(rw.unlock) ? { unlock: rw.unlock } : {}),
    },
  };
}

export const recipeName = (id: string): string | null =>
  RECIPES.find((r) => r.id === id)?.name ?? (BREWS.some((b) => b.id === id) ? goodById(id)?.name ?? id : REFINES.some((r) => r.id === id) ? `Refinar ${MATERIALS[REFINES.find((r) => r.id === id)!.to].name}` : null);
/** receitas e preparos que um objetivo "fabricar" aceita */
export const CRAFTABLES = [...RECIPES.map((r) => r.id), ...BREWS.map((b) => b.id), ...REFINES.map((r) => r.id)];

/** Texto do objetivo para a interface (o do Admin, ou gerado). `names` resolve slugs de criatura, família e bioma. */
export function objectiveLabel(o: MissionObjective, names: (kind: 'creature' | 'family' | 'biome', slug: string) => string = (_k, s) => s): string {
  if (o.label) return o.label;
  const what = o.material ? MATERIALS[o.material].name : o.category ? CATEGORIES[o.category].label.toLowerCase() : '';
  const band = o.prop && o.min ? ` com ${PROP_LABEL[o.prop].toLowerCase()} ${BAND_LABEL[o.min]} ou mais` : '';
  if (o.kind === 'coletar') return `Coletar ${o.qty}× ${what}${band}${o.biome ? ` em ${names('biome', o.biome)}` : ''}`;
  if (o.kind === 'entregar') return `Entregar ${o.qty}× ${what}${band}`;
  if (o.kind === 'cacar') return `Derrotar ${o.qty}× ${o.creature ? names('creature', o.creature) : o.family ? `da família ${names('family', o.family)}` : 'monstros'}${o.minLevel ? ` (nível ${o.minLevel}+)` : ''}`;
  return `Fabricar ${o.qty}× ${recipeName(o.recipe ?? '') ?? o.recipe}`;
}

/** O lote serve para o objetivo (coletar/entregar)? */
export function batchFits(o: MissionObjective, key: string): boolean {
  const b = parseBatchKey(key);
  if (!b) return false;
  if (o.material ? b.material !== o.material : MATERIALS[b.material]?.category !== o.category) return false;
  return !o.prop || !o.min || atLeast(b.bands[o.prop], o.min);
}

// ---------------------------------------------------------------------------
// Período (repetição) e requisitos
// ---------------------------------------------------------------------------

/** Chave do período: "x" (uma vez), o dia ou a semana em Brasília (UTC−3). */
export function missionPeriod(repeat: MissionRepeat, now: number): string {
  if (repeat === 'unica') return 'x';
  const d = new Date(now - 3 * 3_600_000);
  if (repeat === 'diaria') return d.toISOString().slice(0, 10);
  // semana ISO
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-S${String(Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}

export interface MissionWho {
  /** missões já concluídas (slugs, qualquer período) */
  done: ReadonlySet<string>;
  bondLevel: number;
  schools: readonly string[];
  forms: readonly SpeciesKey[];
  essence: Element | null;
}
/** Por que não pode pegar (null = pode). `names` resolve o nome de outra missão. */
export function missionBlock(m: MissionDef, who: MissionWho, names: (slug: string) => string = (s) => s): string | null {
  const miss = m.req.after.filter((s) => !who.done.has(s));
  if (miss.length) return `Antes, conclua: ${miss.map(names).join(', ')}.`;
  if (who.bondLevel < m.req.bond) return `Precisa de vínculo nível ${m.req.bond}.`;
  const sch = m.req.schools.filter((s) => !who.schools.includes(s));
  if (sch.length) return `Só para quem estuda na ${sch.map((s) => CITY_SCHOOLS[s].label).join(' e na ')}.`;
  if (m.req.classes.length && !m.req.classes.some((c) => who.forms.includes(c))) return `Só para ${m.req.classes.map((c) => CLASS_LABEL[c]).join(' ou ')}.`;
  if (m.req.essences.length && (!who.essence || !m.req.essences.includes(who.essence))) return `Só para essência de ${m.req.essences.map((e) => ELEMENTS[e].label).join(' ou ')}.`;
  return null;
}

// ---------------------------------------------------------------------------
// Progresso
// ---------------------------------------------------------------------------

/** O que o servidor registrou desde que a missão foi aceita. */
export interface MissionLog {
  gathers: { items: { key: string; qty: number }[]; biome: string | null }[];
  kills: { slug: string; level: number; family: string | null }[];
  crafts: { recipe: string; times: number }[];
}
/** Progresso de cada objetivo (os de entregar vêm de `delivered`, guardado na entrega). Sempre ≤ qty. */
export function missionProgress(m: MissionDef, log: MissionLog, delivered: readonly number[] = []): number[] {
  return m.objectives.map((o, i) => {
    let n = 0;
    if (o.kind === 'entregar') n = delivered[i] ?? 0;
    else if (o.kind === 'coletar') {
      for (const g of log.gathers) if (!o.biome || g.biome === o.biome) for (const it of g.items) if (batchFits(o, it.key)) n += it.qty;
    } else if (o.kind === 'cacar') {
      for (const k of log.kills) if ((o.creature ? k.slug === o.creature : o.family ? k.family === o.family : true) && k.level >= (o.minLevel ?? 0)) n++;
    } else for (const c of log.crafts) if (c.recipe === o.recipe) n += c.times;
    return Math.min(o.qty, n);
  });
}
export const missionComplete = (m: MissionDef, progress: readonly number[]) => m.objectives.length > 0 && m.objectives.every((o, i) => (progress[i] ?? 0) >= o.qty);

/** Missões de exemplo (o Admin carrega e ajusta). */
export const DEFAULT_MISSIONS: MissionDef[] = [
  sanitizeMission({
    slug: 'primeiras-ervas', name: 'Primeiras ervas', description: 'A Casa dos Ecos precisa de folhas de Erva-de-orvalho para os unguentos da cidade. Elas nascem por todo o mundo.',
    rarity: 'comum', repeat: 'unica', giver: 'casa-dos-ecos', req: { after: [], bond: 0, schools: [], classes: [], essences: [] },
    objectives: [{ kind: 'coletar', qty: 6, material: 'erva-orvalho-folha' }, { kind: 'entregar', qty: 4, material: 'erva-orvalho-folha' }],
    rewards: { lumes: 40, bond: 20, materials: [], items: [] },
  })!,
  sanitizeMission({
    slug: 'lenha-do-dia', name: 'Lenha do dia', description: 'Madeira resistente para as fogueiras e os andaimes de Áster.',
    rarity: 'comum', repeat: 'diaria', giver: 'casa-dos-ecos', req: { after: ['primeiras-ervas'], bond: 0, schools: [], classes: [], essences: [] },
    objectives: [{ kind: 'entregar', qty: 8, category: 'madeira', prop: 'resistencia', min: 'media' }],
    rewards: { lumes: 30, bond: 10, materials: [], items: [] },
  })!,
  sanitizeMission({
    slug: 'pocoes-de-aprendiz', name: 'Poções de aprendiz', description: 'A Escola do Veneno quer ver você preparar com o que a Casa dos Ecos ensinou. Quem passa aprende a achar a Erva Lunar.',
    rarity: 'rara', repeat: 'unica', giver: 'escola-veneno', req: { after: ['primeiras-ervas'], bond: 0, schools: ['veneno'], classes: [], essences: [] },
    objectives: [{ kind: 'coletar', qty: 10, category: 'planta', prop: 'estabilidade', min: 'media' }, { kind: 'fabricar', qty: 2, recipe: 'pocao-vida-p' }],
    rewards: { lumes: 60, bond: 30, materials: [], items: [], unlock: 'variedade:erva-lunar' },
  })!,
  sanitizeMission({
    slug: 'metal-de-aprendiz', name: 'Metal de aprendiz', description: 'A Escola da Forja só confia metal bom a quem sabe refinar. Traga lingotes e ganhe o mapa dos Veios Prateados.',
    rarity: 'rara', repeat: 'unica', giver: 'escola-forja', req: { after: ['primeiras-ervas'], bond: 0, schools: ['forja'], classes: [], essences: [] },
    objectives: [{ kind: 'fabricar', qty: 1, recipe: 'lingote-de-cobre' }, { kind: 'entregar', qty: 1, material: 'lingote-de-cobre' }],
    rewards: { lumes: 80, bond: 30, materials: [], items: [], unlock: 'variedade:veio-prateado' },
  })!,
  // ---- lendária: A Seiva Azul (a antiga descoberta do vale, em três partes)
  sanitizeMission({
    slug: 'seiva-azul-1', name: 'A Seiva Azul · I. Casca que brilha', description: 'Alguns salgueiros soltam uma seiva azul. A Mestra Ilvana quer saber de onde vem esse brilho: traga madeira e a própria seiva.',
    rarity: 'epica', repeat: 'unica', giver: 'casa-dos-ecos', req: { after: ['primeiras-ervas'], bond: 3, schools: [], classes: [], essences: [] },
    objectives: [{ kind: 'coletar', qty: 6, material: 'madeira-salgueiro' }, { kind: 'entregar', qty: 2, material: 'seiva-azul' }],
    rewards: { lumes: 80, bond: 40, materials: [], items: [] },
  })!,
  sanitizeMission({
    slug: 'seiva-azul-2', name: 'A Seiva Azul · II. Pistas na correnteza', description: 'Os fragmentos de quartzo têm o mesmo azul da seiva. Lapide um deles e veja o que a luz mostra.',
    rarity: 'epica', repeat: 'unica', giver: 'casa-dos-ecos', req: { after: ['seiva-azul-1'], bond: 3, schools: [], classes: [], essences: [] },
    objectives: [{ kind: 'coletar', qty: 10, material: 'pedra-seixo' }, { kind: 'fabricar', qty: 1, recipe: 'quartzo-lapidado' }],
    rewards: { lumes: 100, bond: 50, materials: [], items: [] },
  })!,
  sanitizeMission({
    slug: 'seiva-azul-3', name: 'A Seiva Azul · III. A Nascente Azul', description: 'O quartzo lapidado aponta uma nascente que só aparece para quem já viu o brilho. Os Distorcidos rondam a água: limpe o caminho e entregue o quartzo.',
    rarity: 'lendaria', repeat: 'unica', giver: 'casa-dos-ecos', req: { after: ['seiva-azul-2'], bond: 5, schools: [], classes: [], essences: [] },
    objectives: [{ kind: 'cacar', qty: 5, family: 'distorcidos' }, { kind: 'entregar', qty: 1, material: 'quartzo-lapidado' }, { kind: 'entregar', qty: 3, material: 'seiva-azul' }],
    rewards: { lumes: 250, bond: 120, materials: [{ key: batchKey('lagrima-da-nascente', {}), qty: 1 }], items: [], unlock: 'lendaria:nascente-azul' },
  })!,
  // ---- lendária: O Coração Rachado (o MVP dos Distorcidos)
  sanitizeMission({
    slug: 'coracao-rachado', name: 'O Coração Rachado', description: 'A lasca que apodreceu o Cristal Ápice ganhou corpo. Derrube o Coração Rachado e a mata mostra a árvore que ele escondia.',
    rarity: 'lendaria', repeat: 'unica', giver: 'livre', req: { after: [], bond: 8, schools: [], classes: [], essences: [] },
    objectives: [{ kind: 'cacar', qty: 3, creature: 'matriarca-das-lascas' }, { kind: 'cacar', qty: 1, creature: 'coracao-rachado' }],
    rewards: { lumes: 400, bond: 200, materials: [{ key: batchKey('cerne-ancestral', { flexibilidade: 'alta', resistencia: 'alta' }), qty: 1 }], items: [], unlock: 'lendaria:arvore-ancestral' },
  })!,
  sanitizeMission({
    slug: 'lascas-da-fenda', name: 'Lascas da fenda', description: 'Os Distorcidos estão se espalhando. Reduza o enxame dos pequenos antes que cresçam.',
    rarity: 'incomum', repeat: 'semanal', giver: 'livre', req: { after: [], bond: 2, schools: [], classes: [], essences: [] },
    objectives: [{ kind: 'cacar', qty: 10, family: 'distorcidos' }],
    rewards: { lumes: 120, bond: 40, materials: [{ key: batchKey('quartzo-fragmento', { integridade: 'media' }), qty: 2 }], items: [] },
  })!,
];
