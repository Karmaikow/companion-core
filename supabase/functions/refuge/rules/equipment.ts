/**
 * Armas e equipamentos. Só peças rígidas, presas a um osso do rig humanoide (mão, cabeça, peito): não deformam com o
 * corpo, então não precisam de rig nem de animação própria — um .GLB parado do Tripo ou um modelo gerado por código.
 * Roupa de verdade fica de fora (o corpo é uma peça só); "traje" é a aparência (cor/tinta/brilho).
 *
 * Atributos leves (decisão de 21/10): a arma importa, mas o vínculo e a árvore pesam mais.
 * O tipo da arma escolhe a animação (golpe, magia, tiro) e muda o golpe básico (alcance, cadência, dano).
 * O arco tem tiro carregado: quanto mais segura, mais longe vai e mais dano causa (`bowShot`).
 *
 * Obtenção (decisão de 21/10): itens são super raros e só existem por CRIAÇÃO, e só a classe Taurina tem a
 * habilidade de Forja. Cada item tem uma receita (ingredientes específicos, em geral drops dos monstros) e um vínculo
 * mínimo. Os outros Companions conseguem itens com quem forja (troca/presente no mundo compartilhado, MVP 2).
 */
import type { Element } from './identity.ts';
import type { SpeciesKey, AttrKey } from './species.ts';
import type { AnimKind } from './anim.ts';
import { sanitizeLook, type ModelLook } from './look.ts';

export type EquipSlot = 'weapon' | 'offhand' | 'head' | 'back' | 'accessory';
export type ItemType =
  | 'espada' | 'faca' | 'maca' | 'lanca' | 'cajado' | 'varinha' | 'arco'
  | 'escudo' | 'grimorio' | 'orbe'
  | 'chapeu' | 'tiara' | 'laco' | 'coroa'
  | 'mochila' | 'aljava'
  | 'amuleto' | 'anel';
export type Rarity = 'comum' | 'incomum' | 'rara' | 'lendaria';
export type Bone = 'mao_direita' | 'mao_esquerda' | 'cabeca' | 'peito' | 'nenhum';

export const SLOTS_EQ: Record<EquipSlot, { label: string; bone: Bone }> = {
  weapon: { label: 'Arma', bone: 'mao_direita' },
  offhand: { label: 'Mão secundária', bone: 'mao_esquerda' },
  head: { label: 'Cabeça', bone: 'cabeca' },
  back: { label: 'Costas', bone: 'peito' },
  accessory: { label: 'Acessório', bone: 'nenhum' },
};

export interface WeaponProfile {
  anim: AnimKind;          // animação do ataque
  range: number;           // alcance do golpe básico (m)
  cadence: number;         // ataques por segundo
  power: number;           // multiplicador do dano do golpe básico
  twoHanded: boolean;      // ocupa a mão secundária
  ranged: 'none' | 'magic' | 'charged';
}

