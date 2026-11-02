/**
 * Técnicas de arma — a arma dá o golpe, a essência dá o elemento.
 *
 * Em vez de uma habilidade por arma × essência × classe, cada tipo de arma tem poucas técnicas próprias (estocada,
 * corte giratório, tiro preciso...) e, na hora de usar, elas saem infundidas com a essência do Companion: o dano passa
 * a ser daquele elemento (afinidades valem), o visual muda de estilo e de cor, e entra o efeito da infusão (fogo
 * queima, gelo deixa lento, terra atordoa...). Uma espada de fogo e uma de gelo jogam diferente com as mesmas 4 técnicas.
 *
 * Elas não ocupam pontos da árvore: abrem pelo vínculo enquanto a arma daquele tipo estiver na mão, e trocam sozinhas na
 * barra quando a arma muda. Os focos de elemento da árvore (elementPct) também valem para elas, já que saem com a
 * essência. Dano físico (Força), salvo quando a técnica disser outra coisa.
 */
import type { Element } from '../identity.ts';
import { evolutionStage, type Tier } from '../tiers.ts';
import type { SkillDef, SkillShape, StatusKey, VfxStyle, WeaponKind } from './skills.ts';

export interface Infusion {
  /** o que a infusão faz, para mostrar na barra e no painel */
  text: string;
  status: { key: StatusKey; chance: number; seconds: number } | null;
  /** multiplicador do dano (vento corta mais fundo) */
  power: number;
  style: VfxStyle;
}

/** Efeito de cada essência nas técnicas de arma. Os estados funcionam nos monstros (WorldCreatures). */
export const INFUSIONS: Record<Element, Infusion> = {
  fogo: { text: 'pode queimar (dano por segundo)', status: { key: 'queimando', chance: 0.35, seconds: 3 }, power: 1, style: 'chamas' },
  agua: { text: 'encharca e deixa lento', status: { key: 'lento', chance: 0.3, seconds: 2.5 }, power: 1, style: 'gotas' },
  terra: { text: 'pode atordoar', status: { key: 'atordoado', chance: 0.18, seconds: 0.9 }, power: 1, style: 'pedras' },
  vento: { text: 'corta mais fundo (+12% de dano)', status: null, power: 1.12, style: 'vento' },
  luz: { text: 'ofusca: o alvo erra mais', status: { key: 'ofuscado', chance: 0.3, seconds: 3 }, power: 1, style: 'luz' },
  sombra: { text: 'marca: o alvo recebe +15% de dano', status: { key: 'sombreado', chance: 0.3, seconds: 4 }, power: 1, style: 'sombra' },
  gelo: { text: 'congela de leve: deixa lento', status: { key: 'lento', chance: 0.4, seconds: 2.5 }, power: 1, style: 'gelo' },
  raio: { text: 'pode paralisar por um instante', status: { key: 'atordoado', chance: 0.22, seconds: 0.6 }, power: 1, style: 'raios' },
  natureza: { text: 'raízes prendem o alvo no lugar', status: { key: 'enraizado', chance: 0.25, seconds: 1.8 }, power: 1, style: 'folhas' },
  veneno: { text: 'pode envenenar (acumula até 3)', status: { key: 'envenenado', chance: 0.4, seconds: 4 }, power: 1, style: 'veneno' },
};

const T = (slug: string, name: string, weapon: WeaponKind, shape: SkillShape, o: Partial<SkillDef> & { description: string }): SkillDef => ({
  slug, name, slot: 'technique', weapon, essence: null, shape, classes: [], bodies: [], range: 1.8, radius: 1, angle: 60, power: 0, heal: 0, energy: 15,
  cooldown: 4, windup: 0.2, status: null, anim: weapon === 'arco' ? 'shoot' : 'attack', vfx: { style: 'impacto', color: 'essence', ground: false }, unlockBond: 1,
  modality: 'fisica', ...o,
});

