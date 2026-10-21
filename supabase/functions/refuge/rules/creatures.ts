/**
 * Invocador de Monstros — o catálogo de criaturas do Companion World (no design de batalha, as "Brumas": criaturas
 * tomadas por névoa que são acalmadas, não mortas). Cada criatura tem modelo ou imagem, aparência, essência,
 * arquétipo, temperamento, atributos, habilidades da Forja com frequência, biomas onde aparece e o que pode soltar.
 * Funções puras: o mesmo sorteio de aparições no cliente e, no MVP 2, no servidor do mundo.
 */
import type { Element } from './identity.ts';
import type { BodyPlan } from './art.ts';
import { sanitizeLook, type ModelLook } from './look.ts';

export type Archetype = 'investidora' | 'atiradora' | 'guardia' | 'enxame' | 'ancestral';
export type Temperament = 'agressivo' | 'territorial' | 'passivo' | 'medroso';
export type BattleStyle = 'corpo-a-corpo' | 'distancia' | 'suporte' | 'misto';
export type TimeOfDay = 'sempre' | 'dia' | 'noite';

export const ARCHETYPES: Record<Archetype, { label: string; hint: string }> = {
  investidora: { label: 'Investidora', hint: 'marca uma linha no chão e avança' },
  atiradora: { label: 'Atiradora', hint: 'mantém distância e atira projéteis lentos' },
  guardia: { label: 'Guardiã', hint: 'escudo na frente; abre depois de atacar' },
  enxame: { label: 'Enxame', hint: 'vem em grupo, cada uma com pouca vida' },
  ancestral: { label: 'Ancestral (chefe)', hint: '2–3 fases, mistura padrões' },
};
export const TEMPERAMENTS: Record<Temperament, { label: string; hint: string }> = {
  agressivo: { label: 'Agressivo', hint: 'vem até o Companion quando o vê' },
  territorial: { label: 'Territorial', hint: 'só ataca quem chega perto do seu canto' },
  passivo: { label: 'Passivo', hint: 'só luta se provocado' },
  medroso: { label: 'Medroso', hint: 'foge quando o Companion se aproxima' },
};
export const BATTLE_STYLES: Record<BattleStyle, string> = { 'corpo-a-corpo': 'Corpo a corpo', distancia: 'À distância', suporte: 'Suporte (cura/protege o grupo)', misto: 'Misto' };
export const TIMES: Record<TimeOfDay, string> = { sempre: 'Dia e noite', dia: 'Só de dia', noite: 'Só à noite' };

/** vida, ataque (poder), defesa e agilidade no nível 1; velocidade de ataque em golpes por segundo. */
export interface CreatureStats { vida: number; poder: number; defesa: number; agilidade: number; atkSpeed: number }
/** Habilidade do monstro: frequência, nível em que abre e (opcional) a habilidade que precisa vir antes — a árvore. */
export interface CreatureSkill { slug: string; weight: number; level: number; after?: string }
export interface CreatureDef {
  slug: string;
  name: string;
  description: string;
  essence: Element | null;
  body: BodyPlan;
  archetype: Archetype;
  temperament: Temperament;
  style: BattleStyle;
  level: [number, number];
  stats: CreatureStats;          // no nível 1; crescem ~8% por nível
  size: number;                  // altura em metros
  speed: number;                 // m/s andando
  aggroRange: number;            // m — a que distância percebe o Companion
  skills: CreatureSkill[];       // habilidades da Forja: frequência, nível que abre e pré-requisito (árvore)
  biomes: { slug: string; weight: number }[]; // vazio = qualquer região do mundo
  time: TimeOfDay;
  group: [number, number];
  rarity: number;                // 0,05 (rara) .. 1 (comum)
  drops: { item: string; chance: number; min: number; max: number }[];
  color: string;                 // cor da criatura (corpo de reserva, brilho, partículas)
  look?: ModelLook;
  model?: { url: string; path?: string; anims: { url: string; path?: string; kind: string; name: string }[] };
  art?: { url: string; path?: string };
}

