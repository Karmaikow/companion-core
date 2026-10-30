/**
 * Pontos e árvore de habilidades do Companion.
 *
 * Pontos: 1 por nível de vínculo (+ quests secretas; o nível de combate soma quando a batalha existir).
 * Árvore: quatro galhos, montados a partir do catálogo da Forja, da essência e da classe do Companion:
 *   - Essência: TODAS as habilidades da essência, em sequência, com níveis, focos e buffs da essência entre elas;
 *   - Classe: as passivas da linhagem, a habilidade de forma e o golpe da classe;
 *   - Vínculo: o golpe básico, energia, vida, a Sintonia suprema e o eco dela;
 *   - Fusão: habilidades mais fortes que pedem pontos em galhos diferentes (ex.: 3 em Mesma Sintonia + 2 na
 *     segunda passiva da classe + 2 no nível da última habilidade da essência). Geradas pela essência e classe.
 * Cada ponto custa 1. Pré-requisito = pontos mínimos em outros nós (padrão 1). Vínculo mínimo por fileira (TIER_BOND).
 * Nós de nível ("rank") melhoram uma habilidade aberta: +15% de efeito e –8% de recarga por nível.
 * Nós de buff ("boost") somam % de efeito numa habilidade ou em todas as habilidades de uma essência.
 * Passivas somam % em atributos.
 * Função pura: o cliente mostra, e o servidor (battle.resolve) recalcula com validateAllocation.
 */
import type { Element } from '../identity.ts';
import { ELEMENTS } from '../identity.ts';
import { SPECIES, type AttrKey, type SpeciesKey } from '../species.ts';
import { skillFits, type SkillDef, type SkillShape, type SkillSlot } from './skills.ts';

export type TreeBranch = 'essencia' | 'classe' | 'vinculo' | 'fusao';
export type NodeKind = 'skill' | 'rank' | 'passive' | 'boost';

export interface TreeNode {
  id: string;
  branch: TreeBranch;
  tier: number;                                 // fileira: decide o vínculo mínimo (TIER_BOND)
  kind: NodeKind;
  name: string;
  description: string;
  skill?: string;                               // habilidade aberta (skill) ou melhorada (rank/boost)
  maxRank: number;                              // pontos que o nó aceita
  bonus?: Partial<Record<AttrKey, number>>;     // % por ponto (passivas)
  boost?: { skill?: string; element?: Element; pct: number }; // % de efeito por ponto (buffs)
  requires: string[];                           // nós pedidos antes
  needs?: Record<string, number>;               // pontos mínimos em cada pré-requisito (padrão 1)
}

export interface SkillTree {
  branches: Record<TreeBranch, { label: string; hint: string }>;
  nodes: TreeNode[];
  /** habilidades que só existem na árvore (fusões) — não estão no catálogo da Forja */
  extra: SkillDef[];
}
export type Allocation = Record<string, number>;

export const TIER_BOND: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8, 6: 10, 7: 12, 8: 15 };
export const RANK_POWER = 0.15, RANK_COOLDOWN = 0.08;
const MAX_TIER = 8;
export const tierBond = (tier: number) => TIER_BOND[Math.min(MAX_TIER, Math.max(1, tier))];
export const needOf = (n: TreeNode, req: string) => n.needs?.[req] ?? 1;

/** Pontos ganhos até agora. */
export function skillPoints(bondLevel: number, combatLevel = 0, secrets = 0): number {
  // + 1 por quest secreta conquistada (secretBonus)
  return Math.max(1, Math.floor(bondLevel)) + Math.max(0, Math.floor(combatLevel)) + Math.max(0, Math.floor(secrets));
}

