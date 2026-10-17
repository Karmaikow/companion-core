export const DIRECTION_VERSION = 1;
export const ASSET_KINDS = ['tree', 'rock', 'plant', 'building', 'prop'] as const;
export type AssetBrief = { name: string; kind: typeof ASSET_KINDS[number]; prompt: string; palette: string };
export function validateBrief(input: unknown): AssetBrief {
  const b = input as Record<string, unknown>;
  if (!b || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120 ||
      !ASSET_KINDS.includes(b.kind as AssetBrief['kind']) || typeof b.prompt !== 'string' ||
      b.prompt.trim().length < 8 || b.prompt.length > 2400 || typeof b.palette !== 'string' || b.palette.length > 240) {
    throw Error('Informe nome, tipo, descrição de 8 a 2400 caracteres e uma paleta de até 240 caracteres.');
  }
  return { name: b.name.trim(), kind: b.kind as AssetBrief['kind'], prompt: b.prompt.trim(), palette: b.palette.trim() };
}
export function assetPrompt(input: unknown): string {
  const b = validateBrief(input);
  return `Companion Core illustrated fantasy environment asset. Art direction v${DIRECTION_VERSION}.
Create one original ${b.kind}: ${b.prompt}
Palette: ${b.palette || 'moss greens, sapphire blue, muted coral pink and warm stone'}.
Elevated orthographic three-quarter view, camera looking down about 35 degrees, no perspective convergence. Match this viewpoint across all assets.
Hand-painted 2D storybook game art, delicate dark colored outlines, broad readable shapes, rounded rock planes, layered organic foliage and subtle brush texture. Avoid photorealism, glossy 3D rendering and pixel art.
Consistent soft light from upper left, cool shaded faces and restrained warm highlights. Paint volume shading on the object; no baked ground plane or large cast shadow. Keep the base aligned near the bottom center and leave a 10 percent transparent margin. Full object visible, no cropping.
Props and vegetation must be readable beside a small chibi companion; consistent relative scale and silhouette, no character in the output.
Export one isolated asset as a PNG with a true transparent alpha background. No text, logo, border, sprite sheet, checkerboard, sky or scenery backdrop.
Attached images are art-direction references only: study their contours, material treatment, perspective, proportions and lighting. Do not copy a reference scene, reproduce identifiable buildings or use reference pictures as parts of the output. The description above defines the new object.`;
}