const ELEMENT_KEYS: Element[] = ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza'];
const BODY_KEYS: BodyPlan[] = ['quadruped', 'biped', 'avian', 'serpentine', 'aquatic'];
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const URL_OK = /^(https:\/\/|\/)/;
const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const pair = (v: unknown, lo: number, hi: number, d: [number, number]): [number, number] => {
  const a = Array.isArray(v) ? v : []; const x = Math.round(n(a[0], lo, hi, d[0])), y = Math.round(n(a[1], lo, hi, d[1]));
  return [Math.min(x, y), Math.max(x, y)];
};

export function sanitizeCreature(input: unknown): CreatureDef | null {
  const c = (input ?? {}) as Partial<CreatureDef>;
  if (typeof c.slug !== 'string' || !SLUG.test(c.slug)) return null;
  const st = (c.stats ?? {}) as Partial<CreatureStats>;
  const list = <T,>(v: unknown, max: number, f: (x: Record<string, unknown>) => T | null): T[] => (Array.isArray(v) ? v.slice(0, max).map((x) => f((x ?? {}) as Record<string, unknown>)).filter((x): x is T => !!x) : []);
  const m = c.model && typeof c.model.url === 'string' && URL_OK.test(c.model.url) ? {
    url: c.model.url, path: typeof c.model.path === 'string' ? c.model.path : undefined,
    anims: list(c.model.anims, 16, (a) => (typeof a.url === 'string' && URL_OK.test(a.url) ? { url: a.url, path: typeof a.path === 'string' ? a.path : undefined, kind: String(a.kind ?? 'special'), name: String(a.name ?? '').slice(0, 60) } : null)),
  } : undefined;
  return {
    slug: c.slug,
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 50) : c.slug,
    description: typeof c.description === 'string' ? c.description.slice(0, 300) : '',
    essence: c.essence && ELEMENT_KEYS.includes(c.essence) ? c.essence : null,
    body: c.body && BODY_KEYS.includes(c.body) ? c.body : 'quadruped',
    archetype: c.archetype && c.archetype in ARCHETYPES ? c.archetype : 'investidora',
    temperament: c.temperament && c.temperament in TEMPERAMENTS ? c.temperament : 'passivo',
    style: c.style && c.style in BATTLE_STYLES ? c.style : 'corpo-a-corpo',
    level: pair(c.level, 1, 60, [1, 3]),
    stats: { vida: Math.round(n(st.vida, 10, 5000, 120)), poder: Math.round(n(st.poder, 1, 500, 20)), defesa: Math.round(n(st.defesa, 0, 500, 15)), agilidade: Math.round(n(st.agilidade, 1, 100, 10)), atkSpeed: Math.round(n(st.atkSpeed, 0.1, 4, 0.8) * 100) / 100 },
    size: n(c.size, 0.2, 12, 0.9), speed: n(c.speed, 0.2, 6, 1.2), aggroRange: n(c.aggroRange, 1, 30, 7),
    skills: (() => {
      const l = list(c.skills, 12, (s) => (typeof s.slug === 'string' && SLUG.test(s.slug) ? { slug: s.slug, weight: n(s.weight, 0, 10, 1), level: Math.round(n(s.level, 1, 60, 1)), ...(typeof s.after === 'string' && SLUG.test(s.after) ? { after: s.after } : {}) } : null));
      const slugs = new Set(l.map((x) => x.slug));
      return l.map((x) => (x.after && (!slugs.has(x.after) || x.after === x.slug) ? { slug: x.slug, weight: x.weight, level: x.level } : x));
    })(),
    biomes: list(c.biomes, 20, (b) => (typeof b.slug === 'string' && SLUG.test(b.slug) ? { slug: b.slug, weight: n(b.weight, 0, 10, 1) } : null)),
    time: c.time && c.time in TIMES ? c.time : 'sempre',
    group: pair(c.group, 1, 12, [1, 2]),
    rarity: n(c.rarity, 0.02, 1, 0.5),
    drops: list(c.drops, 10, (d) => (typeof d.item === 'string' && d.item.trim() ? { item: d.item.trim().slice(0, 40), chance: n(d.chance, 0, 1, 0.5), ...(() => { const [a, b] = pair([d.min, d.max], 1, 99, [1, 1]); return { min: a, max: b }; })() } : null)),
    color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : '#b9a6ff',
    look: sanitizeLook(c.look),
    model: m,
    art: c.art && typeof c.art.url === 'string' && URL_OK.test(c.art.url) ? { url: c.art.url, path: typeof c.art.path === 'string' ? c.art.path : undefined } : undefined,
  };
}

