/**
 * Prompt de criação da arte final do Companion, montado a partir do contrato de identidade.
 * Fica só no painel do ADM (Fábrica de Companions); o jogador nunca vê o JSON.
 * Todo Companion é humanoide (rig padrão de humanoide no Tripo); cauda e asas são desenhadas pelo jogo.
 */
import type { IdentityContractV1 } from './identity.ts';
import { normalize } from './text.ts';
import { SPECIES, characterSheet, type CharacterSheet } from './species.ts';

const TRAIT_EN: [string, string][] = [
  ['curios', 'curious wide eyes'], ['criativ', 'playful creative look'], ['aventureir', 'adventurous stance'], ['contemplativ', 'calm thoughtful gaze'],
  ['organizad', 'neat tidy look'], ['persistente', 'determined expression'], ['responsav', 'reliable posture'], ['espontane', 'spontaneous lively pose'],
  ['sociav', 'friendly open pose'], ['brincalh', 'mischievous smile'], ['reservad', 'shy gentle pose'], ['independente', 'confident stance'],
  ['gentil', 'kind soft smile'], ['empatic', 'warm caring eyes'], ['protetor', 'protective brave stance'], ['franc', 'direct honest look'],
  ['seren', 'serene relaxed pose'], ['paciente', 'patient calm look'], ['sensiv', 'delicate emotional eyes'], ['intens', 'energetic dynamic pose'],
  ['sanguine', 'cheerful bright expression'], ['coleric', 'bold fiery expression'], ['melancolic', 'dreamy wistful eyes'], ['fleumatic', 'peaceful easygoing look'],
];

export type BodyPlan = 'quadruped' | 'biped' | 'avian' | 'serpentine' | 'aquatic';
export interface ArtPrompt { summaryPt: string; prompt: string; negative: string; modelPrompt: string; modelNegative: string; size: string; body: BodyPlan; bodyPt: string; views: string; viewsNegative: string; sheet: CharacterSheet }

/** Companions são sempre humanoides (um rig só; ver species.ts). O tipo de corpo continua existindo para as criaturas. */
export function bodyPlanFor(_c: IdentityContractV1): BodyPlan {
  return 'biped';
}

const GENDER_EN: Record<string, string> = { ela: 'girl', ele: 'boy' };
const TAIL_EN: Record<string, string> = {
  scaly: 'a long scaly dragon tail with a small fin at the tip', fluffy: 'a big fluffy animal tail', tuft: 'a thin tail with a fluffy tuft at the end',
  feather: 'a short fan of tail feathers', wisp: 'a soft glowing wisp-like tail',
};
const WINGS_EN: Record<string, string> = {
  feather: 'a pair of feathered wings on the back', dragon: 'a pair of small dragon wings on the back', fairy: 'a pair of translucent glowing fairy wings on the back',
};
const ACCENT_EN: Record<string, string> = {
  fogo: 'fire (ember-glow markings and a flame-shaped hair ornament)', agua: 'water (translucent fin-like ornaments and wave patterns on the clothes)',
  terra: 'earth (small crystal ornaments and earthy tones)', vento: 'wind (feathery swirl patterns on the clothes)', luz: 'light (soft glowing markings and a halo-like hair ornament)',
  sombra: 'shadow (night-sky patterns on the clothes)', gelo: 'ice (frosty crystal ornaments)', raio: 'lightning (zigzag glowing stripes on the clothes)',
  natureza: 'nature (leaves and small flowers in the hair)',
};
const A_POSE = 'A-pose: standing straight, arms slightly away from the body (about 30 degrees), hands open, legs slightly apart, feet flat';

/**
 * Dois prompts, todo Companion humanoide (ver species.ts):
 * - `prompt`: arte do retrato, com a cauda e as asas da classe;
 * - `modelPrompt` / `views`: referência para o modelo 3D (Tripo, rig humanoide): A-pose, roupa justa ao corpo e
 *   SEM cauda e SEM asas — o jogo desenha e anima essas partes por código.
 */