export const ITEM_TYPES: Record<ItemType, { label: string; slot: EquipSlot; weapon?: WeaponProfile; size: number }> = {
  espada: { label: 'Espada', slot: 'weapon', size: 0.75, weapon: { anim: 'attack', range: 1.7, cadence: 1.1, power: 1.0, twoHanded: false, ranged: 'none' } },
  faca: { label: 'Faca / adaga', slot: 'weapon', size: 0.38, weapon: { anim: 'attack', range: 1.3, cadence: 1.7, power: 0.7, twoHanded: false, ranged: 'none' } },
  maca: { label: 'Maça', slot: 'weapon', size: 0.65, weapon: { anim: 'attack', range: 1.6, cadence: 0.75, power: 1.45, twoHanded: false, ranged: 'none' } },
  lanca: { label: 'Lança', slot: 'weapon', size: 1.35, weapon: { anim: 'attack', range: 2.4, cadence: 0.95, power: 1.05, twoHanded: true, ranged: 'none' } },
  cajado: { label: 'Cajado', slot: 'weapon', size: 1.25, weapon: { anim: 'cast', range: 7, cadence: 0.8, power: 1.1, twoHanded: true, ranged: 'magic' } },
  varinha: { label: 'Varinha', slot: 'weapon', size: 0.36, weapon: { anim: 'cast', range: 6, cadence: 1.2, power: 0.75, twoHanded: false, ranged: 'magic' } },
  arco: { label: 'Arco', slot: 'weapon', size: 0.95, weapon: { anim: 'shoot', range: 16, cadence: 0.7, power: 1.0, twoHanded: true, ranged: 'charged' } },
  escudo: { label: 'Escudo', slot: 'offhand', size: 0.55 },
  grimorio: { label: 'Grimório', slot: 'offhand', size: 0.28 },
  orbe: { label: 'Orbe', slot: 'offhand', size: 0.2 },
  chapeu: { label: 'Chapéu', slot: 'head', size: 0.42 },
  tiara: { label: 'Tiara', slot: 'head', size: 0.26 },
  laco: { label: 'Laço', slot: 'head', size: 0.2 },
  coroa: { label: 'Coroa de flores', slot: 'head', size: 0.3 },
  mochila: { label: 'Mochila', slot: 'back', size: 0.36 },
  aljava: { label: 'Aljava', slot: 'back', size: 0.5 },
  amuleto: { label: 'Amuleto', slot: 'accessory', size: 0.1 },
  anel: { label: 'Anel', slot: 'accessory', size: 0.05 },
};

export const RARITIES: Record<Rarity, { label: string; color: string; statMul: number }> = {
  comum: { label: 'Comum', color: '#c9c3b6', statMul: 1 },
  incomum: { label: 'Incomum', color: '#7be36b', statMul: 1.5 },
  rara: { label: 'Rara', color: '#5aa8ff', statMul: 2.2 },
  lendaria: { label: 'Lendária', color: '#ffb347', statMul: 3.2 },
};

/** Armas afins de cada classe (+5% no dano da arma): bônus pequeno, nenhuma proibida. */
export const CLASS_WEAPONS: Record<SpeciesKey, ItemType[]> = {
  serpente: ['cajado', 'lanca'], passaro: ['arco', 'lanca'], felino: ['faca', 'arco'], touro: ['maca', 'escudo'], mistica: ['varinha', 'orbe'],
};

export interface ItemDef {
  slug: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  essence: Element | null;
  stats: Partial<Record<AttrKey, number>>;   // % (leves: 2–12 numa arma comum/rara)
  proc: { primary: string; secondary: string; metal: string; gem: boolean; variant: number }; // modelo gerado por código
  model?: { url: string; path?: string };    // .GLB (no lugar do gerado)
  look?: ModelLook;
  grip: { pos: [number, number, number]; rot: [number, number, number]; scale: number }; // ajuste fino na mão/osso
  /** pegada ajustada para um modelo de Companion específico (id do Companion → pegada); vale no lugar de `grip` */
  gripByModel?: Record<string, ItemDef['grip']>;
  starter: boolean;                           // dado a todos (só para eventos; o normal é false)
  obtain: string;                             // observação livre (de onde vêm os ingredientes, evento...)
  recipe: { ingredients: { item: string; qty: number }[]; minBond: number; seconds: number };
}

/** Pegada do item para um modelo (o ajuste daquele Companion, ou a pegada padrão). */
export const gripFor = (item: ItemDef, modelKey?: string | null): ItemDef['grip'] => (modelKey && item.gripByModel?.[modelKey]) || item.grip;

/** Só a classe Taurina forja. */
export const FORGE_CLASS: SpeciesKey = 'touro';
export const canForge = (species: SpeciesKey | null | undefined) => species === FORGE_CLASS;

/**
 * Pode forjar este item agora? `materials` = ingredientes que o Companion tem (nome → quantidade).
 * Devolve o que falta (vazio = pode).
 */
