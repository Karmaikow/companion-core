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

/** Técnicas que vêm com o jogo (a Forja pode sobrescrever pelo slug): espada, faca, maça, lança, arco, cajado, varinha (Escola Arcana). */
export const WEAPON_TECHNIQUES: SkillDef[] = [
  // espada: versátil, corpo a corpo
  T('espada-corte-giratorio', 'Corte Giratório', 'espada', 'aura', { description: 'Gira com a lâmina estendida e corta todos em volta.', power: 55, energy: 18, cooldown: 5, windup: 0.25, radius: 2.2, vfx: { style: 'impacto', color: 'essence', ground: true } }),
  T('espada-estocada', 'Estocada', 'espada', 'line', { description: 'Avança o peso do corpo numa estocada reta que atravessa quem estiver na frente.', power: 70, energy: 15, cooldown: 4, windup: 0.2, range: 3.2, radius: 0.5, unlockBond: 3 }),
  T('espada-golpe-ascendente', 'Golpe Ascendente', 'espada', 'melee', { description: 'Um corte de baixo para cima, pesado, que pode desequilibrar o alvo.', power: 85, energy: 20, cooldown: 7, windup: 0.3, range: 2, status: { key: 'atordoado', chance: 0.35, seconds: 1 }, unlockBond: 6 }),
  T('espada-investida-da-lamina', 'Investida da Lâmina', 'espada', 'dash', { description: 'Dispara para a frente com a espada em riste, cortando tudo no caminho.', power: 65, energy: 22, cooldown: 8, windup: 0.3, range: 5, radius: 0.8, anim: 'run', unlockBond: 9 }),
  // faca: curto alcance, rápido, crítico e sangramento
  T('faca-golpe-rapido', 'Golpe Rápido', 'faca', 'melee', { description: 'Uma estocada veloz que acerta primeiro.', power: 35, energy: 8, cooldown: 2, windup: 0.1, range: 1.4, radius: 0.3 }),
  T('faca-corte-cruzado', 'Corte Cruzado', 'faca', 'melee', { description: 'Dois cortes em X que sangram o alvo.', power: 50, energy: 14, cooldown: 4, windup: 0.2, range: 1.5, radius: 0.4, status: { key: 'sombreado', chance: 0.4, seconds: 3 }, unlockBond: 3 }),
  T('faca-emboscada', 'Emboscada', 'faca', 'dash', { description: 'Some por um instante e reaparece atrás do alvo com um golpe certeiro.', power: 75, energy: 20, cooldown: 7, windup: 0.3, range: 3.5, radius: 0.3, anim: 'run', unlockBond: 6 }),
  T('faca-danca-das-laminas', 'Dança das Lâminas', 'faca', 'aura', { description: 'Gira num redemoinho de cortes rápidos em volta de si.', power: 40, energy: 22, cooldown: 8, windup: 0.25, radius: 1.8, repeat: 3, unlockBond: 9 }),
  // maça: pesada, atordoa, empurra, quebra defesa
  T('maca-pancada', 'Pancada', 'maca', 'melee', { description: 'Um golpe pesado e direto que abala o alvo.', power: 65, energy: 16, cooldown: 4, windup: 0.3, range: 1.7, radius: 0.5, status: { key: 'atordoado', chance: 0.3, seconds: 1 } }),
  T('maca-golpe-terrestre', 'Golpe Terrestre', 'maca', 'aura', { description: 'Bate a maça no chão; uma onda de choque atordoa quem está perto.', power: 50, energy: 18, cooldown: 5, windup: 0.4, radius: 2.2, status: { key: 'atordoado', chance: 0.5, seconds: 1.5 }, unlockBond: 3 }),
  T('maca-esmagar', 'Esmagar', 'maca', 'melee', { description: 'Um golpe de cima para baixo que esmaga a guarda e deixa lento.', power: 90, energy: 22, cooldown: 7, windup: 0.45, range: 1.8, status: { key: 'lento', chance: 0.45, seconds: 2.5 }, unlockBond: 6 }),
  T('maca-investida-pesada', 'Investida Pesada', 'maca', 'dash', { description: 'Avança com a maça erguida e a deixa cair com todo o peso.', power: 80, energy: 26, cooldown: 9, windup: 0.4, range: 4, radius: 1, anim: 'run', unlockBond: 9 }),
  // lança: longo alcance, controle de espaço, perfuração
  T('lanca-estocada-longa', 'Estocada Longa', 'lanca', 'line', { description: 'Estende a lança ao máximo numa estocada que atravessa fileiras.', power: 60, energy: 14, cooldown: 3.5, windup: 0.25, range: 3.5, radius: 0.4 }),
  T('lanca-varredura', 'Varredura', 'lanca', 'cone', { description: 'Gira a lança num arco largo, empurrando todos para trás.', power: 50, energy: 16, cooldown: 5, windup: 0.3, range: 2.8, angle: 80, status: { key: 'atordoado', chance: 0.25, seconds: 1 }, unlockBond: 3 }),
  T('lanca-perfurante', 'Perfurante', 'lanca', 'line', { description: 'Uma estocada tão forte que ignora armadura e atravessa vários alvos.', power: 80, energy: 20, cooldown: 6, windup: 0.35, range: 3.2, radius: 0.5, unlockBond: 6 }),
  T('lanca-ceu-e-terra', 'Céu e Terra', 'lanca', 'dash', { description: 'Salta alto e crava a lança no chão, criando uma onda de choque.', power: 95, energy: 28, cooldown: 10, windup: 0.5, range: 5, radius: 2.5, anim: 'jump', unlockBond: 9 }),
  // arco: distância, mira
  T('arco-tiro-preciso', 'Tiro Preciso', 'arco', 'projectile', { description: 'Respira, mira e solta uma flecha certeira de longe.', power: 65, energy: 12, cooldown: 3, windup: 0.35, range: 14, radius: 0.35 }),
  T('arco-flecha-perfurante', 'Flecha Perfurante', 'arco', 'line', { description: 'Uma flecha tão forte que atravessa todos em linha reta.', power: 60, energy: 18, cooldown: 5, windup: 0.45, range: 12, radius: 0.4, unlockBond: 3 }),
  T('arco-leque-de-flechas', 'Leque de Flechas', 'arco', 'cone', { description: 'Três flechas de uma vez, abertas em leque à frente.', power: 45, energy: 20, cooldown: 6, windup: 0.35, range: 7, angle: 50, unlockBond: 6 }),
  // cajado (Escola Arcana): magia pura, só para quem estuda lá — matrícula pede cajado de duas mãos T4
  T('cajado-seta-arcana', 'Seta Arcana', 'cajado', 'projectile', { description: 'Uma seta de energia pura disparada da ponta do cajado.', power: 75, energy: 14, cooldown: 3, windup: 0.3, range: 12, radius: 0.4, modality: 'magica', anim: 'attack', vfx: { style: 'luz', color: 'essence', ground: false } }),
  T('cajado-selo-runico', 'Selo Rúnico', 'cajado', 'circle', { description: 'Grava um selo no chão que explode e prende quem estiver em cima.', power: 85, energy: 22, cooldown: 7, windup: 0.6, range: 9, radius: 2.2, status: { key: 'enraizado', chance: 0.5, seconds: 1.5 }, modality: 'magica', anim: 'attack', vfx: { style: 'luz', color: 'essence', ground: true }, unlockBond: 3 }),
  T('cajado-explosao-arcana', 'Explosão Arcana', 'cajado', 'aura', { description: 'Bate o cajado no chão e libera uma onda arcana em volta.', power: 100, energy: 26, cooldown: 9, windup: 0.4, radius: 2.8, modality: 'magica', anim: 'attack', vfx: { style: 'luz', color: 'essence', ground: true }, unlockBond: 6 }),
  // varinha: magia rápida, curto alcance, utilidade
  T('varinha-disparo-magico', 'Disparo Mágico', 'varinha', 'projectile', { description: 'Um projétil rápido de energia pura.', power: 45, energy: 10, cooldown: 2.5, windup: 0.15, range: 8, radius: 0.3, modality: 'magica', anim: 'attack', vfx: { style: 'luz', color: 'essence', ground: false } }),
  T('varinha-raio-encadeado', 'Raio Encadeado', 'varinha', 'line', { description: 'Um raio que salta entre até 3 alvos próximos.', power: 55, energy: 16, cooldown: 4, windup: 0.25, range: 7, radius: 0.4, modality: 'magica', anim: 'attack', vfx: { style: 'raios', color: 'essence', ground: false }, unlockBond: 3 }),
  T('varinha-bolha-protetora', 'Bolha Protetora', 'varinha', 'aura', { description: 'Cria uma bolha que absorve dano e cura quem está dentro.', heal: 40, energy: 18, cooldown: 8, windup: 0.2, radius: 2, modality: 'magica', anim: 'happy', vfx: { style: 'luz', color: 'essence', ground: true }, unlockBond: 6 }),
  T('varinha-explosao-caotica', 'Explosão Caótica', 'varinha', 'circle', { description: 'Libera energia instável numa área; o elemento muda a cada uso.', power: 85, energy: 24, cooldown: 9, windup: 0.5, range: 6, radius: 2.5, modality: 'magica', anim: 'attack', vfx: { style: 'luz', color: 'essence', ground: true }, unlockBond: 9 }),
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

export interface TechPatch { name: string; power?: number; range?: number; radius?: number; angle?: number; cooldown?: number; repeat?: number; status?: SkillDef['status']; heal?: number }
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
  'cajado-seta-arcana': [
    P('a', 'Força', { name: 'Lança Arcana', power: 1.3, range: 14 }, { name: 'Lança do Arquimago', power: 1.6, range: 16 }),
    P('b', 'Golpes', { name: 'Setas Gêmeas', repeat: 2, power: 0.65 }, { name: 'Chuva de Setas', repeat: 3, power: 0.6 }),
  ],
  'cajado-selo-runico': [
    P('a', 'Controle', { name: 'Selo Aprisionador', status: { key: 'enraizado', chance: 0.85, seconds: 2.2 } }, { name: 'Grande Selo', status: { key: 'enraizado', chance: 1, seconds: 3 }, radius: 2.8, power: 1.2 }),
    P('b', 'Área', { name: 'Círculo Rúnico', radius: 3.2 }, { name: 'Mandala Rúnica', radius: 4.2, power: 1.25 }),
  ],
  'cajado-explosao-arcana': [
    P('a', 'Área', { name: 'Onda Arcana', radius: 3.6 }, { name: 'Maré Arcana', radius: 4.6, power: 1.25 }),
    P('b', 'Golpes', { name: 'Pulso Duplo', repeat: 2, power: 0.65 }, { name: 'Pulso Triplo', repeat: 3, power: 0.6 }),
  ],
  'arco-chuva-de-flechas': [
    P('a', 'Área', { name: 'Tempestade', radius: 3.4 }, { name: 'Tempestade de Aço', radius: 4.4, power: 1.25 }),
    P('b', 'Golpes', { name: 'Saraivada', repeat: 3, power: 0.5 }, { name: 'Saraivada Sem Fim', repeat: 4, power: 0.48 }),
  ],
  // faca
  'faca-golpe-rapido': [
    P('a', 'Velocidade', { name: 'Golpe Relâmpago', cooldown: 0.7 }, { name: 'Toque do Vento', cooldown: 0.5, power: 1.2 }),
    P('b', 'Sangramento', { name: 'Corte Fundo', status: { key: 'sombreado', chance: 0.7, seconds: 4 } }, { name: 'Hemorragia', status: { key: 'sombreado', chance: 1, seconds: 6 }, power: 1.25 }),
  ],
  'faca-corte-cruzado': [
    P('a', 'Alcance', { name: 'Corte Amplo', radius: 0.7 }, { name: 'Corte Circular', radius: 1, power: 1.3 }),
    P('b', 'Golpes', { name: 'Corte Triplo', repeat: 3, power: 0.6 }, { name: 'Corte Quíntuplo', repeat: 5, power: 0.55 }),
  ],
  'faca-emboscada': [
    P('a', 'Alcance', { name: 'Emboscada Longa', range: 5 }, { name: 'Emboscada Sombria', range: 7, power: 1.3 }),
    P('b', 'Controle', { name: 'Emboscada Cegante', status: { key: 'ofuscado', chance: 0.6, seconds: 2 } }, { name: 'Golpe do Vazio', status: { key: 'ofuscado', chance: 0.9, seconds: 3 }, power: 1.25 }),
  ],
  'faca-danca-das-laminas': [
    P('a', 'Área', { name: 'Redemoinho Cortante', radius: 2.4 }, { name: 'Tempestade de Aço', radius: 3, power: 1.25 }),
    P('b', 'Golpes', { name: 'Dança Infinita', repeat: 5, power: 0.5 }, { name: 'Valsa das Lâminas', repeat: 7, power: 0.45 }),
  ],
  // maça
  'maca-pancada': [
    P('a', 'Força', { name: 'Pancada Brutal', power: 1.3 }, { name: 'Golpe do Titã', power: 1.6 }),
    P('b', 'Atordoamento', { name: 'Pancada Certeira', status: { key: 'atordoado', chance: 0.6, seconds: 1.5 } }, { name: 'Impacto Sísmico', status: { key: 'atordoado', chance: 0.9, seconds: 2 }, power: 1.25 }),
  ],
  'maca-golpe-terrestre': [
    P('a', 'Área', { name: 'Onda Sísmica', radius: 3 }, { name: 'Terremoto', radius: 4, power: 1.3 }),
    P('b', 'Controle', { name: 'Solo Instável', status: { key: 'enraizado', chance: 0.4, seconds: 2 } }, { name: 'Prisão de Terra', status: { key: 'enraizado', chance: 0.7, seconds: 3 }, power: 1.2 }),
  ],
  'maca-esmagar': [
    P('a', 'Controle', { name: 'Esmagar Definitivo', status: { key: 'lento', chance: 0.8, seconds: 3.5 } }, { name: 'Peso do Mundo', status: { key: 'lento', chance: 1, seconds: 5 }, power: 1.25 }),
    P('b', 'Quebra', { name: 'Esmagar Armadura', status: { key: 'sombreado', chance: 0.6, seconds: 5 } }, { name: 'Quebra Total', status: { key: 'sombreado', chance: 1, seconds: 8 }, power: 1.2 }),
  ],
  'maca-investida-pesada': [
    P('a', 'Alcance', { name: 'Investida do Colosso', range: 6 }, { name: 'Investida da Montanha', range: 8, power: 1.3 }),
    P('b', 'Área', { name: 'Queda do Meteoro', radius: 1.8 }, { name: 'Impacto Catastrófico', radius: 2.5, repeat: 2, power: 0.7 }),
  ],
  // lança
  'lanca-estocada-longa': [
    P('a', 'Alcance', { name: 'Estocada Infinita', range: 5.5 }, { name: 'Estocada do Horizonte', range: 7.5, power: 1.3 }),
    P('b', 'Perfuração', { name: 'Perfuração Múltipla', repeat: 2, power: 0.65 }, { name: 'Perfuração em Cadeia', repeat: 3, power: 0.6 }),
  ],
  'lanca-varredura': [
    P('a', 'Área', { name: 'Varredura Ampla', angle: 120, range: 3.2 }, { name: 'Círculo de Lâminas', angle: 160, range: 3.6, power: 1.25 }),
    P('b', 'Empurrão', { name: 'Varredura Poderosa', status: { key: 'atordoado', chance: 0.5, seconds: 1.5 } }, { name: 'Varre-Tudo', status: { key: 'atordoado', chance: 0.8, seconds: 2 }, power: 1.2 }),
  ],
  'lanca-perfurante': [
    P('a', 'Força', { name: 'Perfurante Supremo', power: 1.3, range: 4 }, { name: 'Perfuração Absoluta', power: 1.6, range: 5 }),
    P('b', 'Multi', { name: 'Perfuração Dupla', repeat: 2, power: 0.65 }, { name: 'Perfuração Tripla', repeat: 3, power: 0.6 }),
  ],
  'lanca-ceu-e-terra': [
    P('a', 'Alcance', { name: 'Queda da Estrela', range: 7 }, { name: 'Meteoro Perfurante', range: 9, power: 1.3 }),
    P('b', 'Área', { name: 'Onda Sísmica', radius: 3.2 }, { name: 'Cataclismo', radius: 4.2, power: 1.25 }),
  ],
  // varinha
  'varinha-disparo-magico': [
    P('a', 'Força', { name: 'Disparo Arcano', power: 1.3, range: 10 }, { name: 'Disparo do Mago', power: 1.6, range: 12 }),
    P('b', 'Ritmo', { name: 'Disparo Rápido', cooldown: 0.6 }, { name: 'Rajada Mágica', cooldown: 0.4, repeat: 2, power: 0.7 }),
  ],
  'varinha-raio-encadeado': [
    P('a', 'Alvos', { name: 'Raio Múltiplo', radius: 0.8 }, { name: 'Cadeia de Raios', radius: 1.2, power: 1.3 }),
    P('b', 'Saltos', { name: 'Encadeamento Longo', range: 9 }, { name: 'Tempestade Encadeada', range: 11, repeat: 2, power: 0.7 }),
  ],
  'varinha-bolha-protetora': [
    P('a', 'Cura', { name: 'Bolha Curativa', heal: 1.5 }, { name: 'Bolha da Vida', heal: 2, radius: 2.8 }),
    P('b', 'Proteção', { name: 'Bolha Fortificada', status: { key: 'protegido', chance: 1, seconds: 3 } }, { name: 'Santitário', status: { key: 'protegido', chance: 1, seconds: 5 }, radius: 3.2 }),
  ],
  'varinha-explosao-caotica': [
    P('a', 'Área', { name: 'Explosão Primordial', radius: 3.2 }, { name: 'Caos Absoluto', radius: 4.2, power: 1.25 }),
    P('b', 'Instabilidade', { name: 'Explosão Múltipla', repeat: 2, power: 0.65 }, { name: 'Anomalia', repeat: 3, power: 0.6, status: { key: 'ofuscado', chance: 0.5, seconds: 3 } }),
  ],
};

