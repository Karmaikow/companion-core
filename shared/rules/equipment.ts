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
import { TIERS, cleanTier, tierOf, tierBlock, type Tier } from './tiers.ts';

export type Rarity = 'comum' | 'incomum' | 'rara' | 'lendaria';
export type Bone = 'mao_direita' | 'mao_esquerda' | 'cabeca' | 'peito' | 'nenhum';

/** Os quatro tipos de item da bolsa. */
export type ItemCategory = 'material' | 'diversos' | 'equipamento' | 'arma';
export const ITEM_CATEGORIES: Record<ItemCategory, { label: string; hint: string; icon: string }> = {
  material: { label: 'Materiais', hint: 'coleta e drops: madeira, minério, ervas, partes de monstro; vão para receitas e para a Forja', icon: '🪵' },
  diversos: { label: 'Diversos', hint: 'itens normais: comida, poções, chaves, lembranças e descobertas', icon: '🎁' },
  equipamento: { label: 'Equipamentos', hint: 'para vestir: chapéu, armadura, sapatos, capa, acessórios e escudos', icon: '🛡' },
  arma: { label: 'Armas', hint: 'mão direita e, se for de uma mão, também a esquerda', icon: '⚔' },
};

/** Os oito espaços do equipamento, na ordem do boneco. */
export type EquipSlot = 'head' | 'cape' | 'acc1' | 'acc2' | 'armor' | 'mainhand' | 'offhand' | 'feet';
export const EQUIP_SLOTS: EquipSlot[] = ['head', 'acc1', 'acc2', 'cape', 'armor', 'mainhand', 'offhand', 'feet'];
export const SLOTS_EQ: Record<EquipSlot, { label: string; short: string; bone: Bone }> = {
  head: { label: 'Chapéu', short: 'Cabeça', bone: 'cabeca' },
  acc1: { label: 'Acessório 1', short: 'Acess. 1', bone: 'nenhum' },
  acc2: { label: 'Acessório 2', short: 'Acess. 2', bone: 'nenhum' },
  cape: { label: 'Capa', short: 'Costas', bone: 'peito' },
  armor: { label: 'Armadura', short: 'Corpo', bone: 'nenhum' },
  mainhand: { label: 'Mão direita (arma)', short: 'Mão dir.', bone: 'mao_direita' },
  offhand: { label: 'Mão esquerda (arma secundária ou escudo)', short: 'Mão esq.', bone: 'mao_esquerda' },
  feet: { label: 'Sapatos', short: 'Pés', bone: 'nenhum' },
};

export interface WeaponProfile {
  anim: AnimKind;          // animação do ataque
  range: number;           // alcance do golpe básico (m)
  cadence: number;         // ataques por segundo
  power: number;           // multiplicador do dano do golpe básico
  twoHanded: boolean;      // ocupa a mão secundária
  ranged: 'none' | 'magic' | 'charged';
}

export interface TypeInfo { label: string; category: ItemCategory; slot: EquipSlot | null; weapon?: WeaponProfile; size: number; weight: number }
const W = (label: string, size: number, weight: number, weapon: WeaponProfile): TypeInfo => ({ label, category: 'arma', slot: 'mainhand', weapon, size, weight });
const E = (label: string, slot: EquipSlot, size: number, weight: number): TypeInfo => ({ label, category: 'equipamento', slot, size, weight });
const M = (label: string, weight: number): TypeInfo => ({ label, category: 'material', slot: null, size: 0.3, weight });
const D = (label: string, weight: number): TypeInfo => ({ label, category: 'diversos', slot: null, size: 0.25, weight });