/** Atributos num nível (crescem ~8% por nível). */
export function creatureStatsAt(c: CreatureDef, level: number): CreatureStats {
  const k = Math.pow(1.08, Math.max(0, level - 1));
  return { vida: Math.round(c.stats.vida * k), poder: Math.round(c.stats.poder * k), defesa: Math.round(c.stats.defesa * k), agilidade: c.stats.agilidade, atkSpeed: c.stats.atkSpeed };
}

/** Habilidades abertas num nível (a árvore: nível alcançado e a de antes também aberta). */
export function creatureSkillsAt(c: CreatureDef, level: number): CreatureSkill[] {
  const open = new Set<string>();
  // várias passadas para resolver cadeias (a → b → c)
  for (let pass = 0; pass < 4; pass++) for (const s of c.skills) if (s.level <= level && (!s.after || open.has(s.after))) open.add(s.slug);
  return c.skills.filter((s) => open.has(s.slug));
}

/** Dano de um golpe depois da defesa (100 de defesa = metade). */
export function mitigate(damage: number, defense: number): number {
  return Math.max(1, Math.round(damage * 100 / (100 + Math.max(0, defense))));
}

/** Próxima habilidade pela frequência (r em [0, 1) vem do PRNG da luta), entre as abertas no nível. */
export function pickCreatureSkill(c: CreatureDef, r: number, level = 60): string | null {
  const pool = creatureSkillsAt(c, level);
  const total = pool.reduce((t, s) => t + s.weight, 0);
  if (total <= 0) return null;
  let x = r * total;
  for (const s of pool) { x -= s.weight; if (x < 0) return s.slug; }
  return pool[pool.length - 1].slug;
}

/** Sorteio do que a criatura solta ao ser acalmada. */
export function rollDrops(c: CreatureDef, rng: () => number): { item: string; qty: number }[] {
  const out: { item: string; qty: number }[] = [];
  for (const d of c.drops) if (rng() < d.chance) out.push({ item: d.item, qty: d.min + Math.floor(rng() * (d.max - d.min + 1)) });
  return out;
}

// ---------------------------------------------------------------------------
// Aparições no mundo (determinísticas por chunk)
// ---------------------------------------------------------------------------

export interface Spawn { id: string; slug: string; x: number; z: number; level: number; leader: boolean }

/**
 * Quem aparece num chunk. `biomeAt(x, z)` devolve o slug do bioma no ponto; `blocked` evita trilhas e o portal.
 * Uma chance por chunk (~1 grupo a cada 9 chunks), a criatura sorteada pelo peso no bioma × raridade.
 */
