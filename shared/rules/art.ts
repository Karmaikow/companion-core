/**
 * Prompt de criação da arte final do Companion, montado a partir do contrato de identidade.
 * Fica só no painel do ADM (Fábrica de Companions); o jogador nunca vê o JSON.
 * O estilo segue a direção visual do jogo: HD-2D, fantasia aconchegante, criatura pequena.
 */
import type { IdentityContractV1 } from './identity.ts';
import { FORM_FAMILIES } from './identity.ts';
import { normalize } from './text.ts';

const FAMILY_EN: Record<string, string> = {
  passaro: 'small bird-like creature', touro: 'small sturdy bull-like creature', felino: 'small agile four-legged creature',
  serpente: 'small serpentine creature', mistica: 'small mystical spirit creature',
};
const ELEMENT_EN: Record<string, string> = {
  fogo: 'fire (warm embers, tiny flame wisps)', agua: 'water (droplets, flowing ribbons)', terra: 'earth (pebbles, crystal shards)',
  vento: 'wind (swirling leaves, light gusts)', luz: 'light (soft halo, starry sparkles)', sombra: 'shadow (moonlit purple mist)',
  gelo: 'ice (frost crystals, snowflakes)', raio: 'lightning (small electric sparks)', natureza: 'nature (sprouts, glowing flowers)',
};
const TRAIT_EN: [string, string][] = [
  ['curios', 'curious wide eyes'], ['criativ', 'playful creative look'], ['aventureir', 'adventurous stance'], ['contemplativ', 'calm thoughtful gaze'],
  ['organizad', 'neat tidy look'], ['persistente', 'determined expression'], ['responsav', 'reliable posture'], ['espontane', 'spontaneous lively pose'],
  ['sociav', 'friendly open pose'], ['brincalh', 'mischievous smile'], ['reservad', 'shy gentle pose'], ['independente', 'confident stance'],
  ['gentil', 'kind soft smile'], ['empatic', 'warm caring eyes'], ['protetor', 'protective brave stance'], ['franc', 'direct honest look'],
  ['seren', 'serene relaxed pose'], ['paciente', 'patient calm look'], ['sensiv', 'delicate emotional eyes'], ['intens', 'energetic dynamic pose'],
  ['sanguine', 'cheerful bright expression'], ['coleric', 'bold fiery expression'], ['melancolic', 'dreamy wistful eyes'], ['fleumatic', 'peaceful easygoing look'],
];

export interface ArtPrompt { summaryPt: string; prompt: string; negative: string; size: string }

export function buildArtPrompt(c: IdentityContractV1): ArtPrompt {
  const fam = FORM_FAMILIES[c.species.family];
  const looks = [...new Set(c.personality.traits.flatMap((t) => TRAIT_EN.filter(([s]) => normalize(t).includes(s)).map(([, e]) => e)))].slice(0, 3);
  const p = c.palette;
  const prompt = [
    `Full-body character design of "${c.identity.name}", a ${FAMILY_EN[c.species.family] ?? 'small fantasy creature'} described by its friend as "${c.species.description}".`,
    `Chibi proportions (big head ~45% of height), cute and expressive, ${looks.join(', ') || 'friendly expression'}.`,
    `Elemental affinity: ${ELEMENT_EN[c.element.key] ?? c.element.label}, shown as small accents, not overwhelming.`,
    `Color palette: primary ${p.primary} (at least 40% of the body), secondary ${p.secondary}, accent ${p.accent}, outline/shadow ${p.shadow}, glow ${p.glow}. Small glowing diamond mark on the forehead in ${p.glow}.`,
    'Style: HD-2D cozy fantasy JRPG companion, hand-painted look, clean thick dark outline, soft cel shading, readable silhouette at 64px.',
    'Front-facing three-quarter view, standing, centered, single character, fully visible, plain transparent background, no text.',
  ].join(' ');
  const negative = 'text, letters, watermark, logo, signature, multiple characters, cropped, background scenery, realistic photo, horror, gore, weapons, existing franchise characters';
  const summaryPt = `${c.identity.name} · ${fam.label.toLowerCase()} (${c.species.description}) · ${c.element.label} · ${c.personality.traits.join(', ')} · sonho: ${c.aspiration}`;
  return { summaryPt, prompt, negative, size: '1024x1024, PNG com fundo transparente' };
}