/** Tipos de item: categoria, espaço (se veste), golpe (se é arma), tamanho na mão e peso padrão (kg). */
const TYPES = {
  espada: W('Espada', 0.75, 2.5, { anim: 'attack', range: 1.7, cadence: 1.1, power: 1.0, twoHanded: false, ranged: 'none' }),
  faca: W('Faca / adaga', 0.38, 0.8, { anim: 'attack', range: 1.3, cadence: 1.7, power: 0.7, twoHanded: false, ranged: 'none' }),
  maca: W('Maça', 0.65, 4, { anim: 'attack', range: 1.6, cadence: 0.75, power: 1.45, twoHanded: false, ranged: 'none' }),
  lanca: W('Lança', 1.35, 3, { anim: 'attack', range: 2.4, cadence: 0.95, power: 1.05, twoHanded: true, ranged: 'none' }),
  cajado: W('Cajado', 1.25, 2, { anim: 'cast', range: 7, cadence: 0.8, power: 1.1, twoHanded: true, ranged: 'magic' }),
  varinha: W('Varinha', 0.36, 0.4, { anim: 'cast', range: 6, cadence: 1.2, power: 0.75, twoHanded: false, ranged: 'magic' }),
  arco: W('Arco', 0.95, 1.5, { anim: 'shoot', range: 16, cadence: 0.7, power: 1.0, twoHanded: true, ranged: 'charged' }),
  escudo: E('Escudo', 'offhand', 0.55, 4),
  grimorio: E('Grimório', 'offhand', 0.28, 1),
  orbe: E('Orbe', 'offhand', 0.2, 0.5),
  chapeu: E('Chapéu', 'head', 0.42, 0.4),
  tiara: E('Tiara', 'head', 0.26, 0.2),
  laco: E('Laço', 'head', 0.2, 0.05),
  coroa: E('Coroa de flores', 'head', 0.3, 0.1),
  elmo: E('Elmo', 'head', 0.38, 2),
  armadura: E('Armadura', 'armor', 0.6, 8),
  tunica: E('Túnica / veste', 'armor', 0.6, 1.5),
  botas: E('Botas / sapatos', 'feet', 0.25, 1.2),
  capa: E('Capa', 'cape', 0.7, 1),
  mochila: E('Mochila', 'cape', 0.36, 1.5),
  aljava: E('Aljava', 'cape', 0.5, 1),
  amuleto: E('Amuleto', 'acc1', 0.1, 0.1),
  anel: E('Anel', 'acc1', 0.05, 0.02),
  bracelete: E('Bracelete', 'acc1', 0.1, 0.15),
  madeira: M('Madeira', 1),
  minerio: M('Minério / metal', 1.5),
  pedra: M('Pedra', 2),
  fibra: M('Fibra / couro / pelo', 0.3),
  erva: M('Erva / planta', 0.1),
  gema: M('Gema / cristal', 0.2),
  essencia: M('Essência', 0.05),
  parte: M('Parte de monstro', 0.4),
  comida: D('Comida', 0.3),
  pocao: D('Poção', 0.3),
  chave: D('Chave', 0.05),
  lembranca: D('Lembrança', 0.1),
  outro: D('Outro', 0.2),
} satisfies Record<string, TypeInfo>;
export type ItemType = keyof typeof TYPES;
export const ITEM_TYPES: Record<ItemType, TypeInfo> = TYPES;
export const categoryOf = (t: ItemType): ItemCategory => ITEM_TYPES[t].category;
/** Pode ser vestido/empunhado? */
export const isWearable = (t: ItemType) => ITEM_TYPES[t].slot !== null;
/** Espaços onde o item entra: arma de uma mão vai também na mão esquerda (arma secundária); acessório em qualquer um dos dois. */
export function slotsFor(t: ItemType): EquipSlot[] {
  const i = ITEM_TYPES[t];
  if (!i.slot) return [];
  if (i.weapon) return i.weapon.twoHanded ? ['mainhand'] : ['mainhand', 'offhand'];
  if (i.slot === 'acc1' || i.slot === 'acc2') return ['acc1', 'acc2'];
  return [i.slot];
}

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
  /** tier (T1–T5): progressão do item; sem valor, vale o da raridade (ver tiers.ts) */
  tier?: Tier;
  essence: Element | null;
  /** peso (kg): soma na carga do Companion */
  weight: number;
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
  slug, name, type, rarity: 'rara', essence: null, stats: {}, weight: ITEM_TYPES[type].weight, proc: { primary: '#b98c5c', secondary: '#e8e2d0', metal: '#c9d2e0', gem: false, variant: 0 },
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
  // equipamentos novos (oito espaços): armadura, sapatos, capa e acessórios — um de cada elemento para os conjuntos
  I('veste-de-casca', 'Veste de Casca', 'armadura', { recipe: R([['Musgo macio', 4], ['Fragmento de Bruma', 3]], 3), description: 'Placas de casca de árvore costuradas com musgo.', stats: { defesa: 5, agilidade: -1 }, essence: 'terra', rarity: 'incomum', proc: { primary: '#7a5a3a', secondary: '#6fbf5a', metal: '#c9a36a', gem: false, variant: 0 } }),
  I('botas-de-vento', 'Botas de Vento', 'botas', { recipe: R([['Pelo gelado', 2], ['Fragmento de Bruma', 2]], 2), description: 'Leves como uma brisa.', stats: { agilidade: 3 }, essence: 'vento', rarity: 'incomum', proc: { primary: '#d8e8f0', secondary: '#7ab8d8', metal: '#e7d3a8', gem: false, variant: 0 } }),
  I('capa-do-orvalho', 'Capa do Orvalho', 'capa', { recipe: R([['Musgo macio', 2], ['Semente brilhante', 1], ['Fragmento de Bruma', 2]], 3), description: 'Sempre um pouco úmida, sempre fresca.', stats: { energia: 3 }, essence: 'agua', rarity: 'incomum', proc: { primary: '#4a7ab8', secondary: '#bfe9ff', metal: '#e7d3a8', gem: false, variant: 0 } }),
  I('anel-de-brasa', 'Anel de Brasa', 'anel', { recipe: R([['Pó de brasa', 3], ['Fragmento de Bruma', 2]], 3), description: 'Morno ao toque.', stats: { poder: 2 }, essence: 'fogo', rarity: 'incomum', proc: { primary: '#ffb347', secondary: '#ff5a3a', metal: '#ffd56b', gem: true, variant: 0 } }),
  // materiais (drops dos monstros): o nome é o mesmo dos drops do Invocador, então o drop cai na bolsa como este item
  I('fragmento-de-bruma', 'Fragmento de Bruma', 'essencia', { description: 'O que sobra de uma Bruma acalmada. Ingrediente de quase tudo na Forja.', rarity: 'comum', recipe: R([], 1, 0), obtain: 'Drop de monstro', proc: { primary: '#c9b8ff', secondary: '#ffffff', metal: '#c9b8ff', gem: true, variant: 0 } }),
  I('musgo-macio', 'Musgo macio', 'erva', { description: 'Verde, fofo e úmido.', rarity: 'comum', essence: 'natureza', recipe: R([], 1, 0), obtain: 'Drop de monstro', proc: { primary: '#6fbf5a', secondary: '#3f7a3a', metal: '#6fbf5a', gem: false, variant: 0 } }),
  I('semente-brilhante', 'Semente brilhante', 'erva', { description: 'Pisca devagar, como se respirasse.', rarity: 'incomum', essence: 'luz', recipe: R([], 1, 0), obtain: 'Drop de monstro', proc: { primary: '#ffe68a', secondary: '#7be36b', metal: '#ffe68a', gem: true, variant: 0 } }),
  I('po-de-brasa', 'Pó de brasa', 'essencia', { description: 'Esquenta a palma da mão.', rarity: 'comum', essence: 'fogo', recipe: R([], 1, 0), obtain: 'Drop de monstro', proc: { primary: '#ff8a3a', secondary: '#ffd56b', metal: '#ff8a3a', gem: false, variant: 0 } }),
  I('pelo-gelado', 'Pelo gelado', 'fibra', { description: 'Macio e frio, não derrete.', rarity: 'comum', essence: 'gelo', recipe: R([], 1, 0), obtain: 'Drop de monstro', proc: { primary: '#d8f4ff', secondary: '#a8e4ff', metal: '#d8f4ff', gem: false, variant: 0 } }),
  I('cristal-de-geada', 'Cristal de geada', 'gema', { description: 'Raro: nunca perde o frio.', rarity: 'rara', essence: 'gelo', recipe: R([], 1, 0), obtain: 'Drop de monstro', proc: { primary: '#bfe9ff', secondary: '#ffffff', metal: '#bfe9ff', gem: true, variant: 0 } }),
  // Distorcidos (families.ts): do mais comum ao drop de MVP
  I('lasca-rachada', 'Lasca rachada', 'gema', { description: 'Um caco do Cristal Ápice com a luz azedada em violeta. Morna ao toque.', rarity: 'comum', essence: 'sombra', recipe: R([], 1, 0), obtain: 'Drop de monstro (Distorcidos)', proc: { primary: '#c4a6ff', secondary: '#f1e6ff', metal: '#c4a6ff', gem: true, variant: 0 } }),
  I('po-prismatico', 'Pó prismático', 'essencia', { description: 'Brilha nas sete cores e mancha tudo de lilás. Os Distorcidos o soltam quando a fenda fecha.', rarity: 'incomum', essence: 'sombra', recipe: R([], 1, 0), obtain: 'Drop de monstro (Distorcidos)', proc: { primary: '#d9b8ff', secondary: '#9ff0ff', metal: '#d9b8ff', gem: false, variant: 1 } }),
  I('nucleo-fendido', 'Núcleo fendido', 'parte', { description: 'O miolo de um Distorcido crescido. Ainda pulsa, devagar, no ritmo do Cristal Ápice.', rarity: 'rara', essence: 'sombra', recipe: R([], 1, 0), obtain: 'Drop de monstro (Distorcidos adultos e acima)', proc: { primary: '#8457ff', secondary: '#ff9ae6', metal: '#8457ff', gem: true, variant: 2 } }),
  I('coracao-do-cristal-rachado', 'Coração do Cristal Rachado', 'gema', { description: 'Só o Coração Rachado e, muito raramente, a Matriarca carregam um destes. Dizem que encaixa de volta no Cristal Ápice.', rarity: 'lendaria', essence: 'sombra', recipe: R([], 1, 0), obtain: 'Drop de MVP (O Coração Rachado)', proc: { primary: '#ff5ad1', secondary: '#ffffff', metal: '#ff5ad1', gem: true, variant: 0 } }),
];

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Equipamento: oito espaços
// ---------------------------------------------------------------------------

