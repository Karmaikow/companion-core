/** Visual-only layers. Never used to calculate damage, hit areas or resource costs. */
export const VFX_LAYER_KINDS = { rune: 'Runa', mist: 'Névoa', sparks: 'Faíscas', crystals: 'Cristais 3D', lightning: 'Arcos elétricos' } as const;
export interface VfxLayerDef {
  kind: keyof typeof VFX_LAYER_KINDS;
  enabled: boolean;
  phase: 'prepare' | 'launch';
  anchor: 'origin' | 'target' | 'path';
  delay: number;
  duration: number;
  size: number;
  count: number;
  color: string;
}
const bounded = (v: unknown, lo: number, hi: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
export function sanitizeVfxLayers(input: unknown): VfxLayerDef[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 6).flatMap((v) => {
    if (!v || typeof v !== 'object' || !Object.hasOwn(VFX_LAYER_KINDS, v.kind)) return [];
    return [{ kind: v.kind, enabled: v.enabled !== false, phase: v.phase === 'prepare' ? 'prepare' : 'launch',
      anchor: v.anchor === 'origin' || v.anchor === 'path' ? v.anchor : 'target',
      delay: bounded(v.delay, 0, 2, 0), duration: bounded(v.duration, 0.15, 3, 1),
      size: bounded(v.size, 0.25, 2, 1), count: Math.round(bounded(v.count, 1, 64, 24)),
      color: typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : 'skill',
    } as VfxLayerDef];
  });
}
export function newVfxLayer(kind: VfxLayerDef['kind']): VfxLayerDef {
  return { kind, enabled: true, phase: 'launch', anchor: 'target', delay: 0, duration: 1.2, size: 1, count: 24, color: 'skill' };
}
export function vfxPreset(name: 'ice' | 'storm' | 'ember'): VfxLayerDef[] {
  const make = (kind: VfxLayerDef['kind'], extra: Partial<VfxLayerDef>) => ({ ...newVfxLayer(kind), ...extra });
  if (name === 'ice') return [make('rune', { phase: 'prepare', anchor: 'path', color: '#9deeff', duration: 1 }), make('crystals', { anchor: 'path', count: 36, duration: 2.2, color: '#a5e9ff' }), make('mist', { anchor: 'path', delay: 0.15, duration: 2.5, color: '#cceeff' })];
  if (name === 'storm') return [make('rune', { phase: 'prepare', color: '#be91ff' }), make('lightning', { delay: 0.05, color: '#bca6ff' }), make('sparks', { delay: 0.1, color: '#e8ddff' })];
  return [make('rune', { phase: 'prepare', anchor: 'origin', color: '#ffad51' }), make('sparks', { anchor: 'path', color: '#ffae48', count: 48 }), make('mist', { delay: 0.3, color: '#9b665e', duration: 2 })];
}