export function forgeCheck(item: ItemDef, c: { species: SpeciesKey | null; bond: number; materials: Record<string, number> }): string[] {
  const out: string[] = [];
  if (!canForge(c.species)) out.push('Só Companions da classe Taurina sabem forjar.');
  if (c.bond < item.recipe.minBond) out.push(`Precisa de vínculo ${item.recipe.minBond}.`);
  for (const g of item.recipe.ingredients) {
    const have = c.materials[g.item] ?? 0;
    if (have < g.qty) out.push(`${g.item}: ${have}/${g.qty}`);
  }
  if (!item.recipe.ingredients.length) out.push('Receita ainda sem ingredientes.');
  return out;
}

export const DEFAULT_GRIP: ItemDef['grip'] = { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 };

const R = (ingredients: [string, number][], minBond = 2, seconds = 30) => ({ ingredients: ingredients.map(([item, qty]) => ({ item, qty })), minBond, seconds });
const I = (slug: string, name: string, type: ItemType, o: Partial<ItemDef> & { description: string }): ItemDef => ({
  slug, name, type, rarity: 'rara', essence: null, stats: {}, proc: { primary: '#b98c5c', secondary: '#e8e2d0', metal: '#c9d2e0', gem: false, variant: 0 },
  grip: DEFAULT_GRIP, starter: false, obtain: 'Forja (Taurina)', recipe: R([['Fragmento de Bruma', 3]]), ...o,
});