export type Equipped = Partial<Record<EquipSlot, string>>;
/** Nomes antigos dos espaços (cinco espaços, até 24/10) → os de agora. */
const OLD_SLOTS: Record<string, EquipSlot> = { weapon: 'mainhand', offhand: 'offhand', head: 'head', back: 'cape', accessory: 'acc1' };

/** Lê um conjunto salvo (com os nomes de agora ou os antigos). */
export function normalizeEquipped(raw: unknown): Equipped {
  const out: Equipped = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'string' || !v) continue;
    const slot = (EQUIP_SLOTS as string[]).includes(k) ? (k as EquipSlot) : OLD_SLOTS[k];
    if (slot && !out[slot]) out[slot] = v;
  }
  return out;
}

/**
 * Equipar: o item vai para o espaço pedido (ou o primeiro livre dos que aceitam); a mesma peça não fica em dois
 * espaços; arma de duas mãos libera a mão esquerda, e o que vai para a mão esquerda tira a arma de duas mãos.
 */
export function equip(current: Equipped, item: ItemDef, catalog: ItemDef[], slot?: EquipSlot): Equipped {
  const allowed = slotsFor(item.type);
  if (!allowed.length) return current;
  const target = slot && allowed.includes(slot) ? slot : allowed.find((s) => !current[s]) ?? allowed[0];
  const next: Equipped = { ...current };
  for (const k of EQUIP_SLOTS) if (next[k] === item.slug) delete next[k];
  next[target] = item.slug;
  const main = catalog.find((x) => x.slug === next.mainhand);
  if (target === 'mainhand' && ITEM_TYPES[item.type].weapon?.twoHanded) delete next.offhand;
  if (target === 'offhand' && main && ITEM_TYPES[main.type].weapon?.twoHanded) delete next.mainhand;
  return next;
}

