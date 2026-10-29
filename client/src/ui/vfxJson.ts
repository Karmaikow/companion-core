import { VFX_LAYER_KINDS, vfxPreset, type VfxLayerDef } from '../../../shared/rules/combat/vfx';
export const VFX_JSON_LIMIT = 64 * 1024;
/** Strict import: reject malformed recipes instead of silently replacing user choices. */
export function parseVfxJson(text: string): VfxLayerDef[] {
  if (new TextEncoder().encode(text).length > VFX_JSON_LIMIT) throw new Error('A composição deve ter até 64 KB.');
  const source = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('JSON inválido. Confira vírgulas, aspas e chaves.'); }
  const layers = value && typeof value === 'object' && !Array.isArray(value) ? (value as { layers?: unknown }).layers : undefined;
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > 6) throw new Error('Use um objeto com "layers" contendo de 1 a 6 camadas.');
  return layers.map((input, i) => {
    const fail = (field: string): never => { throw new Error(`Camada ${i + 1}: ${field} inválido.`); };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('formato');
    const l = input as Record<string, unknown>;
    if (typeof l.kind !== 'string' || !Object.hasOwn(VFX_LAYER_KINDS, l.kind)) return fail('tipo de efeito');
    if (typeof l.enabled !== 'boolean') return fail('enabled (true ou false)');
    if (l.phase !== 'prepare' && l.phase !== 'launch') return fail('phase (prepare ou launch)');
    if (!['origin', 'target', 'path'].includes(l.anchor as string)) return fail('anchor (origin, target ou path)');
    for (const [key, min, max] of [['delay',0,2],['duration',0.15,3],['size',0.25,2],['count',1,l.kind === 'rune' ? 6 : l.kind === 'lightning' ? 8 : 64]] as const) {
      const n = l[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (key === 'count' && !Number.isInteger(n))) return fail(`${key} (${min} a ${max})`);
    }
    if (typeof l.color !== 'string' || (l.color !== 'skill' && !/^#[0-9a-f]{6}$/i.test(l.color))) return fail('color (skill ou #RRGGBB)');
    return { kind:l.kind, enabled:l.enabled, phase:l.phase, anchor:l.anchor, delay:l.delay, duration:l.duration, size:l.size, count:l.count, color:l.color } as VfxLayerDef;
  });
}

export function exampleVfxJson(): string {
  return JSON.stringify({ layers: vfxPreset("ice").map(l => ({ ...l, count: Math.min(l.count, l.kind === "rune" ? 6 : l.kind === "lightning" ? 8 : 64) })) }, null, 2);
}
