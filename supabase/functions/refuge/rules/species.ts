/**
 * Classes/Espécies dos Companions (v2). Todo Companion é humanoide: um rig só, as animações prontas de humanoide
 * servem para todos. A família descoberta na conversa (passaro, touro, felino, serpente, mistica — chaves antigas
 * mantidas, para não mudar contratos já gravados) vira uma linhagem humanoide com traços próprios:
 *
 * - traços simples (chifres, orelhas, escamas, penas no cabelo) vêm no próprio modelo 3D;
 * - cauda e asas NÃO vão no modelo (o rig humanoide não as anima bem): o jogo as desenha e anima por código,
 *   presas ao quadril e às costas, com física de mola (client/src/scene/Appendages.tsx).
 *
 * Afinidades: cada classe tem duas essências afins (+10% de dano e de cura com elas). Atributos: só tendências
 * anotadas por enquanto — o sistema de atributos entra com a batalha (ver claude/batalha-v1.md).
 */
import type { Element } from './identity.ts';
import type { FormFamily, IdentityContractV1 } from './identity.ts';
import { normalize } from './text.ts';

export type SpeciesKey = FormFamily;
export type TailKind = 'scaly' | 'fluffy' | 'tuft' | 'feather' | 'wisp';
export type WingKind = 'feather' | 'dragon' | 'fairy';
export type AttrKey = 'vida' | 'energia' | 'poder' | 'defesa' | 'agilidade' | 'sintonia';

export interface SpeciesDef {
  key: SpeciesKey;
  label: string;              // nome da classe
  lineage: string;            // frase curta para o jogador
  vocation: string;
  affinities: Element[];      // essências afins (+10%)
  attrs: Partial<Record<AttrKey, number>>; // tendência (−1..+2) — rascunho para o sistema de atributos
  features: string;           // traços no modelo (prompt, inglês)
  featuresPt: string;
  tail: TailKind | null;      // cauda desenhada pelo jogo
  wings: WingKind | null;     // asas desenhadas pelo jogo (dracônica só quando a descrição pede)
  formSkill: string;          // habilidade de forma (Forja)
  /** velocidade de movimento (1 = padrão): algumas classes andam mais rápido, outras mais devagar */
  speed: number;
  /** habilidade de ofício da classe (a Taurina forja armas e equipamentos) */
  craft?: { key: 'forja'; label: string; hint: string };
}

export const SPECIES: Record<SpeciesKey, SpeciesDef> = {
  serpente: {
    key: 'serpente', label: 'Dracônica', lineage: 'Herdeira dos dragões e serpentes', vocation: 'Controle',
    affinities: ['agua', 'fogo'], attrs: { defesa: 1, sintonia: 2, agilidade: -1 },
    features: 'small dragon horns, fin-like ears, a few shiny scales on the cheeks, forearms and shins, slit-pupil bright eyes',
    featuresPt: 'chifres pequenos, orelhas de barbatana, escamas nas bochechas, antebraços e canelas',
    tail: 'scaly', wings: null, formSkill: 'chicote-de-cauda', speed: 1.0,
  },
  passaro: {
    key: 'passaro', label: 'Alada', lineage: 'Gente do céu, de penas e ventos', vocation: 'Mobilidade e vento',
    affinities: ['vento', 'luz'], attrs: { agilidade: 2, energia: 1, defesa: -1 },
    features: 'feathers mixed in the hair, small feather tufts on the shoulders and ankles, light airy clothes',
    featuresPt: 'penas no cabelo, tufos de pena nos ombros e tornozelos',
    tail: null, wings: 'feather', formSkill: 'rasante', speed: 1.15,
  },
  felino: {
    key: 'felino', label: 'Feral', lineage: 'Orelhas atentas e passos leves', vocation: 'Agilidade e precisão',
    affinities: ['natureza', 'raio'], attrs: { agilidade: 2, poder: 1, vida: -1 },
    features: 'fluffy animal ears on top of the head, small fangs, soft fur cuffs on wrists and ankles',
    featuresPt: 'orelhas de bicho, presinhas, punhos de pelo',
    tail: 'fluffy', wings: null, formSkill: 'bote', speed: 1.25,
  },
  touro: {
    key: 'touro', label: 'Taurina', lineage: 'Força tranquila de quem segura o chão', vocation: 'Força e resistência',
    affinities: ['terra', 'fogo'], attrs: { vida: 2, defesa: 1, agilidade: -1 },
    features: 'curved bull horns, small cow-like ears, sturdy build, chunky boots and bracers',
    featuresPt: 'chifres curvos, orelhas bovinas, porte robusto',
    tail: 'tuft', wings: null, formSkill: 'investida', speed: 0.88,
    craft: { key: 'forja', label: 'Forja', hint: 'Só Taurinas forjam armas e equipamentos, com receitas e ingredientes específicos.' },
  },
  mistica: {
    key: 'mistica', label: 'Feérica', lineage: 'Fadas, elfos e espíritos da luz e da sombra', vocation: 'Magia',
    affinities: ['luz', 'sombra'], attrs: { sintonia: 2, energia: 1, vida: -1 },
    features: 'long pointed elf ears, softly glowing markings on the cheeks and arms, flowing magical clothes',
    featuresPt: 'orelhas pontudas, marcas brilhantes no rosto e nos braços',
    tail: null, wings: 'fairy', formSkill: 'guarda', speed: 1.05,
  },
};