export const DEFAULT_ITEMS: ItemDef[] = [
  I('espada-de-madeira', 'Espada de Madeira', 'espada', { recipe: R([['Fragmento de Bruma', 2], ['Musgo macio', 3]], 2), description: 'Leve e honesta, boa para começar.', stats: { poder: 4 }, proc: { primary: '#c99a63', secondary: '#7a5232', metal: '#e7d3a8', gem: false, variant: 0 } }),
  I('adaga-de-cristal', 'Adaga de Cristal', 'faca', { recipe: R([['Cristal de geada', 1], ['Pelo gelado', 2], ['Fragmento de Bruma', 2]], 3), description: 'Rápida como um piscar.', stats: { agilidade: 5 }, rarity: 'rara', proc: { primary: '#bfe9ff', secondary: '#5b4a7a', metal: '#d8f4ff', gem: true, variant: 1 } }),
  I('maca-de-pedra', 'Maça de Pedra', 'maca', { recipe: R([['Fragmento de Bruma', 4], ['Musgo macio', 2]], 3), description: 'Pesada, lenta e muito convincente.', stats: { poder: 6, agilidade: -2 }, proc: { primary: '#9a8f86', secondary: '#7a5232', metal: '#b3a8d2', gem: false, variant: 0 } }),
  I('lanca-leve', 'Lança Leve', 'lanca', { recipe: R([['Fragmento de Bruma', 3], ['Pelo gelado', 2]], 3), description: 'Alcança antes de ser alcançada.', stats: { poder: 3, agilidade: 2 }, proc: { primary: '#d8c08a', secondary: '#7a5232', metal: '#dfe6ee', gem: false, variant: 0 } }),
  I('cajado-de-galho', 'Cajado de Galho', 'cajado', { recipe: R([['Semente brilhante', 1], ['Musgo macio', 3], ['Fragmento de Bruma', 2]], 3), description: 'Um galho que ainda lembra de ser árvore.', stats: { sintonia: 5 }, proc: { primary: '#8a6a4a', secondary: '#7be36b', metal: '#c9a3ff', gem: true, variant: 0 } }),
  I('varinha-estelar', 'Varinha Estelar', 'varinha', { recipe: R([['Pó de brasa', 3], ['Semente brilhante', 1], ['Fragmento de Bruma', 2]], 4), description: 'Deixa um rastro de faíscas.', stats: { sintonia: 3, energia: 3 }, rarity: 'rara', proc: { primary: '#f3efe0', secondary: '#c9a3ff', metal: '#ffe68a', gem: true, variant: 1 } }),
  I('arco-curto', 'Arco Curto', 'arco', { recipe: R([['Pelo gelado', 3], ['Musgo macio', 2], ['Fragmento de Bruma', 3]], 3), description: 'Segure para carregar: quanto mais tempo, mais longe e mais forte.', stats: { agilidade: 3, poder: 2 }, proc: { primary: '#a8794a', secondary: '#f3efe0', metal: '#dfe6ee', gem: false, variant: 0 } }),
  I('escudo-de-folha', 'Escudo de Folha', 'escudo', { recipe: R([['Musgo macio', 4], ['Fragmento de Bruma', 2]], 2), description: 'Uma folha gigante e teimosa.', stats: { defesa: 6 }, proc: { primary: '#6fbf5a', secondary: '#3f7a3a', metal: '#e7d3a8', gem: false, variant: 0 } }),
  I('grimorio-de-bolso', 'Grimório de Bolso', 'grimorio', { recipe: R([['Pó de brasa', 2], ['Fragmento de Bruma', 3]], 3), description: 'Cheio de anotações nas margens.', stats: { sintonia: 4 }, proc: { primary: '#7a4a8a', secondary: '#f3efe0', metal: '#ffd56b', gem: true, variant: 0 } }),
  I('orbe-de-luz', 'Orbe de Luz', 'orbe', { recipe: R([['Semente brilhante', 2], ['Pó de brasa', 2], ['Fragmento de Bruma', 3]], 4), description: 'Flutua ao lado e ilumina o caminho.', stats: { energia: 4 }, rarity: 'rara', proc: { primary: '#fff1a8', secondary: '#ffffff', metal: '#ffd56b', gem: true, variant: 0 } }),
  I('chapeu-de-mago', 'Chapéu de Mago', 'chapeu', { recipe: R([['Pelo gelado', 2], ['Fragmento de Bruma', 2]], 2), description: 'Pontudo e um pouco torto, como deve ser.', stats: { sintonia: 2 }, proc: { primary: '#5b4a9a', secondary: '#ffd56b', metal: '#ffd56b', gem: false, variant: 0 } }),
  I('tiara-de-cristal', 'Tiara de Cristal', 'tiara', { recipe: R([['Cristal de geada', 2], ['Fragmento de Bruma', 2]], 4), description: 'Brilha um pouquinho no escuro.', stats: { energia: 2 }, proc: { primary: '#e7d3a8', secondary: '#bfe9ff', metal: '#e7d3a8', gem: true, variant: 0 } }),
  I('laco-de-fita', 'Laço de Fita', 'laco', { recipe: R([['Musgo macio', 2], ['Fragmento de Bruma', 1]], 1), description: 'Fofura também é estratégia.', stats: { agilidade: 1 }, proc: { primary: '#ff7fb0', secondary: '#ffd1e3', metal: '#ffd1e3', gem: false, variant: 0 } }),
  I('coroa-de-flores', 'Coroa de Flores', 'coroa', { recipe: R([['Semente brilhante', 1], ['Musgo macio', 2]], 2), description: 'Flores que nunca murcham.', stats: { vida: 2 }, proc: { primary: '#7be36b', secondary: '#ffe68a', metal: '#ff9ac1', gem: false, variant: 0 } }),
  I('mochila-de-viagem', 'Mochila de Viagem', 'mochila', { recipe: R([['Pelo gelado', 3], ['Fragmento de Bruma', 2]], 2), description: 'Cabe mais do que parece.', stats: { vida: 3 }, proc: { primary: '#b98c5c', secondary: '#7a5232', metal: '#e7d3a8', gem: false, variant: 0 } }),
  I('aljava-de-couro', 'Aljava de Couro', 'aljava', { recipe: R([['Pelo gelado', 2], ['Fragmento de Bruma', 2]], 3), description: 'Flechas sempre à mão.', stats: { agilidade: 2 }, proc: { primary: '#8a5a3a', secondary: '#f3efe0', metal: '#e7d3a8', gem: false, variant: 0 } }),
  I('amuleto-do-vinculo', 'Amuleto do Vínculo', 'amuleto', { recipe: R([['Cristal de geada', 2], ['Semente brilhante', 2], ['Fragmento de Bruma', 5]], 5, 90), description: 'Esquenta quando você está por perto.', stats: { sintonia: 4 }, rarity: 'lendaria', proc: { primary: '#ffd56b', secondary: '#ff7fb0', metal: '#ffd56b', gem: true, variant: 0 } }),
];

