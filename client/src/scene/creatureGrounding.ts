import * as THREE from 'three';

/** Ground against the authored idle pose, keeping bind-pose scale and all clip motion.
 * Sample once before playback; never subtract offsets from bone keyframes.
 */
export function creatureIdleFloor(model: THREE.Object3D, idle: THREE.AnimationClip | undefined, fallback: number): number {
  if (!idle) return fallback;
  const mixer = new THREE.AnimationMixer(model);
  try {
    mixer.clipAction(idle.clone()).play();
    mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    return !box.isEmpty() && Number.isFinite(box.min.y) && box.max.y - box.min.y > 1e-4 ? box.min.y : fallback;
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    model.updateMatrixWorld(true);
  }
}