/** Tira o que estiver no espaço. */
export function unequip(current: Equipped, slot: EquipSlot): Equipped {
  const next = { ...current }; delete next[slot]; return next;
}

/** Confere um conjunto salvo (itens que existem, no espaço certo, que a pessoa tem, sem conflito de duas mãos). */
/** `bond`: com o vínculo, tira o que o tier ainda não deixa vestir. */
export function validateEquipped(raw: unknown, catalog: ItemDef[], owned: (slug: string) => boolean, bond?: number): Equipped {
  const eq = normalizeEquipped(raw);
  let out: Equipped = {};
  for (const slot of EQUIP_SLOTS) {
    const it = catalog.find((x) => x.slug === eq[slot]);
    if (it && slotsFor(it.type).includes(slot) && owned(it.slug) && (bond === undefined || !tierBlock(it, bond))) out = equip(out, it, catalog, slot);
  }
  return out;
}

/** As peças equipadas (com o espaço de cada uma). */
export function equippedItems(eq: Equipped, catalog: ItemDef[]): { slot: EquipSlot; item: ItemDef }[] {
  const out: { slot: EquipSlot; item: ItemDef }[] = [];
  for (const slot of EQUIP_SLOTS) { const it = catalog.find((x) => x.slug === eq[slot]); if (it) out.push({ slot, item: it }); }
  return out;
}