export function buildArtPrompt(c: IdentityContractV1): ArtPrompt {
  const sheet = characterSheet(c);
  const sp = SPECIES[sheet.species.key];
  const looks = [...new Set(c.personality.traits.flatMap((t) => TRAIT_EN.filter(([s]) => normalize(t).includes(s)).map(([, e]) => e)))].slice(0, 3);
  const p = c.palette;
  const who = `a cute chibi humanoid ${GENDER_EN[c.identity.pronoun] ?? 'child-like character'} of the ${sp.label} lineage`;
  const extras = [sheet.appendages.tail && TAIL_EN[sheet.appendages.tail], sheet.appendages.wings && WINGS_EN[sheet.appendages.wings]].filter(Boolean).join(' and ');
  const common = [
    `Chibi proportions (big head ~40% of height), large expressive anime eyes, ${looks.filter((l) => !l.endsWith('eyes')).join(', ') || 'friendly expression'}.`,
    `Elemental affinity: ${ACCENT_EN[c.element.key] ?? c.element.label}, shown as small accents, not overwhelming.`,
    `Color palette: primary ${p.primary} (hair and main outfit, at least 40% of the figure), secondary ${p.secondary}, accent ${p.accent}, glow ${p.glow}. Small glowing diamond mark on the forehead in ${p.glow}.`,
    'Modest, wholesome fantasy outfit. Style: cozy fantasy anime, soft cel shading, clean simple shapes, stylized 3D figure look.',
  ];
  const prompt = [
    `Full-body character art of "${c.identity.name}", ${who}: ${sp.features}${extras ? `, with ${extras}` : ''}. Described by a friend as "${c.species.description}".`,
    ...common,
    'Single character, joyful dynamic pose, soft magical light, plain light background, fully visible, no text.',
  ].join(' ');
  const modelPrompt = [
    `Full-body 3D model reference of "${c.identity.name}", ${who}: ${sp.features}.`,
    // sem descrever a cauda/asas aqui: geradores de imagem tendem a desenhar o que é citado, mesmo negado
    'IMPORTANT: no tail and no wings (they are added separately in the game).',
    ...common,
    'Clothes and hair close to the body: no long capes, no wide skirts or loose sleeves covering the legs or arms, hair not covering the arms or face; simple boots or shoes.',
    `Single character, straight front view (orthographic, facing the camera), head facing forward in line with the body, symmetrical, ${A_POSE}; nothing overlapping the body. Effects stay attached to the body (no floating particles). Even soft lighting, no cast shadows, plain light grey background, fully visible, no text.`,
  ].join(' ');
  const negative = 'text, letters, watermark, logo, signature, multiple characters, cropped, busy background, dramatic lighting, strong shadows, floating particles, detached droplets, sparkles in the air, realistic photo, horror, gore, weapons, existing franchise characters, revealing clothes';
  const modelNegative = negative + ', tail, wings, cape, long flowing skirt, three-quarter view, turned head, head looking sideways, perspective distortion, arms touching the body, crossed legs';
  // Folha de vistas para o multivista do Tripo (Frente, Esquerda, Direita, Verso): a mesma referência do modelo.
  const views = modelPrompt.replace(/^Full-body 3D model reference of/, 'Character turnaround reference sheet of')
    .replace(/Single character, straight front view[^;]*;/, `Four views of the same single character side by side, evenly spaced, same scale and same height, aligned on one ground line: front view, left side view, right side view, back view. Orthographic, head facing the same direction as the body in every view, ${A_POSE};`)
    .replace('plain light grey background, fully visible', 'plain light grey background, every view fully visible and not touching the others');
  const summaryPt = `${c.identity.name} · humanoide ${sp.label.toLowerCase()} (${c.species.description}) · ${c.element.label} · ${sheet.appendages.note} · ${c.personality.traits.join(', ')} · sonho: ${c.aspiration}`;
  return {
    summaryPt, prompt, negative, modelPrompt, modelNegative, size: '1024x1024 · modelo: fundo cinza-claro liso',
    body: 'biped', bodyPt: 'humanoide (rig padrão de humanoide)', views, viewsNegative: modelNegative.replace('multiple characters, ', 'different characters, inconsistent design between views, '), sheet,
  };
}