/** Velocidade da classe (1 sem classe ainda); a agilidade da árvore pode somar no futuro. */
export function speciesSpeed(species: SpeciesKey | null | undefined): number {
  return species ? SPECIES[species]?.speed ?? 1 : 1;
}

/** Multiplicador da afinidade da classe com uma essência. */
export function speciesAffinity(species: SpeciesKey, essence: Element | null): number {
  return essence && SPECIES[species].affinities.includes(essence) ? 1.1 : 1;
}

export interface CharacterSheet {
  name: string;
  body: 'humanoide';
  species: { key: SpeciesKey; label: string; description: string; features: string };
  appendages: { tail: TailKind | null; wings: WingKind | null; note: string };
  element: string;
  palette: IdentityContractV1['palette'];
  personality: string[];
  aspiration: string;
  pronoun: string;
}

/**
 * Ficha do personagem (o JSON que a Fábrica mostra e que vai para a geração de imagem): humanoide sempre,
 * com a classe, os traços e o que o jogo vai acrescentar por código. A descrição do jogador ajusta cauda e asas
 * ("dragão com asas" ganha asas de dragão; "sem cauda" tira a cauda).
 */
export function characterSheet(c: IdentityContractV1): CharacterSheet {
  const sp = SPECIES[c.species.family] ?? SPECIES.mistica;
  const d = ' ' + normalize(c.species.description) + ' ';
  const has = (...w: string[]) => w.some((x) => d.includes(' ' + x));
  let wings = sp.wings, tail = sp.tail;
  if (has('asa', 'alad', 'voa', 'voar', 'wing')) wings = wings ?? (sp.key === 'serpente' ? 'dragon' : sp.key === 'mistica' ? 'fairy' : 'feather');
  if (has('sem asa')) wings = null;
  if (has('sem cauda', 'sem rabo')) tail = null;
  if (!tail && has('cauda', 'rabo', 'kitsune', 'raposa', 'gato', 'lobo')) tail = sp.key === 'serpente' ? 'scaly' : sp.key === 'passaro' ? 'feather' : sp.key === 'mistica' ? 'wisp' : 'fluffy';
  const pieces = [tail && 'cauda', wings && 'asas'].filter(Boolean).join(' e ');
  return {
    name: c.identity.name,
    body: 'humanoide',
    species: { key: sp.key, label: sp.label, description: c.species.description, features: sp.featuresPt },
    appendages: { tail, wings, note: pieces ? `Fora do modelo 3D: ${pieces}, desenhadas e animadas pelo jogo.` : 'Sem cauda nem asas.' },
    element: c.element.label,
    palette: c.palette,
    personality: c.personality.traits,
    aspiration: c.aspiration,
    pronoun: c.identity.pronoun,
  };
}