// ---------------------------------------------------------------------------

export interface Equipped { weapon?: string; offhand?: string; head?: string; back?: string; accessory?: string }

/** Equipar: cada item no seu espaço; arma de duas mãos libera a mão secundária. Devolve o novo conjunto. */
export function equip(current: Equipped, item: ItemDef, catalog: ItemDef[]): Equipped {
  const slot = ITEM_TYPES[item.type].slot;
  const next: Equipped = { ...current, [slot]: item.slug };
  const w = catalog.find((x) => x.slug === next.weapon);
  if (slot === 'weapon' && ITEM_TYPES[item.type].weapon?.twoHanded) delete next.offhand;
  if (slot === 'offhand' && w && ITEM_TYPES[w.type].weapon?.twoHanded) delete next.weapon;
  return next;
}

/** Confere um conjunto salvo (itens que existem, no espaço certo, sem conflito de duas mãos). */
export function validateEquipped(eq: Equipped, catalog: ItemDef[], owned: (slug: string) => boolean): Equipped {
  let out: Equipped = {};
  for (const slot of ['weapon', 'offhand', 'head', 'back', 'accessory'] as EquipSlot[]) {
    const it = catalog.find((x) => x.slug === eq[slot]);
    if (it && ITEM_TYPES[it.type].slot === slot && owned(it.slug)) out = equip(out, it, catalog);
  }
  return out;
}

/** Bônus de atributos (%) do que está equipado, já com a raridade. */
export function equipmentBonus(eq: Equipped, catalog: ItemDef[]): Partial<Record<AttrKey, number>> {
  const out: Partial<Record<AttrKey, number>> = {};
  for (const slug of Object.values(eq)) {
    const it = catalog.find((x) => x.slug === slug);
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats)) out[k as AttrKey] = Math.round(((out[k as AttrKey] ?? 0) + (v as number) * RARITIES[it.rarity].statMul) * 10) / 10;
  }
  return out;
}

/** Golpe básico com a arma (ou desarmado). */
export function basicAttack(weapon: ItemDef | null, species?: SpeciesKey | null): WeaponProfile & { affinity: number; label: string } {
  const w = weapon ? ITEM_TYPES[weapon.type].weapon : undefined;
  const base: WeaponProfile = w ?? { anim: 'attack', range: 1.2, cadence: 1.3, power: 0.6, twoHanded: false, ranged: 'none' };
  const affinity = weapon && species && CLASS_WEAPONS[species].includes(weapon.type) ? 1.05 : 1;
  return { ...base, power: base.power * affinity, affinity, label: weapon ? ITEM_TYPES[weapon.type].label : 'Desarmado' };
}

// ---------------------------------------------------------------------------
// Arco: tiro carregado
// ---------------------------------------------------------------------------

export const BOW_MAX_CHARGE = 1.6;     // s para carga cheia
export const BOW_MIN_CHARGE = 0.12;    // menos que isso = tiro fraco

/**
 * Tiro do arco depois de segurar `held` segundos. A carga cresce rápido no começo e depois desacelera (curva suave);
 * no fim, uma janela de "carga perfeita" (≥ 95%) dá um bônus — o efeito brilha diferente para avisar.
 */
export function bowShot(held: number, baseRange = 16, basePower = 1) {
  const c = Math.max(0, Math.min(1, (held - BOW_MIN_CHARGE) / (BOW_MAX_CHARGE - BOW_MIN_CHARGE)));
  const k = 1 - Math.pow(1 - c, 2);              // ease-out
  const perfect = c >= 0.95;
  return {
    charge: c,
    perfect,
    range: Math.round((0.3 + 0.7 * k) * baseRange * 10) / 10,          // 30% → 100% do alcance
    power: Math.round((0.5 + 1.5 * k + (perfect ? 0.25 : 0)) * basePower * 100) / 100, // 0,5× → 2× (+0,25 perfeita)
    speed: Math.round((10 + 16 * k) * 10) / 10,                          // m/s da flecha
  };
}