// ---------------------------------------------------------------------------
// Conjuntos de elemento: quanto mais peças da mesma essência, maior o bônus
// ---------------------------------------------------------------------------

/** Bônus por "degrau" de cada elemento (em %); o degrau multiplica (2 peças ×1, 4 ×2,5, 6 ×4,5). */
export const ELEMENT_SETS: Record<Element, { label: string; stats: Partial<Record<AttrKey, number>>; note: string }> = {
  fogo: { label: 'Conjunto da Chama', stats: { poder: 4 }, note: 'mais dano' },
  agua: { label: 'Conjunto da Maré', stats: { energia: 4, vida: 2 }, note: 'mais SP e um pouco de vida' },
  terra: { label: 'Conjunto da Rocha', stats: { defesa: 5 }, note: 'mais defesa' },
  vento: { label: 'Conjunto do Vento', stats: { agilidade: 5 }, note: 'mais agilidade (golpes e passos mais rápidos)' },
  luz: { label: 'Conjunto da Aurora', stats: { sintonia: 4, vida: 2 }, note: 'mais sintonia (magia e cura) e vida' },
  sombra: { label: 'Conjunto da Penumbra', stats: { poder: 3, agilidade: 2 }, note: 'dano e agilidade' },
  gelo: { label: 'Conjunto da Geada', stats: { defesa: 3, vida: 3 }, note: 'defesa e vida' },
  raio: { label: 'Conjunto da Tempestade', stats: { agilidade: 3, poder: 2 }, note: 'agilidade e dano' },
  natureza: { label: 'Conjunto do Bosque', stats: { vida: 5 }, note: 'mais vida' },
  veneno: { label: 'Conjunto da Peçonha', stats: { poder: 2, sintonia: 3 }, note: 'dano e sintonia' },
};
export const SET_TIERS: { pieces: number; mul: number }[] = [{ pieces: 2, mul: 1 }, { pieces: 4, mul: 2.5 }, { pieces: 6, mul: 4.5 }];

