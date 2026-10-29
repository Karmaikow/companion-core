/** The same visual-only score is played in the forge and in live combat. */
import * as THREE from 'three';
import { sanitizeVfxLayers } from '../../../../shared/rules/combat/vfx.ts';
import type { SkillDef } from '../../../../shared/rules/combat/skills.ts';
import { K, VfxStore } from './engine';
export interface LayerContext { origin: THREE.Vector3; target: THREE.Vector3; yaw: number; color: string; windup?: number; heightAt?: (x: number, z: number) => number }
export function playVfxLayers(store: VfxStore, skill: SkillDef, ctx: LayerContext) {
  const origin = ctx.origin.clone(), target = ctx.target.clone();
  const direction = new THREE.Vector3(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
  // Path endpoints stay within the gameplay range, including targets selected outside it.
  const distance = Math.min(skill.range, Math.hypot(target.x - origin.x, target.z - origin.z));
  const endpoint = origin.clone().addScaledVector(direction, distance);
  for (const layer of sanitizeVfxLayers(skill.vfx.layers)) {
    if (!layer.enabled) continue;
    const start = (layer.phase === 'prepare' ? 0 : ctx.windup ?? skill.windup) + layer.delay;
    const col = layer.color === 'skill' ? ctx.color : layer.color;
    const atPoint = (i: number) => {
      const u = (i + 0.5) / layer.count;
      const base = layer.anchor === 'origin' ? origin.clone() : layer.anchor === 'target' ? (skill.shape === 'aura' ? origin.clone() : endpoint.clone()) : origin.clone().lerp(endpoint, u);
      const angle = i * 2.399963;
      const radius = (skill.shape === 'melee' ? Math.min(skill.radius, skill.range) : skill.radius) * Math.sqrt((i * 0.618034) % 1) * 0.7;
      if (layer.anchor === 'path') {
        const width = skill.shape === 'cone' ? Math.tan(Math.min(skill.angle, 150) * Math.PI / 360) * distance * u : skill.radius;
        const offset = Math.sin(angle) * Math.min(width, skill.range * 0.5) * 0.7;
        base.x += direction.z * offset; base.z -= direction.x * offset;
      } else { base.x += Math.cos(angle) * radius; base.z += Math.sin(angle) * radius; }
      base.y = ctx.heightAt?.(base.x, base.z) ?? base.y;
      return base;
    };
    const total = layer.kind === 'rune' ? Math.min(6, layer.count) : layer.kind === 'lightning' ? Math.min(8, layer.count) : layer.count;
    for (let i = 0; i < total; i++) {
      const delay = start + (layer.anchor === 'path' ? i / total * 0.45 : 0);
      store.after(delay, () => {
        const at = atPoint(Math.floor(i * layer.count / total));
        if (layer.kind === 'crystals') {
          store.crystal(at, col, layer.size * (0.65 + (i % 5) * 0.19), layer.duration, i * 2.4);
        } else if (layer.kind === 'lightning') {
          const points = Array.from({ length: 13 }, (_, j) => {
            const u = j / 12;
            return at.clone().add(new THREE.Vector3(j === 0 || j === 12 ? 0 : Math.sin(j * 7 + i) * 0.18 * layer.size, (1 - u) * 2.5 * layer.size + 0.05, Math.sin(j * 13 + i) * 0.12));
          });
          store.line({ pts: points, color: col, w: 0.09 * layer.size, mode: 1, life: layer.duration, profile: () => 1, alphaAt: () => 1 });
        } else if (layer.kind === 'rune') {
          store.emit({ k: K.RING, pos: at.setY(at.y + 0.04), flat: true, life: layer.duration, size: Math.min(skill.radius * 2, 1.8) * layer.size, c1: col, alpha: 0.65 });
        } else if (layer.kind === 'mist') {
          store.emit({ k: K.PUFF, pos: at.setY(at.y + 0.15), vel: { x: Math.sin(i) * 0.15, y: 0.18, z: Math.cos(i) * 0.15 }, life: layer.duration, size: 0.3 * layer.size, size1: 1.3 * layer.size, c1: col, alpha: 0.22, spin: 0.15 });
        } else {
          store.emit({ k: K.STREAK, pos: at.setY(at.y + 0.2), vel: { x: Math.sin(i * 2.4) * 1.4, y: 1.2 + (i % 4) * 0.4, z: Math.cos(i * 2.4) * 1.4 }, life: layer.duration, size: 0.09 * layer.size, size1: 0.01, stretch: 0.25, c1: col, g: 2, floor: at.y - 0.15 });
        }
      });
    }
  }
}