// ---------------------------------------------------------------------------

const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const ELEMENT_KEYS: Element[] = ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza'];
const ATTRS: AttrKey[] = ['vida', 'energia', 'poder', 'defesa', 'agilidade', 'sintonia'];

export function sanitizeItem(input: unknown): ItemDef | null {
  const s = (input ?? {}) as Partial<ItemDef>;
  if (typeof s.slug !== 'string' || !SLUG.test(s.slug)) return null;
  const type = (s.type && s.type in ITEM_TYPES ? s.type : 'espada') as ItemType;
  const p = (s.proc ?? {}) as Partial<ItemDef['proc']>;
  const g = (s.grip ?? {}) as Partial<ItemDef['grip']>;
  const v3 = (a: unknown, lo: number, hi: number): [number, number, number] => { const x = Array.isArray(a) ? a : []; return [n(x[0], lo, hi, 0), n(x[1], lo, hi, 0), n(x[2], lo, hi, 0)]; };
  const stats: ItemDef['stats'] = {};
  for (const k of ATTRS) { const v = Number((s.stats as Record<string, unknown> | undefined)?.[k]); if (Number.isFinite(v) && v !== 0) stats[k] = Math.max(-20, Math.min(40, Math.round(v))); }
  return {
    slug: s.slug,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : s.slug,
    description: typeof s.description === 'string' ? s.description.slice(0, 200) : '',
    type,
    rarity: (s.rarity && s.rarity in RARITIES ? s.rarity : 'comum') as Rarity,
    essence: s.essence && ELEMENT_KEYS.includes(s.essence) ? s.essence : null,
    stats,
    proc: {
      primary: typeof p.primary === 'string' && HEX.test(p.primary) ? p.primary : '#b98c5c',
      secondary: typeof p.secondary === 'string' && HEX.test(p.secondary) ? p.secondary : '#e8e2d0',
      metal: typeof p.metal === 'string' && HEX.test(p.metal) ? p.metal : '#c9d2e0',
      gem: !!p.gem, variant: Math.round(n(p.variant, 0, 2, 0)),
    },
    model: s.model && typeof s.model.url === 'string' && /^(https:\/\/|\/)/.test(s.model.url) ? { url: s.model.url, path: typeof s.model.path === 'string' ? s.model.path : undefined } : undefined,
    look: sanitizeLook(s.look),
    grip: { pos: v3(g.pos, -0.5, 0.5), rot: v3(g.rot, -Math.PI, Math.PI), scale: n(g.scale, 0.2, 3, 1) },
    ...(() => {
      const src = (s.gripByModel ?? {}) as Record<string, Partial<ItemDef['grip']>>, out: Record<string, ItemDef['grip']> = {};
      for (const [k, gg] of Object.entries(src).slice(0, 60)) if (/^[0-9a-f-]{8,40}$/i.test(k) && gg && typeof gg === 'object') out[k] = { pos: v3(gg.pos, -0.5, 0.5), rot: v3(gg.rot, -Math.PI, Math.PI), scale: n(gg.scale, 0.2, 3, 1) };
      return Object.keys(out).length ? { gripByModel: out } : {};
    })(),
    starter: s.starter === true,
    obtain: typeof s.obtain === 'string' ? s.obtain.slice(0, 80) : '',
    recipe: {
      ingredients: (Array.isArray(s.recipe?.ingredients) ? s.recipe!.ingredients : []).slice(0, 8)
        .filter((g) => g && typeof g.item === 'string' && g.item.trim()).map((g) => ({ item: g.item.trim().slice(0, 40), qty: Math.round(n(g.qty, 1, 99, 1)) })),
      minBond: Math.round(n(s.recipe?.minBond, 1, 20, 2)), seconds: Math.round(n(s.recipe?.seconds, 0, 3600, 30)),
    },
  };
}