const SPECIES_PASSIVES: Record<SpeciesKey, [{ name: string; description: string; bonus: Partial<Record<AttrKey, number>> }, { name: string; description: string; bonus: Partial<Record<AttrKey, number>> }]> = {
  serpente: [{ name: 'Escamas', description: 'Escamas que endurecem: +4% de defesa por ponto.', bonus: { defesa: 4 } }, { name: 'Sangue de Dragão', description: 'A essência corre mais forte: +4% de sintonia e +2% de poder por ponto.', bonus: { sintonia: 4, poder: 2 } }],
  passaro: [{ name: 'Penas Leves', description: '+4% de agilidade por ponto.', bonus: { agilidade: 4 } }, { name: 'Corrente de Ar', description: '+4% de energia e +2% de agilidade por ponto.', bonus: { energia: 4, agilidade: 2 } }],
  felino: [{ name: 'Instinto', description: '+4% de agilidade por ponto.', bonus: { agilidade: 4 } }, { name: 'Garras Afiadas', description: '+4% de poder por ponto.', bonus: { poder: 4 } }],
  touro: [{ name: 'Couro Grosso', description: '+5% de vida por ponto.', bonus: { vida: 5 } }, { name: 'Firmeza', description: '+4% de defesa e +2% de vida por ponto.', bonus: { defesa: 4, vida: 2 } }],
  mistica: [{ name: 'Brilho Interior', description: '+4% de sintonia por ponto.', bonus: { sintonia: 4 } }, { name: 'Fonte Arcana', description: '+5% de energia por ponto.', bonus: { energia: 5 } }],
};

const FUSION_WORD: Record<Element, string> = {
  fogo: 'Inferno', agua: 'Maré', terra: 'Terremoto', vento: 'Tufão', luz: 'Aurora', sombra: 'Eclipse', gelo: 'Nevasca', raio: 'Tempestade', natureza: 'Floresta', veneno: 'Praga',
};
const CLASS_WORD: Record<SpeciesKey, string> = { serpente: 'do Dragão', passaro: 'dos Céus', felino: 'da Fera', touro: 'do Touro', mistica: 'das Fadas' };

const SKILL_BOOST = 3, ELEMENT_BOOST = 2;

function fusionSkill(slug: string, name: string, slot: SkillSlot, essence: Element | null, shape: SkillShape, o: Partial<SkillDef> & { description: string }): SkillDef {
  return {
    slug, name, slot, essence, shape, classes: [], bodies: [], range: 6, radius: 2, angle: 70, power: 0, heal: 0, energy: 30, cooldown: 10, windup: 0.6,
    status: null, anim: 'attack', vfx: { style: 'impacto', color: essence ? 'essence' : 'companion', ground: true }, unlockBond: 1, ...o,
  };
}

