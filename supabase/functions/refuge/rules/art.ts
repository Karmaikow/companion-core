/**
 * Prompt de criação da arte final do Companion, montado a partir do contrato de identidade.
 * Fica só no painel do ADM (Fábrica de Companions); o jogador nunca vê o JSON.
 * A imagem é a referência do modelo 3D (Tripo): o tipo de corpo definido aqui é o mesmo usado no rig.
 */
import type { IdentityContractV1 } from './identity.ts';
import { FORM_FAMILIES } from './identity.ts';
import { normalize } from './text.ts';

const FAMILY_EN: Record<string, string> = {
  passaro: 'small bird-like creature', touro: 'small sturdy bull-like creature', felino: 'small agile four-legged creature',
  serpente: 'small serpentine creature', mistica: 'small mystical spirit creature',
};
const ELEMENT_EN: Record<string, string> = {
  fogo: 'fire (ember-glow markings, flame-shaped tail tip)', agua: 'water (translucent flowing fins, wave-like markings)', terra: 'earth (small crystal growths on the back)',
  vento: 'wind (feathery swirls, leaf-like fins)', luz: 'light (soft glowing markings, halo-like crest)', sombra: 'shadow (night-sky patterns on the fur)',
  gelo: 'ice (frosty crystal spikes, icy fins)', raio: 'lightning (zigzag glowing stripes)', natureza: 'nature (leaves and small flowers growing on the body)',
};
const TRAIT_EN: [string, string][] = [
  ['curios', 'curious wide eyes'], ['criativ', 'playful creative look'], ['aventureir', 'adventurous stance'], ['contemplativ', 'calm thoughtful gaze'],
  ['organizad', 'neat tidy look'], ['persistente', 'determined expression'], ['responsav', 'reliable posture'], ['espontane', 'spontaneous lively pose'],
  ['sociav', 'friendly open pose'], ['brincalh', 'mischievous smile'], ['reservad', 'shy gentle pose'], ['independente', 'confident stance'],
  ['gentil', 'kind soft smile'], ['empatic', 'warm caring eyes'], ['protetor', 'protective brave stance'], ['franc', 'direct honest look'],
  ['seren', 'serene relaxed pose'], ['paciente', 'patient calm look'], ['sensiv', 'delicate emotional eyes'], ['intens', 'energetic dynamic pose'],
  ['sanguine', 'cheerful bright expression'], ['coleric', 'bold fiery expression'], ['melancolic', 'dreamy wistful eyes'], ['fleumatic', 'peaceful easygoing look'],
];

export type BodyPlan = 'quadruped' | 'biped' | 'avian' | 'serpentine' | 'aquatic';
export interface ArtPrompt { summaryPt: string; prompt: string; negative: string; size: string; body: BodyPlan; bodyPt: string; views: string }

const BODY: Record<BodyPlan, { pt: string; en: string; pose: string }> = {
  quadruped: { pt: 'quadrúpede', en: 'four-legged creature standing on all four legs', pose: 'all four legs visible and slightly apart, tail extended straight back' },
  biped: { pt: 'bípede', en: 'small creature standing upright on two legs, with two arms', pose: 'A-pose: arms slightly away from the body, legs slightly apart, tail (if any) extended back' },
  avian: { pt: 'ave', en: 'bird-like creature standing on two legs, with two wings', pose: 'wings half open and away from the body, legs slightly apart, tail feathers extended back' },
  serpentine: { pt: 'serpente (sem patas)', en: 'legless serpentine creature with a long body', pose: 'body in a loose S-curve resting on the ground, head raised, coils not overlapping' },
  aquatic: { pt: 'aquático', en: 'fish-like aquatic creature with fins', pose: 'body straight in side-friendly pose, fins spread, tail fin extended back' },
};
const FAMILY_BODY: Record<string, BodyPlan> = { passaro: 'avian', touro: 'quadruped', felino: 'quadruped', serpente: 'serpentine', mistica: 'biped' };
/** Tipo de corpo para imagem e rig. A descrição do jogador vence a família (um "dragão" da família serpente tem patas). */
export function bodyPlanFor(c: IdentityContractV1): BodyPlan {
  const d = ' ' + normalize(c.species.description) + ' ';
  const has = (...w: string[]) => w.some((x) => d.includes(' ' + x));
  if (has('humanoide', 'humano', 'elfo', 'fada', 'anjo', 'golem', 'bipede', 'em pe')) return 'biped';
  if (has('peixe', 'sereia', 'baleia', 'golfinho', 'aquatic', 'polvo')) return 'aquatic';
  if (has('cobra', 'serpente sem', 'enguia', 'naga', 'minhoca')) return 'serpentine';
  if (has('dragao', 'dragon', 'lagarto', 'salamandra', 'raposa', 'lobo', 'gato', 'cachorro', 'cao', 'leao', 'tigre', 'urso', 'touro', 'cervo', 'coelho', 'grifo', 'unicornio', 'quadrupede')) return 'quadruped';
  if (has('passaro', 'ave', 'coruja', 'fenix', 'corvo', 'aguia', 'falcao')) return 'avian';
  return FAMILY_BODY[c.species.family] ?? 'quadruped';
}