export interface ActiveSet { element: Element; pieces: number; tier: number; next: number | null; bonus: Partial<Record<AttrKey, number>> }
/** Elementos das peças equipadas: quantas de cada e o bônus que já vale (tier 0 = ainda sem bônus). */
export function elementSets(eq: Equipped, catalog: ItemDef[]): ActiveSet[] {
  const count = new Map<Element, number>();
  for (const { item } of equippedItems(eq, catalog)) if (item.essence) count.set(item.essence, (count.get(item.essence) ?? 0) + 1);
  return [...count.entries()].map(([element, pieces]) => {
    let tier = 0;
    SET_TIERS.forEach((t, i) => { if (pieces >= t.pieces) tier = i + 1; });
    const mul = tier ? SET_TIERS[tier - 1].mul : 0;
    const bonus: Partial<Record<AttrKey, number>> = {};
    for (const [k, v] of Object.entries(ELEMENT_SETS[element].stats)) if (mul) bonus[k as AttrKey] = Math.round((v as number) * mul * 10) / 10;
    return { element, pieces, tier, next: SET_TIERS[tier]?.pieces ?? null, bonus };
  }).sort((a, b) => b.pieces - a.pieces);
}

/** Bônus de atributos (%) do que está equipado: cada peça (× raridade) + os conjuntos de elemento. */
export function equipmentBonus(eq: Equipped, catalog: ItemDef[]): Partial<Record<AttrKey, number>> {
  const out: Partial<Record<AttrKey, number>> = {};
  const add = (k: AttrKey, v: number) => { out[k] = Math.round(((out[k] ?? 0) + v) * 10) / 10; };
  for (const { item } of equippedItems(eq, catalog)) for (const [k, v] of Object.entries(item.stats)) add(k as AttrKey, (v as number) * RARITIES[item.rarity].statMul * TIERS[tierOf(item)].stat);
  for (const s of elementSets(eq, catalog)) for (const [k, v] of Object.entries(s.bonus)) add(k as AttrKey, v as number);
  return out;
}

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

/**
 * Quanto o Companion carrega sem perder ritmo (kg): base 90 + 6 por ponto de Força + 3 de Vitalidade + 1,5 por nível
 * de vínculo; a mochila soma 45. (Era um terço disso: a bolsa enchia rápido demais.)
 */
export const MOCHILA_CAPACITY = 45;
export const CARRY_PER_BOND = 1.5;
export function carryCapacity(attrs: { forca?: number; vitalidade?: number }, eq?: Equipped, catalog?: ItemDef[], bond = 0): number {
  const backpack = eq && catalog ? equippedItems(eq, catalog).some(({ item }) => item.type === 'mochila') : false;
  return Math.round((90 + 6 * (attrs.forca ?? 0) + 3 * (attrs.vitalidade ?? 0) + CARRY_PER_BOND * Math.max(0, bond) + (backpack ? MOCHILA_CAPACITY : 0)) * 10) / 10;
}

export type LoadLevel = 'leve' | 'pesado' | 'sobrecarregado';
export const LOAD_LABEL: Record<LoadLevel, string> = { leve: 'Leve', pesado: 'Pesado: anda e golpeia um pouco mais devagar', sobrecarregado: 'Sobrecarregado: anda e golpeia bem mais devagar' };
/** Efeito da carga (tudo o que leva: bolsa + equipado) sobre o passo e a agilidade. */
export function loadState(carried: number, capacity: number): { ratio: number; level: LoadLevel; moveMul: number; agilityPct: number } {
  const ratio = capacity > 0 ? carried / capacity : 0;
  if (ratio <= 1) return { ratio, level: 'leve', moveMul: 1, agilityPct: 0 };
  if (ratio <= 1.5) return { ratio, level: 'pesado', moveMul: 0.8, agilityPct: -10 };
  return { ratio, level: 'sobrecarregado', moveMul: 0.55, agilityPct: -25 };
}