/** Técnicas ensinadas por uma escola de Áster: só aparecem para quem estuda lá. */
export const TECHNIQUE_SCHOOL: Record<string, string> = { 'cajado-seta-arcana': 'arcana', 'cajado-selo-runico': 'arcana', 'cajado-explosao-arcana': 'arcana' };

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
    ...(p.heal !== undefined ? { heal: Math.round(sk.heal * (p.heal ?? 1)) } : {}),
  };
}

/**
 * Técnicas da arma na mão, evoluídas pelo tier e infundidas, abertas pelo vínculo. `catalog` são as da Forja (slot
 * "technique"): pelo mesmo slug, a da Forja vale no lugar da que vem com o jogo; as novas entram junto.
 */
export function techniquesFor(catalog: SkillDef[], weapon: WeaponKind | null | undefined, essence: Element | null, bond: number, evo?: { tier: Tier; paths: Record<string, 'a' | 'b'>; schools?: readonly string[] }): SkillDef[] {
  if (!weapon) return [];
  const forged = catalog.filter((s) => s.slot === 'technique' && s.weapon);
  const all = [...WEAPON_TECHNIQUES.filter((t) => !forged.some((f) => f.slug === t.slug)), ...forged];
  return all.filter((t) => t.weapon === weapon && t.unlockBond <= bond && (!TECHNIQUE_SCHOOL[t.slug] || !!evo?.schools?.includes(TECHNIQUE_SCHOOL[t.slug]))).sort((a, b) => a.unlockBond - b.unlockBond || a.slug.localeCompare(b.slug))
    .map((t) => infuse(evo ? evolve(t, evo.tier, evo.paths[t.slug]) : t, essence));
}

/** Técnicas de um tipo de arma que ainda vão abrir (para o painel mostrar o que vem pela frente). */
export function lockedTechniques(catalog: SkillDef[], weapon: WeaponKind | null | undefined, bond: number, schools: readonly string[] = []): SkillDef[] {
  if (!weapon) return [];
  const forged = catalog.filter((s) => s.slot === 'technique' && s.weapon);
  return [...WEAPON_TECHNIQUES.filter((t) => !forged.some((f) => f.slug === t.slug)), ...forged].filter((t) => t.weapon === weapon && (t.unlockBond > bond || (!!TECHNIQUE_SCHOOL[t.slug] && !schools.includes(TECHNIQUE_SCHOOL[t.slug]))));
}