export function buildArtPrompt(c: IdentityContractV1): ArtPrompt {
  const fam = FORM_FAMILIES[c.species.family];
  const looks = [...new Set(c.personality.traits.flatMap((t) => TRAIT_EN.filter(([s]) => normalize(t).includes(s)).map(([, e]) => e)))].slice(0, 3);
  const p = c.palette;
  const body = bodyPlanFor(c), b = BODY[body];
  // A imagem é a referência para o gerador de modelo 3D (Tripo/Meshy): pose neutra, luz uniforme e fundo liso
  // dão malhas e texturas mais limpas. O visual anime final vem do shader do jogo, não da imagem.
  const prompt = [
    `Full-body character concept of "${c.identity.name}", a small cute ${b.en}${body === FAMILY_BODY[c.species.family] ? ` (${FAMILY_EN[c.species.family]})` : ''}, described by its friend as "${c.species.description}".`,
    `Chibi proportions (big head ~45% of height), large expressive anime eyes, ${looks.filter((l) => !l.endsWith('eyes')).join(', ') || 'friendly expression'}.`,
    `Elemental affinity: ${ELEMENT_EN[c.element.key] ?? c.element.label}, shown as small accents, not overwhelming.`,
    `Color palette: primary ${p.primary} (at least 40% of the body), secondary ${p.secondary}, accent ${p.accent}, glow ${p.glow}. Small glowing diamond mark on the forehead in ${p.glow}.`,
    'Style: cozy fantasy anime, soft cel shading, clean simple shapes, stylized 3D figure look.',
    `Single character, straight front view (orthographic, facing the camera), head facing forward in line with the body, symmetrical, neutral pose for 3D rigging: ${b.pose}; nothing overlapping the body. Elemental effects stay attached to the body (no floating particles). Even soft lighting, no cast shadows, plain light grey background, fully visible, no text.`,
  ].join(' ');
  const negative = 'text, letters, watermark, logo, signature, multiple characters, cropped, busy background, dramatic lighting, strong shadows, floating particles, detached droplets, sparkles in the air, realistic photo, horror, gore, weapons, existing franchise characters, three-quarter view, turned head, head looking sideways, perspective distortion';
  // Folha de vistas para o multivista do Tripo (Frente, Esquerda, Direita, Verso): mesma criatura, mesma pose, alinhada.
  const views = prompt.replace(/^Full-body character concept of/, 'Character turnaround reference sheet of')
    .replace(/Single character, straight front view[^;]*;/, `Four views of the same single character side by side, evenly spaced, same scale and same height, aligned on one ground line: front view, left side view, right side view, back view. Orthographic, head facing the same direction as the body in every view, neutral pose for 3D rigging: ${b.pose};`)
    .replace('plain light grey background, fully visible', 'plain light grey background, every view fully visible and not touching the others');
  const summaryPt = `${c.identity.name} · corpo ${b.pt} · ${fam.label.toLowerCase()} (${c.species.description}) · ${c.element.label} · ${c.personality.traits.join(', ')} · sonho: ${c.aspiration}`;
  return { summaryPt, prompt, negative, size: '1024x1024, fundo cinza-claro liso (referência para o modelo 3D)', body, bodyPt: b.pt, views };
}