// ---------------------------------------------------------------------------
// Bolsa (inventário): linhas guardadas → itens do catálogo
// ---------------------------------------------------------------------------

const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** Item do catálogo pelo slug ou pelo nome (os drops do Invocador são nomes). */
export function findItem(ref: string, catalog: ItemDef[]): ItemDef | null {
  const f = fold(ref);
  return catalog.find((i) => i.slug === ref) ?? catalog.find((i) => fold(i.name) === f) ?? null;
}
/** Chave da bolsa de um drop: o slug do item do catálogo, ou "drop:<nome>" para um nome que não está no catálogo. */
export const dropKey = (ref: string, catalog: ItemDef[]) => findItem(ref, catalog)?.slug ?? 'drop:' + ref.trim().slice(0, 40);

export interface BagRow { item_key: string; qty: number; meta: Record<string, unknown> }
export interface BagEntry { key: string; item: ItemDef | null; label: string; description: string; category: ItemCategory; qty: number; unitWeight: number; rarity: Rarity; essence: Element | null }
/**
 * Linhas da bolsa (servidor) → entradas com categoria e peso. Item do catálogo usa os dados dele; um drop fora do
 * catálogo vira material de 0,2 kg; descobertas e raros das quests são Diversos sem peso (lembranças).
 */
export function bagEntries(rows: BagRow[], catalog: ItemDef[]): BagEntry[] {
  return rows.filter((r) => r.qty > 0).map((r) => {
    const it = r.item_key.startsWith('drop:') ? findItem(r.item_key.slice(5), catalog) : catalog.find((i) => i.slug === r.item_key) ?? null;
    if (it) return { key: r.item_key, item: it, label: it.name, description: it.description, category: categoryOf(it.type), qty: r.qty, unitWeight: itemWeight(it), rarity: it.rarity, essence: it.essence };
    const isDrop = r.item_key.startsWith('drop:');
    const label = String(r.meta.label ?? (isDrop ? r.item_key.slice(5) : r.item_key));
    return { key: r.item_key, item: null, label, description: String(r.meta.description ?? (isDrop ? 'Drop de monstro.' : '')), category: isDrop ? 'material' : 'diversos', qty: r.qty, unitWeight: isDrop ? 0.2 : 0, rarity: r.meta.rare ? 'rara' : 'comum', essence: null };
  });
}

/** Peso (kg) de um item do catálogo. */
export const itemWeight = (it: Pick<ItemDef, 'weight' | 'type'>) => (Number.isFinite(it.weight) ? it.weight : ITEM_TYPES[it.type].weight);

/** Golpe básico com a arma (ou desarmado). */
export function basicAttack(weapon: ItemDef | null, species?: SpeciesKey | null): WeaponProfile & { affinity: number; label: string } {
  const w = weapon ? ITEM_TYPES[weapon.type].weapon : undefined;
  const base: WeaponProfile = w ?? { anim: 'attack', range: 1.2, cadence: 1.3, power: 0.6, twoHanded: false, ranged: 'none' };
  const affinity = weapon && species && CLASS_WEAPONS[species].includes(weapon.type) ? 1.05 : 1;
  const tier = weapon ? TIERS[tierOf(weapon)].power : 1;
  return { ...base, power: base.power * affinity * tier, affinity, label: weapon ? ITEM_TYPES[weapon.type].label : 'Desarmado' };
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
const ELEMENT_KEYS: Element[] = ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza', 'veneno'];
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
    ...(cleanTier(s.tier) ? { tier: cleanTier(s.tier) } : {}),
    essence: s.essence && ELEMENT_KEYS.includes(s.essence) ? s.essence : null,
    weight: Math.round(n(s.weight, 0, 500, ITEM_TYPES[type].weight) * 100) / 100,
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
