import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { alignCreatureAnimationOrigins, creatureAnimationReferenceBox } from '../../client/src/scene/creatureAnimationOrigin';
function fixture(offset = 2) {
  const model = new THREE.Group(), hips = new THREE.Bone(); hips.name = 'Hips'; hips.position.set(0, 0.4, 0); model.add(hips);
  const clip = (name: string, rise: number) => new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0.4 + offset, 1, 0, 0.4 + offset + rise, 1])]);
  return { model, clips: [{ clip: clip('Idle', 0.02), kind: 'idle', src: 'body' }, { clip: clip('Jump', 1.5), kind: 'jump', src: 'body' }] };
}
describe('creature animation origins', () => {
  it('removes a constant exported origin while preserving jump and breathing deltas', () => {
    const { model, clips } = fixture(); const corrected = alignCreatureAnimationOrigins(model, clips, 1);
    expect(corrected[0].clip.tracks[0].values[1]).toBeCloseTo(0.4);
    expect(corrected[0].clip.tracks[0].values[4]).toBeCloseTo(0.42);
    expect(corrected[1].clip.tracks[0].values[4]).toBeCloseTo(1.9);
    expect(clips[0].clip.tracks[0].values[1]).toBeCloseTo(2.4);
    expect(corrected[0].clip.tracks[0].values[2]).toBeCloseTo(0);
  });
  it('leaves small offsets, crouches and sources without idle unchanged', () => {
    for (const offset of [0.02, -2]) { const {model,clips}=fixture(offset); expect(alignCreatureAnimationOrigins(model,clips,1)[0].clip.tracks[0].values).toEqual(clips[0].clip.tracks[0].values); }
    const {model,clips}=fixture();expect(alignCreatureAnimationOrigins(model,[clips[1]],1)[0].clip.tracks[0].values).toEqual(clips[1].clip.tracks[0].values);
  });
  it('calibrates the idle floor once and restores the original rig transform', () => {
    const {model,clips}=fixture();
    model.children[0].add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
    model.updateMatrixWorld(true);
    const before=model.children[0].position.clone(), fallback=new THREE.Box3().setFromObject(model,true);
    const aligned=alignCreatureAnimationOrigins(model,clips,1);
    const box=creatureAnimationReferenceBox(model,aligned,fallback);
    expect(box.min.y).toBeCloseTo(-0.1);
    expect(model.children[0].position.toArray()).toEqual(before.toArray());
    expect(creatureAnimationReferenceBox(model,clips,fallback)).toBe(fallback);
  });
  it('isolates offsets by source file', () => {
    const {model,clips}=fixture();clips[1].src='external';expect(alignCreatureAnimationOrigins(model,clips,1)[1].clip.tracks[0].values).toEqual(clips[1].clip.tracks[0].values);
  });
  it('measures vertical displacement through a rotated parent, not local Y', () => {
    const {model,clips}=fixture(0);model.rotation.x=-Math.PI/2;
    const values=clips[0].clip.tracks[0].values;values[2]=values[5]=2;
    const corrected=alignCreatureAnimationOrigins(model,clips,1);
    expect(corrected[0].clip.tracks[0].values[2]).toBeCloseTo(0);
  });
});
