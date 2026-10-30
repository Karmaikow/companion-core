import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { collectRigClips, hasSkinnedMotion } from '../../client/src/m2m/rigPackage';
import type { Retargeter } from '../../client/src/m2m/standard';
import { STANDARD_SLOTS } from '../../client/src/m2m/slots';

function fixture() {
  const scene = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'Leg';
  const geometry = new THREE.BoxGeometry(1, 1, 1), n = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  const weights = new Float32Array(n * 4); for (let i = 0; i < n; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); mesh.add(bone); scene.add(mesh); mesh.bind(new THREE.Skeleton([bone]));
  const clip = (name: string, node = 'Leg', moving = true) => new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack(node + '.quaternion', [0, 1], [0, 0, 0, 1, 0, moving ? Math.SQRT1_2 : 0, 0, moving ? Math.SQRT1_2 : 1])]);
  const rt = { get: (name: string) => clip(name) } as Retargeter;
  return { scene, bone, mesh, clip, rt };
}
describe('humanoid autorig animation package', () => {
  it('requires motion on nodes influencing the skinned mesh, not unrelated animation names', () => {
    const f = fixture();
    expect(hasSkinnedMotion(f.scene, f.clip('Walk'))).toBe(true);
    expect(hasSkinnedMotion(f.scene, f.clip('Walk', 'Missing'))).toBe(false);
    expect(hasSkinnedMotion(f.scene, f.clip('Walk', 'Leg', false))).toBe(false);
    const horizontal = new THREE.AnimationClip('Walk', 1, [new THREE.VectorKeyframeTrack('Leg.position', [0, 1], [0, 0, 0, 2, 0, 0])]);
    expect(hasSkinnedMotion(f.scene, horizontal)).toBe(false);
    f.mesh.geometry.getAttribute('skinWeight').array.fill(0);
    expect(hasSkinnedMotion(f.scene, f.clip('Walk'))).toBe(false);
  });
  it('includes every default role and isolates exported clips from the retargeter cache', async () => {
    const f = fixture(); const cached = f.clip('Walk');
    const pack = await collectRigClips(f.scene, { ...f.rt, get: name => name === 'Walk' ? cached : f.clip(name) });
    for (const name of Object.values(STANDARD_SLOTS)) expect(pack.some(c => c.name === name)).toBe(true);
    pack.find(c => c.name === 'Walk')!.tracks[0].values[0] = 7;
    expect(cached.tracks[0].values[0]).toBe(0);
  });
  it('fails explicitly when a required role is absent or locomotion is stationary', async () => {
    const f = fixture();
    await expect(collectRigClips(f.scene, { ...f.rt, get: name => name === 'Walk' ? null : f.clip(name) })).rejects.toThrow('obrigatório: Walk');
    await expect(collectRigClips(f.scene, { ...f.rt, get: name => f.clip(name, 'Leg', false) })).rejects.toThrow('não movimenta');
  });
});
