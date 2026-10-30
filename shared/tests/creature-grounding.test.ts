import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { creatureIdleFloor } from '../../client/src/scene/creatureGrounding';
describe('creature idle grounding', () => {
  it('grounds an authored idle below bind pose without rewriting animation or rig', () => {
    const model = new THREE.Group(), bone = new THREE.Bone();
    bone.name = 'Hips'; bone.position.y = 0.5; model.add(bone);
    bone.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const clip = new THREE.AnimationClip('Idle', 1, [new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0.25, 0, 0, 0.3, 0])]);
    const original = [...clip.tracks[0].values];
    expect(creatureIdleFloor(model, clip, 0)).toBeCloseTo(-0.25);
    expect(bone.position.y).toBe(0.5);
    expect([...clip.tracks[0].values]).toEqual(original);
    expect(creatureIdleFloor(model, undefined, 0.1)).toBe(0.1);
  });
});
