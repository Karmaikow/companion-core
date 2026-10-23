/**
 * Pontos e árvore de habilidades do Companion.
 *
 * Pontos: 1 por nível de vínculo (o nível de combate soma pontos quando a batalha existir).
 * Árvore: três galhos, montados a partir do catálogo da Forja, da essência e da classe do Companion:
 *   - Essência: as duas habilidades da essência, os níveis delas e a maestria;
 *   - Classe: as passivas da linhagem, a habilidade de forma e o golpe da classe;
 *   - Vínculo: o golpe básico, energia, vida e, no fim, a Sintonia suprema.
 * Cada nó custa 1 ponto, tem pré-requisito (o nó de cima no galho) e um vínculo mínimo (fileiras 1..5 → vínculo 1, 2, 3, 5, 8).
 * Nós de nível ("rank") melhoram uma habilidade já aberta: +15% de efeito e –8% de recarga por nível (até 3).
 * Passivas somam % em atributos (vida, energia, poder, defesa, agilidade, sintonia) — o sistema de atributos é
 * um rascunho que a batalha vai usar.
 * Função pura: o cliente mostra, e o servidor (battle.resolve) recalcula com validateAllocation.
 */
import type { Element } from '../identity.ts';
import { ELEMENTS } from '../identity.ts';
import { SPECIES, type AttrKey, type SpeciesKey } from '../species.ts';
import { skillFits, type SkillDef } from './skills.ts';

export type TreeBranch = 'essencia' | 'classe' | 'vinculo';
export type NodeKind = 'skill' | 'rank' | 'passive';

export interface TreeNode {
  id: string;
  branch: TreeBranch;
  tier: 1 | 2 | 3 | 4 | 5;
  kind: NodeKind;
  name: string;
  description: string;
  skill?: string;                               // habilidade aberta (skill) ou melhorada (rank)
  maxRank: number;                              // pontos que o nó aceita
  bonus?: Partial<Record<AttrKey, number>>;     // % por ponto (passivas)
  requires: string[];                           // nós que precisam ter pelo menos 1 ponto
}

export interface SkillTree { branches: Record<TreeBranch, { label: string; hint: string }>; nodes: TreeNode[] }
export type Allocation = Record<string, number>;

export const TIER_BOND: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
export const RANK_POWER = 0.15, RANK_COOLDOWN = 0.08;

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

/** Monta a árvore de um Companion a partir do catálogo publicado na Forja. */
export function buildSkillTree(catalog: SkillDef[], c: { essence: Element | null; species: SpeciesKey }): SkillTree {
  const fits = catalog.filter((s) => skillFits(s, c.essence, 'biped', c.species));
  const ess = fits.filter((s) => s.slot === 'essence' && s.essence).sort((a, b) => a.unlockBond - b.unlockBond || a.slug.localeCompare(b.slug)).slice(0, 2);
  const basic = fits.filter((s) => s.slot === 'basic').sort((a, b) => b.classes.length - a.classes.length || a.slug.localeCompare(b.slug))[0];
  const form = fits.find((s) => s.slot === 'form' && s.classes.includes(c.species)) ?? fits.find((s) => s.slot === 'form');
  const supreme = fits.find((s) => s.slot === 'supreme');
  const sp = SPECIES[c.species];
  const [p1, p2] = SPECIES_PASSIVES[c.species];
  const essLabel = c.essence ? ELEMENTS[c.essence].label : 'Essência';
  const nodes: TreeNode[] = [];
  const add = (n: Omit<TreeNode, 'maxRank' | 'requires'> & Partial<Pick<TreeNode, 'maxRank' | 'requires'>>) => nodes.push({ maxRank: 1, requires: [], ...n });

  // Essência
  if (ess[0]) {
    add({ id: 'e1', branch: 'essencia', tier: 1, kind: 'skill', name: ess[0].name, description: ess[0].description, skill: ess[0].slug });
    add({ id: 'e2', branch: 'essencia', tier: 2, kind: 'rank', name: `${ess[0].name}+`, description: `Mais forte e mais rápida: +${RANK_POWER * 100}% de efeito e –${RANK_COOLDOWN * 100}% de recarga por nível.`, skill: ess[0].slug, maxRank: 3, requires: ['e1'] });
  }
  add({ id: 'e3', branch: 'essencia', tier: 3, kind: 'passive', name: `Afinidade com ${essLabel}`, description: '+3% de poder por ponto.', bonus: { poder: 3 }, maxRank: 3, requires: ess[0] ? ['e1'] : [] });
  if (ess[1]) {
    add({ id: 'e4', branch: 'essencia', tier: 4, kind: 'skill', name: ess[1].name, description: ess[1].description, skill: ess[1].slug, requires: ['e3'] });
    add({ id: 'e5', branch: 'essencia', tier: 5, kind: 'rank', name: `${ess[1].name}+`, description: `+${RANK_POWER * 100}% de efeito e –${RANK_COOLDOWN * 100}% de recarga por nível.`, skill: ess[1].slug, maxRank: 3, requires: ['e4'] });
  }

  // Classe
  add({ id: 'c1', branch: 'classe', tier: 1, kind: 'passive', name: p1.name, description: p1.description, bonus: p1.bonus, maxRank: 3 });
  if (form) {
    add({ id: 'c2', branch: 'classe', tier: 2, kind: 'skill', name: form.name, description: form.description, skill: form.slug, requires: ['c1'] });
    add({ id: 'c3', branch: 'classe', tier: 3, kind: 'rank', name: `${form.name}+`, description: `+${RANK_POWER * 100}% de efeito e –${RANK_COOLDOWN * 100}% de recarga por nível.`, skill: form.slug, maxRank: 3, requires: ['c2'] });
  }
  add({ id: 'c4', branch: 'classe', tier: 4, kind: 'passive', name: p2.name, description: p2.description, bonus: p2.bonus, maxRank: 3, requires: [form ? 'c2' : 'c1'] });
  add({ id: 'c5', branch: 'classe', tier: 5, kind: 'passive', name: `Linhagem ${sp.label}`, description: `Afinidade da classe (${sp.affinities.map((e) => ELEMENTS[e].label).join(' e ')}): as habilidades dessas essências custam 20% menos SP (em vez de 10%).`, bonus: {}, requires: ['c4'] });

  // Vínculo
  if (basic) add({ id: 'v1', branch: 'vinculo', tier: 1, kind: 'rank', name: `${basic.name}+`, description: `O golpe básico: +${RANK_POWER * 100}% de dano por nível.`, skill: basic.slug, maxRank: 3 });
  add({ id: 'v2', branch: 'vinculo', tier: 2, kind: 'passive', name: 'Fôlego', description: '+5% de energia por ponto.', bonus: { energia: 5 }, maxRank: 3 });
  add({ id: 'v3', branch: 'vinculo', tier: 3, kind: 'passive', name: 'Coração Firme', description: '+5% de vida por ponto.', bonus: { vida: 5 }, maxRank: 3, requires: ['v2'] });
  add({ id: 'v4', branch: 'vinculo', tier: 4, kind: 'passive', name: 'Mesma Sintonia', description: 'Os seus chamados chegam mais rápido: +5% de sintonia por ponto.', bonus: { sintonia: 5 }, maxRank: 3, requires: ['v3'] });
  if (supreme) add({ id: 'v5', branch: 'vinculo', tier: 5, kind: 'skill', name: supreme.name, description: supreme.description, skill: supreme.slug, requires: ['v4'] });

  return {
    branches: {
      essencia: { label: essLabel, hint: 'Habilidades da essência e a maestria delas.' },
      classe: { label: sp.label, hint: `${sp.lineage}. Passivas da classe e a habilidade de forma.` },
      vinculo: { label: 'Vínculo', hint: 'Golpe básico, fôlego, vida e, no fim, a Sintonia suprema.' },
    },
    nodes,
  };
}