/** Monta a árvore de um Companion a partir do catálogo publicado na Forja. */
export function buildSkillTree(catalog: SkillDef[], c: { essence: Element | null; species: SpeciesKey }): SkillTree {
  const fits = catalog.filter((s) => skillFits(s, c.essence, 'biped', c.species));
  const ess = fits.filter((s) => s.slot === 'essence' && s.essence).sort((a, b) => a.unlockBond - b.unlockBond || a.slug.localeCompare(b.slug));
  const basic = fits.filter((s) => s.slot === 'basic').sort((a, b) => b.classes.length - a.classes.length || a.slug.localeCompare(b.slug))[0];
  const form = fits.find((s) => s.slot === 'form' && s.classes.includes(c.species)) ?? fits.find((s) => s.slot === 'form');
  const supreme = fits.find((s) => s.slot === 'supreme');
  const sp = SPECIES[c.species];
  const [p1, p2] = SPECIES_PASSIVES[c.species];
  const essLabel = c.essence ? ELEMENTS[c.essence].label : 'Essência';
  const nodes: TreeNode[] = [];
  const extra: SkillDef[] = [];
  const add = (n: Omit<TreeNode, 'maxRank' | 'requires'> & Partial<Pick<TreeNode, 'maxRank' | 'requires'>>) => {
    const node: TreeNode = { maxRank: 1, requires: [], ...n, tier: Math.min(MAX_TIER, n.tier) };
    if (node.needs) node.requires = Object.keys(node.needs);
    nodes.push(node);
  };
  const rankDesc = `+${RANK_POWER * 100}% de efeito e –${RANK_COOLDOWN * 100}% de recarga por nível.`;
  const focus = (id: string, branch: TreeBranch, s: SkillDef, tier: number, requires: string[]) =>
    add({ id, branch, tier, kind: 'boost', name: `Foco: ${s.name}`, description: `+${SKILL_BOOST}% de efeito de ${s.name} por ponto.`, skill: s.slug, boost: { skill: s.slug, pct: SKILL_BOOST }, maxRank: 3, requires });

  // Essência: todas as habilidades, em sequência. Entre uma e outra, um "portão" que a próxima pede.
  // (e1..e5 continuam com os mesmos ids para não perder distribuições salvas)
  let gate: string | null = null;
  for (let i = 0; i < ess.length; i++) {
    const s = ess[i];
    const st = i === 0 ? 1 : 2 * i + 2;
    const sid = i === 0 ? 'e1' : i === 1 ? 'e4' : `es-${s.slug}`;
    const rid = i === 0 ? 'e2' : i === 1 ? 'e5' : `er-${s.slug}`;
    add({ id: sid, branch: 'essencia', tier: st, kind: 'skill', name: s.name, description: s.description, skill: s.slug, requires: gate ? [gate] : [] });
    add({ id: rid, branch: 'essencia', tier: st + 1, kind: 'rank', name: `${s.name}+`, description: i === 0 ? `Mais forte e mais rápida: ${rankDesc}` : rankDesc, skill: s.slug, maxRank: 3, requires: [sid] });
    focus(`eb-${s.slug}`, 'essencia', s, st + 1, [sid]);
    if (i === 0) {
      gate = 'e3';
      add({ id: 'e3', branch: 'essencia', tier: 3, kind: 'passive', name: `Afinidade com ${essLabel}`, description: '+3% de poder por ponto.', bonus: { poder: 3 }, maxRank: 3, requires: ['e1'] });
    } else {
      gate = `eg-${s.slug}`;
      add({ id: gate, branch: 'essencia', tier: st + 2, kind: 'boost', name: `Corrente de ${essLabel}`, description: `+${ELEMENT_BOOST}% de efeito em todas as habilidades de ${essLabel} por ponto.`, boost: { element: c.essence ?? undefined, pct: ELEMENT_BOOST }, maxRank: 3, requires: [sid] });
    }
  }
  if (!ess.length) add({ id: 'e3', branch: 'essencia', tier: 3, kind: 'passive', name: `Afinidade com ${essLabel}`, description: '+3% de poder por ponto.', bonus: { poder: 3 }, maxRank: 3 });
  const lastEss = ess.length ? ess[ess.length - 1] : null;
  const lastEssRank = ess.length === 1 ? 'e2' : ess.length === 2 ? 'e5' : lastEss ? `er-${lastEss.slug}` : null;
  if (c.essence) add({ id: 'e-dominio', branch: 'essencia', tier: Math.max(6, ess.length * 2 + 2), kind: 'boost', name: `Domínio de ${essLabel}`, description: `+${ELEMENT_BOOST}% de efeito em todas as habilidades de ${essLabel} e +2% de poder por ponto.`, boost: { element: c.essence, pct: ELEMENT_BOOST }, bonus: { poder: 2 }, maxRank: 3, requires: [gate ?? 'e3'] });

  // Classe
  add({ id: 'c1', branch: 'classe', tier: 1, kind: 'passive', name: p1.name, description: p1.description, bonus: p1.bonus, maxRank: 3 });
  if (form) {
    add({ id: 'c2', branch: 'classe', tier: 2, kind: 'skill', name: form.name, description: form.description, skill: form.slug, requires: ['c1'] });
    add({ id: 'c3', branch: 'classe', tier: 3, kind: 'rank', name: `${form.name}+`, description: rankDesc, skill: form.slug, maxRank: 3, requires: ['c2'] });
    focus('cb-forma', 'classe', form, 3, ['c2']);
  }
  add({ id: 'c4', branch: 'classe', tier: 4, kind: 'passive', name: p2.name, description: p2.description, bonus: p2.bonus, maxRank: 3, requires: [form ? 'c2' : 'c1'] });
  add({ id: 'c5', branch: 'classe', tier: 5, kind: 'passive', name: `Linhagem ${sp.label}`, description: `Afinidade da classe (${sp.affinities.map((e) => ELEMENTS[e].label).join(' e ')}): as habilidades dessas essências custam 20% menos SP (em vez de 10%).`, bonus: {}, requires: ['c4'] });
  add({ id: 'c6', branch: 'classe', tier: 6, kind: 'passive', name: `Postura ${sp.label}`, description: '+2% de poder e +2% de agilidade por ponto.', bonus: { poder: 2, agilidade: 2 }, maxRank: 3, requires: ['c5'] });

  // Vínculo
  if (basic) {
    add({ id: 'v1', branch: 'vinculo', tier: 1, kind: 'rank', name: `${basic.name}+`, description: `O golpe básico: +${RANK_POWER * 100}% de dano por nível.`, skill: basic.slug, maxRank: 3 });
    focus('vb-basico', 'vinculo', basic, 2, ['v1']);
  }
  add({ id: 'v2', branch: 'vinculo', tier: 2, kind: 'passive', name: 'Fôlego', description: '+5% de energia por ponto.', bonus: { energia: 5 }, maxRank: 3 });
  add({ id: 'v3', branch: 'vinculo', tier: 3, kind: 'passive', name: 'Coração Firme', description: '+5% de vida por ponto.', bonus: { vida: 5 }, maxRank: 3, requires: ['v2'] });
  add({ id: 'v4', branch: 'vinculo', tier: 4, kind: 'passive', name: 'Mesma Sintonia', description: 'Os seus chamados chegam mais rápido: +5% de sintonia por ponto.', bonus: { sintonia: 5 }, maxRank: 3, requires: ['v3'] });
  if (supreme) {
    add({ id: 'v5', branch: 'vinculo', tier: 5, kind: 'skill', name: supreme.name, description: supreme.description, skill: supreme.slug, requires: ['v4'] });
    add({ id: 'v6', branch: 'vinculo', tier: 6, kind: 'boost', name: `Eco: ${supreme.name}`, description: `+${SKILL_BOOST}% de efeito de ${supreme.name} por ponto.`, skill: supreme.slug, boost: { skill: supreme.slug, pct: SKILL_BOOST }, maxRank: 3, requires: ['v5'] });
  }

  // Fusão: habilidades novas que pedem pontos em galhos diferentes
  const word = c.essence ? FUSION_WORD[c.essence] : 'Essência';
  const e0 = ess[0], tag = `${c.essence ?? 'neutra'}-${c.species}`;
  const statusOf = ess.find((s) => s.status)?.status ?? null;
  const style = e0?.vfx.style ?? 'luz';
  const fusions: string[] = [];

  if (e0) {
    const s = fusionSkill(`fusao-elo-${tag}`, `Elo de ${essLabel}`, 'essence', c.essence, 'projectile', {
      description: `${e0.name} carregada pelo vínculo: um disparo longo e pesado de ${essLabel.toLowerCase()}.`,
      power: Math.round(1.5 * (e0.power || 50)), range: 9, radius: 0.7, energy: 30, cooldown: 8, windup: 0.4, status: e0.status,
      vfx: { style, color: 'essence', ground: false },
    });
    extra.push(s); fusions.push('f2');
    add({ id: 'f2', branch: 'fusao', tier: 6, kind: 'skill', name: s.name, description: s.description, skill: s.slug, needs: { e2: 3, v3: 2 } });
    focus('fb-elo', 'fusao', s, 7, ['f2']);
  }
  if (form) {
    const s = fusionSkill(`fusao-furia-${tag}`, `Fúria ${sp.label}`, 'form', null, form.shape, {
      description: `${form.name} no limite: o corpo inteiro da classe ${sp.label} num golpe só.`,
      power: Math.max(70, Math.round(1.6 * form.power)), range: form.range, radius: +(form.radius * 1.3).toFixed(2), energy: 35, cooldown: 10, windup: 0.5,
      status: form.status, anim: form.anim, vfx: { style: form.vfx.style, color: 'companion', ground: true },
    });
    extra.push(s); fusions.push('f3');
    add({ id: 'f3', branch: 'fusao', tier: 6, kind: 'skill', name: s.name, description: s.description, skill: s.slug, needs: { c3: 2, v2: 2 } });
  }
  {
    const needs: Record<string, number> = { v4: 3, c4: 2 };
    if (lastEssRank) needs[lastEssRank] = 2; else needs.e3 = 2;
    const maxPow = Math.max(50, ...ess.map((s) => s.power));
    const maxHeal = Math.max(0, ...ess.map((s) => s.heal));
    const s = fusionSkill(`fusao-${tag}`, `${word} ${CLASS_WORD[c.species]}`, 'essence', c.essence, 'circle', {
      description: `A essência, a classe e o vínculo juntos: ${essLabel.toLowerCase()} desaba sobre a área marcada${maxHeal ? ' e cura quem estiver junto' : ''}.`,
      power: Math.max(80, Math.round(1.7 * maxPow)), heal: Math.round(1.2 * maxHeal), range: 7, radius: 2.8, energy: 40, cooldown: 14, windup: 0.8,
      status: statusOf, vfx: { style, color: c.essence ? 'essence' : 'companion', ground: true },
    });
    extra.push(s); fusions.push('f1');
    add({ id: 'f1', branch: 'fusao', tier: 7, kind: 'skill', name: s.name, description: s.description, skill: s.slug, needs });
    focus('fb-fusao', 'fusao', s, 8, ['f1']);
  }
  {
    const needs: Record<string, number> = Object.fromEntries(fusions.map((f) => [f, 1]));
    if (supreme) needs.v5 = 1;
    const s = fusionSkill(`fusao-despertar-${tag}`, 'Despertar Primordial', 'supreme', c.essence, 'aura', {
      description: `Tudo o que o Companion aprendeu, de uma vez: uma explosão de ${essLabel.toLowerCase()} e vínculo em volta de si.`,
      power: 220, energy: 50, cooldown: 45, windup: 1.2, radius: 4.5, status: statusOf, anim: 'happy',
      vfx: { style, color: c.essence ? 'essence' : 'companion', ground: true },
    });
    extra.push(s);
    add({ id: 'f4', branch: 'fusao', tier: 8, kind: 'skill', name: s.name, description: s.description, skill: s.slug, needs });
  }

  return {
    branches: {
      essencia: { label: essLabel, hint: 'Todas as habilidades da essência, os níveis, os focos e a corrente da essência entre elas.' },
      classe: { label: sp.label, hint: `${sp.lineage}. Passivas da classe e a habilidade de forma.` },
      vinculo: { label: 'Vínculo', hint: 'Golpe básico, fôlego, vida e, no fim, a Sintonia suprema.' },
      fusao: { label: 'Fusão', hint: 'Habilidades mais fortes que pedem pontos em galhos diferentes.' },
    },
    nodes,
    extra,
  };
}

