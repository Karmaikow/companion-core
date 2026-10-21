/**
 * Aparência de um modelo .GLB sem editar o arquivo: matiz, saturação, luz, tinta e brilho próprio.
 * O mesmo modelo de árvore vira árvore de cinzas num bioma vulcânico ou árvore de gelo num bioma frio.
 * Aplicado no shader (client/src/scene/look.ts); aqui só os dados e as predefinições.
 */

export interface ModelLook {
  hue: number;        // giro de matiz em graus (-180..180)
  sat: number;        // saturação (0 = cinza, 1 = original, 2 = forte)
  light: number;      // luz (0,3..2; 1 = original)
  contrast: number;   // contraste (0,5..1,6; 1 = original)
  tint: string;       // cor de tinta (#rrggbb)
  tintAmount: number; // quanto da tinta (0..1)
  glow: number;       // brilho próprio na cor da tinta (0..2) — brasa, cristal, cogumelo mágico
}

export const LOOK_ORIGINAL: ModelLook = { hue: 0, sat: 1, light: 1, contrast: 1, tint: '#ffffff', tintAmount: 0, glow: 0 };

export const LOOK_PRESETS: { key: string; label: string; look: ModelLook }[] = [
  { key: 'original', label: 'Original', look: LOOK_ORIGINAL },
  { key: 'vulcanico', label: 'Vulcânico', look: { hue: -25, sat: 1.25, light: 0.8, contrast: 1.2, tint: '#ff6a2a', tintAmount: 0.45, glow: 0.25 } },
  { key: 'cinzas', label: 'Cinzas', look: { hue: 0, sat: 0.25, light: 0.7, contrast: 1.15, tint: '#5a4a48', tintAmount: 0.3, glow: 0 } },
  { key: 'gelo', label: 'Gelo', look: { hue: 150, sat: 0.6, light: 1.25, contrast: 0.9, tint: '#bfe9ff', tintAmount: 0.45, glow: 0.12 } },
  { key: 'outono', label: 'Outono', look: { hue: -55, sat: 1.15, light: 1.05, contrast: 1.05, tint: '#ffb35a', tintAmount: 0.25, glow: 0 } },
  { key: 'encantado', label: 'Encantado', look: { hue: 120, sat: 1.2, light: 1.05, contrast: 1, tint: '#c58cff', tintAmount: 0.35, glow: 0.35 } },
  { key: 'sombrio', label: 'Sombrio', look: { hue: 160, sat: 0.7, light: 0.65, contrast: 1.2, tint: '#4b3a7a', tintAmount: 0.4, glow: 0 } },
  { key: 'deserto', label: 'Deserto', look: { hue: -40, sat: 0.8, light: 1.15, contrast: 0.95, tint: '#e8c48a', tintAmount: 0.4, glow: 0 } },
  { key: 'cristal', label: 'Cristal', look: { hue: 0, sat: 1.3, light: 1.2, contrast: 1, tint: '#7fe8ff', tintAmount: 0.5, glow: 0.8 } },
];

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function sanitizeLook(input: unknown): ModelLook | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const l = input as Partial<ModelLook>;
  const out: ModelLook = {
    hue: num(l.hue, -180, 180, 0), sat: num(l.sat, 0, 2, 1), light: num(l.light, 0.3, 2, 1), contrast: num(l.contrast, 0.5, 1.6, 1),
    tint: typeof l.tint === 'string' && HEX.test(l.tint) ? l.tint.toLowerCase() : '#ffffff', tintAmount: num(l.tintAmount, 0, 1, 0), glow: num(l.glow, 0, 2, 0),
  };
  return isOriginal(out) ? undefined : out;
}

export function isOriginal(l?: ModelLook): boolean {
  return !l || (l.hue === 0 && l.sat === 1 && l.light === 1 && l.contrast === 1 && l.tintAmount === 0 && l.glow === 0);
}