/** Pode pôr mais um ponto neste nó? Devolve o motivo quando não pode. */
export function canSpend(tree: SkillTree, alloc: Allocation, nodeId: string, bondLevel: number, points: number): string | null {
  const n = tree.nodes.find((x) => x.id === nodeId);
  if (!n) return 'Nó não existe.';
  if ((alloc[nodeId] ?? 0) >= n.maxRank) return 'Já está no máximo.';
  if (spent(alloc) >= points) return 'Sem pontos livres.';
  if (bondLevel < TIER_BOND[n.tier]) return `Abre no vínculo ${TIER_BOND[n.tier]}.`;
  const missing = n.requires.filter((r) => !(alloc[r] > 0));
  if (missing.length) return `Precisa de ${missing.map((r) => tree.nodes.find((x) => x.id === r)?.name ?? r).join(', ')}.`;
  return null;
}

export const spent = (alloc: Allocation) => Object.values(alloc).reduce((t, v) => t + Math.max(0, v | 0), 0);

/** Confere uma distribuição inteira (servidor/carregamento): tira o que não vale, na ordem das fileiras. */
export function validateAllocation(tree: SkillTree, alloc: Allocation, bondLevel: number, points: number): Allocation {
  const out: Allocation = {};
  for (const n of [...tree.nodes].sort((a, b) => a.tier - b.tier)) {
    const want = Math.max(0, Math.min(n.maxRank, Math.floor(Number(alloc[n.id]) || 0)));
    for (let i = 0; i < want; i++) if (!canSpend(tree, out, n.id, bondLevel, points)) out[n.id] = (out[n.id] ?? 0) + 1;
  }
  return out;
}

/** Resultado da distribuição: habilidades abertas (com nível), bônus de atributos e afinidade da classe. */
export function treeEffects(tree: SkillTree, alloc: Allocation) {
  const skills = new Map<string, number>(); // slug → nível (1 = aberta)
  const bonus: Partial<Record<AttrKey, number>> = {};
  let lineage = false;
  for (const n of tree.nodes) {
    const r = alloc[n.id] ?? 0;
    if (!r) continue;
    if (n.kind === 'skill' && n.skill) skills.set(n.skill, Math.max(1, skills.get(n.skill) ?? 0));
    if (n.kind === 'rank' && n.skill) skills.set(n.skill, (skills.get(n.skill) ?? 1) + r);
    for (const [k, v] of Object.entries(n.bonus ?? {})) bonus[k as AttrKey] = (bonus[k as AttrKey] ?? 0) + (v as number) * r;
    if (n.id === 'c5') lineage = true;
  }
  // afinidade da classe = redução no custo de SP da essência afim (Constelação Viva), não mais bônus de dano
  return { skills, bonus, lineage, classAffinity: lineage ? 0.2 : 0.1 };
}