/** Profundidade de cada nó (1 = sem pré-requisito): ordem segura para conferir a árvore. */
export function nodeDepths(tree: SkillTree): Map<string, number> {
  const by = new Map(tree.nodes.map((n) => [n.id, n]));
  const out = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    const known = out.get(id); if (known) return known;
    const n = by.get(id); if (!n || seen.has(id)) return 0;
    seen.add(id);
    const d = 1 + Math.max(0, ...n.requires.map((r) => visit(r, seen)));
    out.set(id, d);
    return d;
  };
  for (const n of tree.nodes) visit(n.id, new Set());
  return out;
}

const reqLabel = (tree: SkillTree, n: TreeNode, r: string) => {
  const name = tree.nodes.find((x) => x.id === r)?.name ?? r, need = needOf(n, r);
  return need > 1 ? `${need} pontos em ${name}` : name;
};

/** Pode pôr mais um ponto neste nó? Devolve o motivo quando não pode. */
export function canSpend(tree: SkillTree, alloc: Allocation, nodeId: string, bondLevel: number, points: number): string | null {
  const n = tree.nodes.find((x) => x.id === nodeId);
  if (!n) return 'Nó não existe.';
  if ((alloc[nodeId] ?? 0) >= n.maxRank) return 'Já está no máximo.';
  if (spent(alloc) >= points) return 'Sem pontos livres.';
  if (bondLevel < tierBond(n.tier)) return `Abre no vínculo ${tierBond(n.tier)}.`;
  const missing = n.requires.filter((r) => (alloc[r] ?? 0) < needOf(n, r));
  if (missing.length) return `Precisa de ${missing.map((r) => reqLabel(tree, n, r)).join(', ')}.`;
  return null;
}

