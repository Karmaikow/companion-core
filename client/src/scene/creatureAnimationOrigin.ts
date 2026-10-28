import * as THREE from 'three';

export interface CreatureClip { clip: THREE.AnimationClip; kind: string; src: string; originAligned?: boolean }

/** Some exported rigs use a different origin for animated hips and the bind pose.
 * Measure the constant offset from that asset's idle clip, then subtract it from
 * all its clips. Preserve vertical deltas (jumps/breathing), and never edit cached
 * GLTF clips or re-ground the mesh every frame. Assets without idle stay untouched.
 */
export function alignCreatureAnimationOrigins(model: THREE.Object3D, clips: CreatureClip[], height: number): CreatureClip[] {
  const result: CreatureClip[] = clips.map((entry) => ({ ...entry, clip: entry.clip.clone() }));
  if (!Number.isFinite(height) || height <= 0) return result;
  model.updateMatrixWorld(true);
  for (const source of new Set(result.map((entry) => entry.src))) {
    const group = result.filter((entry) => entry.src === source);
    const reference = group.find((entry) => /^idle$/i.test(entry.clip.name)) ?? group.find((entry) => entry.kind === 'idle');
    if (!reference) continue;
    const positions = reference.clip.tracks.flatMap((track) => {
      if (!track.name.endsWith('.position') || track.getValueSize() !== 3 || track.values.length < 3) return [];
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(model, binding.nodeName) as THREE.Bone | null;
      return node?.isBone ? [{ track, node }] : [];
    });
    const animatedBones = new Set(positions.map(({ node }) => node));
    for (const { track, node } of positions) {
      // Only the highest animated translation in each bone chain is a root origin.
      let parent = node.parent, nested = false;
      while (parent) { if (animatedBones.has(parent as THREE.Bone)) { nested = true; break; } parent = parent.parent; }
      if (nested) continue;
      const offset = new THREE.Vector3().fromArray(track.values).sub(node.position);
      const worldOffset = offset.clone();
      if (node.parent) worldOffset.applyMatrix3(new THREE.Matrix3().setFromMatrix4(node.parent.matrixWorld));
      // Small idle shifts and crouches are intentional. Fix only a large upward displacement.
      if (!Number.isFinite(worldOffset.y) || worldOffset.y <= height * 0.5) continue;
      for (const entry of group) {
        const translation = entry.clip.tracks.find((t) => t.name === track.name && t.getValueSize() === 3);
        if (!translation) continue;
        entry.originAligned = true;
        for (let i = 0; i < translation.values.length; i += 3) {
          translation.values[i] -= offset.x;
          translation.values[i + 1] -= offset.y;
          translation.values[i + 2] -= offset.z;
        }
      }
    }
  }
  return result;
}

/** A corrected idle may still bend the legs slightly relative to the bind pose.
 * Calibrate the floor once from that pose, then restore the rig before playback.
 * This is intentionally not applied frame-by-frame: jumps must keep their lift.
 */
export function creatureAnimationReferenceBox(model: THREE.Object3D, clips: CreatureClip[], fallback: THREE.Box3): THREE.Box3 {
  const reference = clips.find((entry) => entry.originAligned && /^idle$/i.test(entry.clip.name))
    ?? clips.find((entry) => entry.originAligned && entry.kind === 'idle');
  if (!reference) return fallback;
  const mixer = new THREE.AnimationMixer(model);
  try {
    mixer.clipAction(reference.clip).play(); mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    return !box.isEmpty() && Number.isFinite(box.min.y) && box.max.y - box.min.y > 1e-4 ? box : fallback;
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(model); model.updateMatrixWorld(true);
  }
}
