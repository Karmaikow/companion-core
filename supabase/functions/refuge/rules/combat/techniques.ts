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

/**
 * Técnicas da arma na mão, já infundidas, abertas pelo vínculo. `catalog` são as da Forja (slot "technique"): pelo
 * mesmo slug, a da Forja vale no lugar da que vem com o jogo; as novas entram junto.
 */
export function techniquesFor(catalog: SkillDef[], weapon: WeaponKind | null | undefined, essence: Element | null, bond: number): SkillDef[] {
  if (!weapon) return [];
  const forged = catalog.filter((s) => s.slot === 'technique' && s.weapon);
  const all = [...WEAPON_TECHNIQUES.filter((t) => !forged.some((f) => f.slug === t.slug)), ...forged];
  return all.filter((t) => t.weapon === weapon && t.unlockBond <= bond).sort((a, b) => a.unlockBond - b.unlockBond || a.slug.localeCompare(b.slug)).map((t) => infuse(t, essence));
}

/** Técnicas de um tipo de arma que ainda vão abrir (para o painel mostrar o que vem pela frente). */
export function lockedTechniques(catalog: SkillDef[], weapon: WeaponKind | null | undefined, bond: number): SkillDef[] {
  if (!weapon) return [];
  const forged = catalog.filter((s) => s.slot === 'technique' && s.weapon);
  return [...WEAPON_TECHNIQUES.filter((t) => !forged.some((f) => f.slug === t.slug)), ...forged].filter((t) => t.weapon === weapon && t.unlockBond > bond);
}