export const spent = (alloc: Allocation) => Object.values(alloc).reduce((t, v) => t + Math.max(0, v | 0), 0);

/** Confere uma distribuição inteira (servidor/carregamento): tira o que não vale, dos pré-requisitos para cima. */
export function validateAllocation(tree: SkillTree, alloc: Allocation, bondLevel: number, points: number): Allocation {
  const out: Allocation = {};
  const depth = nodeDepths(tree);
  const order = tree.nodes.map((n, i) => ({ n, i })).sort((a, b) => (depth.get(a.n.id) ?? 0) - (depth.get(b.n.id) ?? 0) || a.i - b.i);
  for (const { n } of order) {
    const want = Math.max(0, Math.min(n.maxRank, Math.floor(Number(alloc[n.id]) || 0)));
    for (let i = 0; i < want; i++) if (!canSpend(tree, out, n.id, bondLevel, points)) out[n.id] = (out[n.id] ?? 0) + 1;
  }
  return out;
}

/**
 * Caminho até +1 ponto num nó: tudo o que falta nos pré-requisitos (com os pontos mínimos), recursivamente.
 * `add` = pontos a pôr em cada nó; `cost` = total; `blocked` = motivo quando nem com pontos daria (vínculo, máximo).
 */
export function planTo(tree: SkillTree, alloc: Allocation, nodeId: string, bondLevel: number): { add: Allocation; cost: number; blocked: string | null } {
  const by = new Map(tree.nodes.map((n) => [n.id, n]));
  const target = by.get(nodeId);
  if (!target) return { add: {}, cost: 0, blocked: 'Nó não existe.' };
  if ((alloc[nodeId] ?? 0) >= target.maxRank) return { add: {}, cost: 0, blocked: 'Já está no máximo.' };
  const want: Allocation = {};
  const visit = (id: string, rank: number) => {
    const n = by.get(id); if (!n) return;
    if ((want[id] ?? 0) >= rank) return;
    want[id] = Math.min(n.maxRank, rank);
    for (const r of n.requires) visit(r, needOf(n, r));
  };
  visit(nodeId, (alloc[nodeId] ?? 0) + 1);
  const add: Allocation = {};
  let cost = 0, worst: TreeNode | null = null;
  for (const [id, rank] of Object.entries(want)) {
    const more = rank - (alloc[id] ?? 0);
    if (more <= 0) continue;
    add[id] = more; cost += more;
    const n = by.get(id)!;
    if (bondLevel < tierBond(n.tier) && (!worst || tierBond(n.tier) > tierBond(worst.tier))) worst = n;
  }
  return { add, cost, blocked: worst ? `Abre no vínculo ${tierBond(worst.tier)} (${worst.name}).` : null };
}