export function chunkSpawns(seed: number, cx: number, cz: number, size: number, creatures: CreatureDef[], biomeAt: (x: number, z: number) => string, blocked: (x: number, z: number) => boolean, night: boolean, density = 0.11): Spawn[] {
  const h = (...v: number[]) => { let x = Math.imul(seed | 0, 1442695041) ^ 0x5bd1e995; for (const k of v) { x = (x + Math.imul(k | 0, 374761393)) | 0; x = Math.imul(x ^ (x >>> 15), 668265263); } x ^= x >>> 13; x = Math.imul(x, 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  if (h(cx, cz, 1) > density) return [];
  const x0 = cx * size + size * (0.2 + 0.6 * h(cx, cz, 2)), z0 = cz * size + size * (0.2 + 0.6 * h(cx, cz, 3));
  if (blocked(x0, z0)) return [];
  const here = biomeAt(x0, z0);
  const pool = creatures.filter((c) => (c.time === 'sempre' || (c.time === 'noite') === night)).map((c) => {
    const w = c.biomes.length ? (c.biomes.find((b) => b.slug === here)?.weight ?? 0) : 0.4; // sem bioma marcado: aparece em qualquer região, mais raro
    return { c, w: w * c.rarity };
  }).filter((p) => p.w > 0);
  const total = pool.reduce((t, p) => t + p.w, 0);
  if (!total) return [];
  let r = h(cx, cz, 4) * total, pick = pool[0].c;
  for (const p of pool) { r -= p.w; if (r < 0) { pick = p.c; break; } }
  const count = pick.group[0] + Math.floor(h(cx, cz, 5) * (pick.group[1] - pick.group[0] + 1));
  const out: Spawn[] = [];
  for (let i = 0; i < count; i++) {
    const a = h(cx, cz, 6, i) * Math.PI * 2, d = i === 0 ? 0 : 1.2 + h(cx, cz, 7, i) * 2.2;
    const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
    if (i > 0 && blocked(x, z)) continue;
    out.push({ id: `${cx},${cz}:${i}`, slug: pick.slug, x, z, level: pick.level[0] + Math.floor(h(cx, cz, 8, i) * (pick.level[1] - pick.level[0] + 1)), leader: i === 0 });
  }
  return out;
}

/** Criaturas de reserva (sem modelo: corpo de névoa na cor delas) enquanto o Invocador está vazio. */
export const DEFAULT_CREATURES: CreatureDef[] = [
  sanitizeCreature({ slug: 'bruma-de-musgo', name: 'Bruma de Musgo', description: 'Uma bolinha de névoa verde que cochila entre as raízes. Só se defende.', essence: 'natureza', body: 'quadruped', archetype: 'guardia', temperament: 'passivo', style: 'corpo-a-corpo', level: [1, 3], stats: { vida: 140, poder: 14, defesa: 22, agilidade: 6, atkSpeed: 0.6 }, size: 0.7, speed: 0.8, aggroRange: 5, skills: [{ slug: 'golpe', weight: 3, level: 1 }, { slug: 'raizes', weight: 1, level: 2, after: 'golpe' }], biomes: [], time: 'sempre', group: [1, 2], rarity: 1, drops: [{ item: 'Musgo macio', chance: 0.8, min: 1, max: 3 }, { item: 'Semente brilhante', chance: 0.15, min: 1, max: 1 }, { item: 'Fragmento de Bruma', chance: 0.35, min: 1, max: 1 }], color: '#8fdc7a' })!,
  sanitizeCreature({ slug: 'fagulha', name: 'Fagulha', description: 'Um vagalume de fogo nervoso que dispara brasas e foge se você chegar perto demais.', essence: 'fogo', body: 'avian', archetype: 'atiradora', temperament: 'medroso', style: 'distancia', level: [2, 4], stats: { vida: 80, poder: 22, defesa: 8, agilidade: 18, atkSpeed: 1 }, size: 0.5, speed: 1.8, aggroRange: 8, skills: [{ slug: 'faisca-de-essencia', weight: 3, level: 1 }, { slug: 'brasas', weight: 1, level: 3, after: 'faisca-de-essencia' }], biomes: [], time: 'noite', group: [2, 4], rarity: 0.7, drops: [{ item: 'Pó de brasa', chance: 0.6, min: 1, max: 2 }, { item: 'Fragmento de Bruma', chance: 0.35, min: 1, max: 1 }], color: '#ffa04a' })!,
  sanitizeCreature({ slug: 'lobinho-de-geada', name: 'Lobinho de Geada', description: 'Filhote de névoa fria que anda em bando e corre para cima de quem entra no seu canto.', essence: 'gelo', body: 'quadruped', archetype: 'investidora', temperament: 'territorial', style: 'corpo-a-corpo', level: [3, 6], stats: { vida: 110, poder: 26, defesa: 12, agilidade: 16, atkSpeed: 0.9 }, size: 0.8, speed: 1.6, aggroRange: 9, skills: [{ slug: 'golpe', weight: 2, level: 1 }, { slug: 'investida', weight: 1, level: 4, after: 'golpe' }, { slug: 'rajada-fria', weight: 1, level: 5, after: 'investida' }], biomes: [], time: 'sempre', group: [2, 3], rarity: 0.5, drops: [{ item: 'Pelo gelado', chance: 0.7, min: 1, max: 2 }, { item: 'Cristal de geada', chance: 0.1, min: 1, max: 1 }, { item: 'Fragmento de Bruma', chance: 0.4, min: 1, max: 1 }], color: '#a8e4ff' })!,
];
