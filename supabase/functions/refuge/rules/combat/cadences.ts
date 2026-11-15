/**
 * Cadências — as técnicas de arma saem do ritmo, não da barra.
 *
 * Em vez de apertar a técnica num espaço da barra, a pessoa a "toca": uma sequência curta de golpes básicos (B) e
 * das habilidades dos três primeiros espaços da barra (H1, H2, H3). Quando a sequência fecha, a técnica sai — no
 * lugar do golpe básico que a fechou, ou logo depois da habilidade que a fechou.
 *
 *   B → H1 → B             fecha a primeira técnica (o segundo básico já é ela)
 *   B → H1 → B → H2 → H3   continua a mesma cadência e fecha uma técnica mais forte
 *
 * As sequências não são escritas à mão: `generateCadences` as gera a partir de uma semente, por arma, em árvore —
 * as primeiras técnicas são raízes curtas (3 toques) e as seguintes continuam uma cadência que já existe (+2 toques),
 * de modo que dá para emendar uma na outra. A mesma semente dá sempre as mesmas sequências (cliente e servidor
 * concordam, e o que a pessoa decorou continua valendo); trocar a semente embaralha tudo.
 *
 * Tudo puro: o cliente guarda os toques e pergunta aqui o que fechou e o que continua.
 */
import { COMBO_FINISHERS, COMBO_LINKS } from './combos.ts';
import type { SkillDef, WeaponKind } from './skills.ts';
import { WEAPON_TECHNIQUES } from './techniques.ts';

export type CadenceToken = 'B' | 'H1' | 'H2' | 'H3';
/** quantos espaços da barra contam como toque (os demais não entram nem quebram a cadência) */
export const CADENCE_SKILL_SLOTS = 3;
/** tempo máximo entre um toque e o próximo (s); passou disso, a cadência recomeça */
export const CADENCE_GAP = 2.4;
/** semente padrão das sequências (o Administrador pode trocar em game_config.cadenceSeed) */
export const CADENCE_SEED = 'aster-1';

const SKILL_TOKENS: CadenceToken[] = ['H1', 'H2', 'H3'];
const ALL_TOKENS: CadenceToken[] = ['B', ...SKILL_TOKENS];

export interface Cadence {
  /** slug da técnica (ou do finalizador) que sai */
  slug: string;
  weapon: WeaponKind;
  seq: CadenceToken[];
  /** a cadência que esta continua (null = raiz) */
  parent: string | null;
  /** 1 = raiz; cada continuação soma 1 */
  depth: number;
}

/** O toque de um espaço da barra (0 = primeiro), ou null se o espaço não entra nas cadências. */
export const cadenceTokenOfSlot = (slot: number): CadenceToken | null => (slot >= 0 && slot < CADENCE_SKILL_SLOTS ? SKILL_TOKENS[slot] : null);

export const CADENCE_TOKEN_LABEL: Record<CadenceToken, string> = { B: 'Básico', H1: 'Hab. 1', H2: 'Hab. 2', H3: 'Hab. 3' };
export const cadenceLabel = (seq: readonly CadenceToken[]) => seq.map((t) => CADENCE_TOKEN_LABEL[t]).join(' → ');

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Regras de forma: nada de dois básicos seguidos (isso já é o combo de golpes) e cada habilidade no máximo uma vez
 * por cadência (ela estaria recarregando na segunda).
 */
function wellFormed(seq: readonly CadenceToken[]): boolean {
  const used = new Set<CadenceToken>();
  for (const t of seq) { if (t === 'B') continue; if (used.has(t)) return false; used.add(t); }
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === 'B' && seq[i - 1] === 'B') return false;
    if (i >= 2 && seq[i] === seq[i - 1] && seq[i] === seq[i - 2]) return false;
  }
  return true;
}

/**
 * As técnicas de uma arma na ordem em que ganham cadência: as que vêm com o jogo e as da Forja (pelo vínculo que as
 * abre, depois pelo slug) e, por fim, os finalizadores da arma. Finalizador que já sai só com golpes básicos (Corte
 * Duplo) fica de fora: ele continua sendo o terceiro golpe no ritmo.
 */
export function cadenceOrder(weapon: WeaponKind, catalog: readonly SkillDef[] = []): string[] {
  const byBasics = new Set(COMBO_LINKS.filter((l) => l.from === 'basic' && l.press === 'basic').map((l) => l.becomes));
  const own = new Map<string, SkillDef>();
  for (const s of WEAPON_TECHNIQUES) if (s.weapon === weapon) own.set(s.slug, s);
  for (const s of catalog) if (s.slot === 'technique' && s.weapon === weapon) own.set(s.slug, s);
  const techs = [...own.values()].sort((a, b) => a.unlockBond - b.unlockBond || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).map((s) => s.slug);
  const fins = COMBO_FINISHERS.filter((f) => f.weapon === weapon && !byBasics.has(f.slug) && !own.has(f.slug)).map((f) => f.slug);
  return [...techs, ...fins];
}