/** Aplica um plano de `planTo` (já conferido pela validação). */
export function applyPlan(tree: SkillTree, alloc: Allocation, add: Allocation, bondLevel: number, points: number): Allocation {
  const next: Allocation = { ...alloc };
  for (const [id, v] of Object.entries(add)) next[id] = (next[id] ?? 0) + v;
  return validateAllocation(tree, next, bondLevel, points);
}

/** Resultado da distribuição: habilidades abertas (com nível), bônus de atributos, buffs de efeito e afinidade da classe. */
export function treeEffects(tree: SkillTree, alloc: Allocation) {
  const skills = new Map<string, number>(); // slug → nível (1 = aberta)
  const bonus: Partial<Record<AttrKey, number>> = {};
  const skillPct: Record<string, number> = {};
  const elementPct: Partial<Record<Element, number>> = {};
  let lineage = false;
  for (const n of tree.nodes) {
    const r = alloc[n.id] ?? 0;
    if (!r) continue;
    if (n.kind === 'skill' && n.skill) skills.set(n.skill, Math.max(1, skills.get(n.skill) ?? 0));
    if (n.kind === 'rank' && n.skill) skills.set(n.skill, (skills.get(n.skill) ?? 1) + r);
    for (const [k, v] of Object.entries(n.bonus ?? {})) bonus[k as AttrKey] = (bonus[k as AttrKey] ?? 0) + (v as number) * r;
    if (n.boost?.skill) skillPct[n.boost.skill] = (skillPct[n.boost.skill] ?? 0) + n.boost.pct * r;
    if (n.boost?.element) elementPct[n.boost.element] = (elementPct[n.boost.element] ?? 0) + n.boost.pct * r;
    if (n.id === 'c5') lineage = true;
  }
  // afinidade da classe = redução no custo de SP da essência afim (Constelação Viva), não mais bônus de dano
  return { skills, bonus, skillPct, elementPct, lineage, classAffinity: lineage ? 0.2 : 0.1 };
}

/** Multiplicador de efeito (dano e cura) de uma habilidade: níveis + focos + corrente da essência. */
export function skillPowerMult(fx: Pick<ReturnType<typeof treeEffects>, 'skillPct' | 'elementPct'> | null, skill: Pick<SkillDef, 'slug' | 'essence'>, level: number): number {
  const pct = (fx?.skillPct[skill.slug] ?? 0) + (skill.essence ? fx?.elementPct[skill.essence] ?? 0 : 0);
  return 1 + RANK_POWER * (level - 1) + pct / 100;
}