/** Técnicas que vêm com o jogo (a Forja pode sobrescrever pelo slug). Fase 1: espada e arco. */
export const WEAPON_TECHNIQUES: SkillDef[] = [
  // espada: versátil, corpo a corpo
  T('espada-corte-giratorio', 'Corte Giratório', 'espada', 'aura', { description: 'Gira com a lâmina estendida e corta todos em volta.', power: 55, energy: 18, cooldown: 5, windup: 0.25, radius: 2.2, vfx: { style: 'impacto', color: 'essence', ground: true } }),
  T('espada-estocada', 'Estocada', 'espada', 'line', { description: 'Avança o peso do corpo numa estocada reta que atravessa quem estiver na frente.', power: 70, energy: 15, cooldown: 4, windup: 0.2, range: 3.2, radius: 0.5, unlockBond: 3 }),
  T('espada-golpe-ascendente', 'Golpe Ascendente', 'espada', 'melee', { description: 'Um corte de baixo para cima, pesado, que pode desequilibrar o alvo.', power: 85, energy: 20, cooldown: 7, windup: 0.3, range: 2, status: { key: 'atordoado', chance: 0.35, seconds: 1 }, unlockBond: 6 }),
  T('espada-investida-da-lamina', 'Investida da Lâmina', 'espada', 'dash', { description: 'Dispara para a frente com a espada em riste, cortando tudo no caminho.', power: 65, energy: 22, cooldown: 8, windup: 0.3, range: 5, radius: 0.8, anim: 'run', unlockBond: 9 }),
  // arco: distância, mira
  T('arco-tiro-preciso', 'Tiro Preciso', 'arco', 'projectile', { description: 'Respira, mira e solta uma flecha certeira de longe.', power: 65, energy: 12, cooldown: 3, windup: 0.35, range: 14, radius: 0.35 }),
  T('arco-flecha-perfurante', 'Flecha Perfurante', 'arco', 'line', { description: 'Uma flecha tão forte que atravessa todos em linha reta.', power: 60, energy: 18, cooldown: 5, windup: 0.45, range: 12, radius: 0.4, unlockBond: 3 }),
  T('arco-leque-de-flechas', 'Leque de Flechas', 'arco', 'cone', { description: 'Três flechas de uma vez, abertas em leque à frente.', power: 45, energy: 20, cooldown: 6, windup: 0.35, range: 7, angle: 50, unlockBond: 6 }),
  T('arco-chuva-de-flechas', 'Chuva de Flechas', 'arco', 'circle', { description: 'Atira para o alto e as flechas caem sobre uma área.', power: 50, energy: 28, cooldown: 10, windup: 0.9, range: 12, radius: 2.4, vfx: { style: 'impacto', color: 'essence', ground: true }, unlockBond: 9 }),
];

/**
 * A técnica pronta para usar com esta essência: ganha o elemento (dano, afinidade e cor), o estilo do visual e o
 * efeito da infusão (o estado próprio da técnica, se tiver, vence). Sem essência, sai como está.
 */
export function infuse(sk: SkillDef, essence: Element | null): SkillDef {
  if (!essence || sk.slot !== 'technique') return sk;
  const inf = INFUSIONS[essence];
  return {
    ...sk,
    essence,
    power: Math.round(sk.power * inf.power),
    status: sk.status ?? inf.status,
    vfx: { ...sk.vfx, style: sk.vfx.style === 'impacto' ? inf.style : sk.vfx.style, color: sk.vfx.color === 'companion' ? 'companion' : 'essence' },
  };
}

// ---------------------------------------------------------------------------
// Evolução pelo tier da arma: no T3 a técnica evolui por um de dois caminhos (a pessoa escolhe); no T5, a forma final
// do caminho. O slug não muda (a barra e os combos continuam valendo); muda o nome e os números.
// ---------------------------------------------------------------------------

export interface TechPatch { name: string; power?: number; range?: number; radius?: number; angle?: number; cooldown?: number; repeat?: number; status?: SkillDef['status'] }
export interface TechPath { id: 'a' | 'b'; label: string; t3: TechPatch; t5: TechPatch }

