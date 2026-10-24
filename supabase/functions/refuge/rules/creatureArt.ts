/**
 * Monstros: os esqueletos que o rig automático sabe encaixar (moldes do Mesh2Motion) e o gerador de prompt da
 * referência do modelo 3D. A pose pedida é a que o encaixe automático lê melhor: patas retas e separadas no chão,
 * asas abertas para os lados, cauda esticada para trás, boca fechada, olhando para a frente.
 */
import type { BodyPlan } from './art.ts';

export type CreatureRig = 'fox' | 'horse' | 'spider' | 'bird' | 'dragon' | 'snake' | 'fish' | 'kaiju';

export const CREATURE_RIGS: Record<CreatureRig, { label: string; family: string; hint: string }> = {
  fox: { label: 'Quadrúpede (lobo, gato, urso, raposa…)', family: 'Quadrúpede', hint: 'quatro patas com dedos ou garras' },
  horse: { label: 'Quadrúpede de cascos (cavalo, cervo, javali…)', family: 'Quadrúpede', hint: 'pernas longas com cascos' },
  spider: { label: 'Aranha (oito patas)', family: 'Aranha', hint: 'também serve para escorpião e caranguejo' },
  bird: { label: 'Pássaro', family: 'Pássaro / dragão', hint: 'duas patas e duas asas' },
  dragon: { label: 'Dragão (quatro patas e asas)', family: 'Pássaro / dragão', hint: 'quatro patas, asas e cauda' },
  snake: { label: 'Cobra / serpente', family: 'Cobra / peixe', hint: 'corpo comprido, sem patas' },
  fish: { label: 'Peixe / tubarão', family: 'Cobra / peixe', hint: 'nadadeiras, sem patas' },
  kaiju: { label: 'Bípede de cauda (dinossauro, lagarto em pé)', family: 'Bípede', hint: 'anda em duas patas, braços curtos e cauda' },
};

/** Esqueleto sugerido pelo tipo de corpo da criatura. */
export function rigForBody(body: BodyPlan): CreatureRig {
  return body === 'quadruped' ? 'fox' : body === 'avian' ? 'bird' : body === 'serpentine' ? 'snake' : body === 'aquatic' ? 'fish' : 'kaiju';
}

const POSE: Record<CreatureRig, string> = {
  fox: 'standing on all four legs in a calm neutral stance: legs straight and vertical, the four paws flat on the ground and clearly apart from each other (front pair and back pair well separated), body horizontal, head forward in line with the spine, mouth closed, ears up, tail stretched straight back and slightly raised (not curled, not touching the legs or the ground)',
  horse: 'standing on all four legs in a calm neutral stance: long legs straight and vertical, the four hooves flat on the ground and clearly apart, body horizontal, neck and head forward, mouth closed, tail hanging straight back away from the legs',
  spider: 'standing in a neutral symmetric stance: eight legs, four on each side, spread evenly around the body like a star, each leg arching up and down with the tip touching the ground, no leg crossing or touching another, body low and horizontal, head and fangs facing forward, mouth closed',
  bird: 'standing on two legs with both feet flat on the ground and apart, both wings fully spread open horizontally to the sides (wingspan straight, feathers flat, like a T-pose for wings), body slightly tilted, head forward, beak closed, tail feathers straight back',
  dragon: 'standing on all four legs with the paws flat on the ground and clearly apart, both wings fully spread open horizontally to the sides (not folded), long neck and head forward, mouth closed, tail stretched straight back on the ground line (not curled)',
  snake: 'lying stretched out in a straight line along the ground (NOT coiled, no loops, no knots), head at the front slightly raised and facing forward, mouth closed, tail tip straight back',
  fish: 'swimming in a straight neutral pose: body straight and horizontal, all fins spread open and visible, tail fin straight back, mouth closed, floating (no ground, no water)',
  kaiju: 'standing upright on two legs with the feet flat on the ground and apart, short arms slightly away from the body, body leaning a little forward, head forward, mouth closed, tail stretched straight back and off the ground (not touching the legs)',
};

const VIEW: Record<CreatureRig, string> = {
  fox: 'three-quarter front view from slightly above, so the four legs and the whole body length are visible',
  horse: 'three-quarter front view from slightly above, so the four legs and the whole body length are visible',
  spider: 'three-quarter front view from above, so all eight legs are visible and none is hidden behind the body',
  bird: 'straight front view (orthographic), wings fully visible to both sides',
  dragon: 'three-quarter front view from slightly above, so the four legs, both open wings and the tail are visible',
  snake: 'three-quarter view from above, so the whole straight body from head to tail is visible',
  fish: 'three-quarter side view, so the whole body, all fins and the tail fin are visible',
  kaiju: 'three-quarter front view, so both legs, both arms and the tail are visible',
};

export interface CreaturePromptInput { rig: CreatureRig; name: string; description: string; color?: string; element?: string }
export interface CreaturePrompt { modelPrompt: string; views: string; negative: string; summaryPt: string; tripo: string }

/**
 * Referência do modelo 3D de um monstro (para gerar a imagem a partir da referência e depois o modelo no Tripo).
 * A descrição diz como o bicho é; a pose e a vista vêm do esqueleto escolhido.
 */
export function buildCreaturePrompt(i: CreaturePromptInput): CreaturePrompt {
  const desc = i.description.trim().replace(/\s+/g, ' ') || 'a fantasy creature';
  const common = [
    i.element ? `Elemental affinity: ${i.element}, shown as small accents attached to the body (no floating effects).` : '',
    i.color ? `Main color around ${i.color}.` : '',
    'Style: cozy fantasy game creature, cute but not baby-like, stylized 3D figure look, soft cel shading, clean simple shapes and solid color areas, readable silhouette.',
    'Anatomy clean and complete: every leg, wing and fin separate and fully visible, nothing fused together, no extra limbs.',
  ].filter(Boolean);
  const modelPrompt = [
    `Full-body 3D model reference of "${i.name}", ${desc}.`,
    `Same creature as the reference image (keep its design, colors and features), redrawn ${POSE[i.rig]}.`,
    ...common,
    `Single creature, ${VIEW[i.rig]}, symmetrical. No saddle, no armor plates sticking out, no props, no rider, no base or pedestal. Even soft lighting, no cast shadows, plain light grey background, fully visible, no text.`,
  ].join(' ');
  const views = [
    `Creature turnaround reference sheet of "${i.name}", ${desc}.`,
    `Same creature as the reference image, ${POSE[i.rig]}.`,
    ...common,
    'Four views of the same single creature side by side, evenly spaced, same scale, aligned on one ground line: front view, left side view, right side view, back view. Orthographic, identical pose in every view, every view fully visible and not touching the others. Even soft lighting, plain light grey background, no text.',
  ].join(' ');
  const negative = 'text, letters, watermark, logo, multiple creatures, rider, saddle, cropped, busy background, dramatic lighting, strong shadows, floating particles, sparkles in the air, motion blur, action pose, running, jumping, open mouth, curled tail, folded wings, crossed legs, legs touching each other, hidden legs, extra limbs, fused limbs, realistic photo, horror, gore, existing franchise characters';
  const summaryPt = `${i.name} · ${CREATURE_RIGS[i.rig].label}`;
  const tripo = 'No Tripo: gere o modelo SEM rig e SEM animação (o rig e as animações são feitos aqui, automáticos). Exporte em .GLB com a cabeça olhando para a frente.';
  return { modelPrompt, views, negative, summaryPt, tripo };
}