/**
 * Gera as cadências de uma arma. `slugs` na ordem de `cadenceOrder`. Determinístico pela semente + arma.
 * Garante: toda sequência começa com um golpe básico, é única, bem formada, e cada continuação estende a do pai.
 */
export function generateCadences(weapon: WeaponKind, slugs: readonly string[], seed: string = CADENCE_SEED): Cadence[] {
  const rand = rng(hash(`${seed}|${weapon}`));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const out: Cadence[] = [], taken = new Set<string>();
  const roots = slugs.length >= 4 ? 3 : Math.min(slugs.length, 2);
  // as raízes usam uma habilidade diferente cada: B → H? → B
  const mid = [...SKILL_TOKENS];
  for (let i = mid.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [mid[i], mid[j]] = [mid[j], mid[i]]; }
  const children = new Map<string, number>();
  slugs.forEach((slug, i) => {
    if (i < roots) {
      const seq: CadenceToken[] = ['B', mid[i], 'B'];
      out.push({ slug, weapon, seq, parent: null, depth: 1 }); taken.add(seq.join());
      return;
    }
    // continua uma cadência que já existe: prefere a mais curta e com menos continuações
    const pool = [...out].sort((a, b) => a.seq.length - b.seq.length || (children.get(a.slug) ?? 0) - (children.get(b.slug) ?? 0));
    const least = pool.filter((c) => c.seq.length === pool[0].seq.length && (children.get(c.slug) ?? 0) === (children.get(pool[0].slug) ?? 0));
    let made: Cadence | null = null;
    for (let tries = 0; tries < 40 && !made; tries++) {
      const parent = tries < 24 ? pick(least) : pick(pool);
      const seq = [...parent.seq, pick(ALL_TOKENS), pick(ALL_TOKENS)];
      if (wellFormed(seq) && !taken.has(seq.join())) made = { slug, weapon, seq, parent: parent.slug, depth: parent.depth + 1 };
    }
    // a sorte não achou (muito improvável): varre as combinações em ordem
    for (const parent of made ? [] : pool) {
      for (const a of ALL_TOKENS) for (const b of ALL_TOKENS) {
        const seq = [...parent.seq, a, b];
        if (!made && wellFormed(seq) && !taken.has(seq.join())) made = { slug, weapon, seq, parent: parent.slug, depth: parent.depth + 1 };
      }
    }
    if (!made) return;
    out.push(made); taken.add(made.seq.join()); children.set(made.parent!, (children.get(made.parent!) ?? 0) + 1);
  });
  return out;
}

/** As cadências da arma (as que vêm com o jogo + as da Forja). */
export const cadencesFor = (weapon: WeaponKind | null | undefined, catalog: readonly SkillDef[] = [], seed: string = CADENCE_SEED): Cadence[] =>
  (weapon ? generateCadences(weapon, cadenceOrder(weapon, catalog), seed) : []);

const startsWith = (seq: readonly CadenceToken[], head: readonly CadenceToken[]) => head.length <= seq.length && head.every((t, i) => seq[i] === t);

export interface CadenceStep {
  /** os toques que ainda contam (o maior final que começa alguma cadência) */
  history: CadenceToken[];
  /** a cadência que este toque fechou, se fechou */
  done: Cadence | null;
  /** o que continua daqui: o próximo toque e a cadência a que ele leva */
  next: { token: CadenceToken; cadence: Cadence }[];
}

/**
 * Um toque novo. `list` = só as cadências que a pessoa pode usar agora (técnicas abertas). Se o toque não continua
 * nada, a história encolhe até o maior final que ainda começa uma cadência (errar não zera o que serve de começo).
 */
export function cadenceAdvance(history: readonly CadenceToken[], token: CadenceToken, list: readonly Cadence[]): CadenceStep {
  let h = [...history, token];
  while (h.length && !list.some((c) => startsWith(c.seq, h))) h = h.slice(1);
  const done = h.length ? list.find((c) => c.seq.length === h.length && startsWith(c.seq, h)) ?? null : null;
  const next = h.length ? list.filter((c) => c.seq.length > h.length && startsWith(c.seq, h)).map((c) => ({ token: c.seq[h.length], cadence: c })) : [];
  return { history: done && !next.length ? [] : h, done, next };
}

/** O que os toques já dados permitem continuar (para acender os botões). */
export function cadenceNext(history: readonly CadenceToken[], list: readonly Cadence[]): { token: CadenceToken; cadence: Cadence }[] {
  if (!history.length) return [];
  return list.filter((c) => c.seq.length > history.length && startsWith(c.seq, history)).map((c) => ({ token: c.seq[history.length], cadence: c }));
}

/** Cadências que a pessoa pode usar: a técnica está aberta e a cadência que ela continua também. */
export function usableCadences(all: readonly Cadence[], open: ReadonlySet<string>): Cadence[] {
  const ok = new Set<string>();
  for (const c of all) if (open.has(c.slug) && (c.parent === null || ok.has(c.parent))) ok.add(c.slug);
  return all.filter((c) => ok.has(c.slug));
}