const P = (id: 'a' | 'b', label: string, t3: TechPatch, t5: TechPatch): TechPath => ({ id, label, t3, t5 });
/** Caminhos de cada técnica. `power` e `cooldown` multiplicam; o resto substitui. Repetições pagam com menos poder por golpe. */
export const TECH_EVOLUTIONS: Record<string, [TechPath, TechPath]> = {
  'espada-corte-giratorio': [
    P('a', 'Alcance', { name: 'Ciclone', radius: 3 }, { name: 'Ciclone de Lâminas', radius: 3.6, power: 1.3 }),
    P('b', 'Golpes', { name: 'Giro Duplo', repeat: 2, power: 0.65 }, { name: 'Giro Triplo', repeat: 3, power: 0.6 }),
  ],
  'espada-estocada': [
    P('a', 'Alcance', { name: 'Estocada Longa', range: 5 }, { name: 'Estocada do Horizonte', range: 7, power: 1.3 }),
    P('b', 'Golpes', { name: 'Estocada Dupla', repeat: 2, power: 0.65 }, { name: 'Estocada Tripla', repeat: 3, power: 0.6 }),
  ],
  'espada-golpe-ascendente': [
    P('a', 'Controle', { name: 'Golpe Trovejante', status: { key: 'atordoado', chance: 0.6, seconds: 1.5 } }, { name: 'Martelo do Céu', status: { key: 'atordoado', chance: 0.9, seconds: 2 }, power: 1.25 }),
    P('b', 'Área', { name: 'Corte Lunar', angle: 120, range: 2.4 }, { name: 'Meia-Lua', angle: 160, range: 2.8, power: 1.3 }),
  ],
  'espada-investida-da-lamina': [
    P('a', 'Alcance', { name: 'Investida Longa', range: 7 }, { name: 'Investida do Cometa', range: 9, power: 1.3 }),
    P('b', 'Área', { name: 'Rastro Cortante', radius: 1.3 }, { name: 'Rastro de Lâminas', radius: 1.8, repeat: 2, power: 0.7 }),
  ],
  'arco-tiro-preciso': [
    P('a', 'Força', { name: 'Tiro Certeiro', power: 1.3, range: 16 }, { name: 'Tiro do Falcão', power: 1.6, range: 18 }),
    P('b', 'Ritmo', { name: 'Tiro Rápido', cooldown: 0.6 }, { name: 'Rajada', cooldown: 0.45, repeat: 2, power: 0.7 }),
  ],
  'arco-flecha-perfurante': [
    P('a', 'Área', { name: 'Flecha Larga', radius: 0.8 }, { name: 'Flecha Avalanche', radius: 1.2, power: 1.3 }),
    P('b', 'Golpes', { name: 'Flecha Dupla', repeat: 2, power: 0.65 }, { name: 'Flecha Tripla', repeat: 3, power: 0.6 }),
  ],
  'arco-leque-de-flechas': [
    P('a', 'Área', { name: 'Leque Aberto', angle: 90 }, { name: 'Leque do Pavão', angle: 130, power: 1.25 }),
    P('b', 'Golpes', { name: 'Leque Duplo', repeat: 2, power: 0.65 }, { name: 'Leque Triplo', repeat: 3, power: 0.6 }),
  ],
  'arco-chuva-de-flechas': [
    P('a', 'Área', { name: 'Tempestade', radius: 3.4 }, { name: 'Tempestade de Aço', radius: 4.4, power: 1.25 }),
    P('b', 'Golpes', { name: 'Saraivada', repeat: 3, power: 0.5 }, { name: 'Saraivada Sem Fim', repeat: 4, power: 0.48 }),
  ],
};

export const evolutionsOf = (slug: string): [TechPath, TechPath] | null => TECH_EVOLUTIONS[slug] ?? null;

/** A técnica no tier da arma: T1–T2 base; T3–T4 o patch do caminho; T5 a forma final. Sem caminho escolhido, fica na base. */
export function evolve(sk: SkillDef, tier: Tier, path: 'a' | 'b' | null | undefined): SkillDef {
  const stage = evolutionStage(tier), ev = TECH_EVOLUTIONS[sk.slug];
  if (!stage || !ev || !path) return sk;
  const p = (ev.find((x) => x.id === path) ?? ev[0])[stage === 2 ? 't5' : 't3'];
  return {
    ...sk,
    name: p.name,
    power: Math.round(sk.power * (p.power ?? 1)),
    cooldown: Math.round(sk.cooldown * (p.cooldown ?? 1) * 10) / 10,
    ...(p.range !== undefined ? { range: p.range } : {}),
    ...(p.radius !== undefined ? { radius: p.radius } : {}),
    ...(p.angle !== undefined ? { angle: p.angle, shape: sk.shape === 'melee' ? 'cone' : sk.shape } : {}),
    ...(p.repeat !== undefined ? { repeat: p.repeat } : {}),
    ...(p.status !== undefined ? { status: p.status } : {}),
  };
}

/**
 * Técnicas da arma na mão, evoluídas pelo tier e infundidas, abertas pelo vínculo. `catalog` são as da Forja (slot
 * "technique"): pelo mesmo slug, a da Forja vale no lugar da que vem com o jogo; as novas entram junto.
 */
export function techniquesFor(catalog: SkillDef[], weapon: WeaponKind | null | undefined, essence: Element | null, bond: number, evo?: { tier: Tier; paths: Record<string, 'a' | 'b'> }): SkillDef[] {
  if (!weapon) return [];
  const forged = catalog.filter((s) => s.slot === 'technique' && s.weapon);
  const all = [...WEAPON_TECHNIQUES.filter((t) => !forged.some((f) => f.slug === t.slug)), ...forged];
  return all.filter((t) => t.weapon === weapon && t.unlockBond <= bond).sort((a, b) => a.unlockBond - b.unlockBond || a.slug.localeCompare(b.slug))
    .map((t) => infuse(evo ? evolve(t, evo.tier, evo.paths[t.slug]) : t, essence));
}

/** Técnicas de um tipo de arma que ainda vão abrir (para o painel mostrar o que vem pela frente). */
export function lockedTechniques(catalog: SkillDef[], weapon: WeaponKind | null | undefined, bond: number): SkillDef[] {
  if (!weapon) return [];
  const forged = catalog.filter((s) => s.slot === 'technique' && s.weapon);
  return [...WEAPON_TECHNIQUES.filter((t) => !forged.some((f) => f.slug === t.slug)), ...forged].filter((t) => t.weapon === weapon && t.unlockBond > bond);
}
