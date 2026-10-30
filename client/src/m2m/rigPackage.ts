import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { animRef } from '@rules';
import { STANDARD_SLOTS, STANDARD_EXTRAS, STANDARD_PREFIX } from './slots';
import type { Retargeter } from './standard';

/** Reject stationary/unbound locomotion instead of publishing another static model. */
export function hasSkinnedMotion(model: THREE.Object3D, clip: THREE.AnimationClip): boolean {
  const driven = new Set<THREE.Object3D>();
  model.traverse(o => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const weights = mesh.geometry.getAttribute('skinWeight'), indices = mesh.geometry.getAttribute('skinIndex');
    if (!weights || !indices) return;
    const used = new Set<number>();
    for (let i = 0; i < weights.count; i++) for (let k = 0; k < 4; k++) if (weights.getComponent(i, k) > 0) used.add(indices.getComponent(i, k));
    for (const index of used) {
      let node: THREE.Object3D | null = mesh.skeleton.bones[index] ?? null;
      while (node) { driven.add(node); node = node.parent; }
    }
  });
  return clip.tracks.some(t => {
    const binding = THREE.PropertyBinding.parseTrackName(t.name);
    const node = THREE.PropertyBinding.findNode(model, binding.nodeName) as THREE.Object3D | null;
    if (!node || !driven.has(node) || t.times.length < 2) return false;
    const size = t.getValueSize(), values = t.values;
    for (let i = size; i < values.length; i += size) {
      if (size === 4 && t.name.endsWith('.quaternion')) {
        const dot = Math.abs(values[0]*values[i] + values[1]*values[i+1] + values[2]*values[i+2] + values[3]*values[i+3]);
        if (1 - dot > 1e-7) return true;
      } else for (let k = 0; k < size; k++) {
        // Horizontal locomotion is removed by the game's in-place playback.
        if (t.name.endsWith('.position') && k !== 1) continue;
        if (Math.abs(values[i+k] - values[k]) > 1e-6) return true;
      }
    }
    return false;
  });
}

export async function collectRigClips(model: THREE.Object3D, rt: Retargeter, progress: (message: string) => void = () => {}): Promise<THREE.AnimationClip[]> {
  const clips: THREE.AnimationClip[] = [];
  for (const name of new Set([...Object.values(STANDARD_SLOTS), ...STANDARD_EXTRAS])) {
    progress('Convertendo animação: ' + name + '…');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const clip = rt.get(name);
    if (!clip || !clip.tracks.length) {
      if (!Object.values(STANDARD_SLOTS).includes(name)) continue;
      throw new Error('A biblioteca não gerou o clipe obrigatório: ' + name);
    }
    clips.push(clip.clone());
  }
  for (const name of [STANDARD_SLOTS.walk, STANDARD_SLOTS.run]) {
    if (!hasSkinnedMotion(model, clips.find(c => c.name === name)!)) throw new Error('O clipe ' + name + ' não movimenta a malha deste rig. O modelo anterior foi mantido.');
  }
  return clips;
}

export async function prepareRigPackage(file: File, progress: (message: string) => void = () => {}) {
  progress('Abrindo e validando o esqueleto humano…');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
  const standard = await import('./standard');
  progress('Convertendo as animações para o novo esqueleto…');
  const rt = await standard.makeRetargeter(gltf.scene);
  const clips = await collectRigClips(gltf.scene, rt, progress);
  progress('Gravando o pacote de animações…');
  const name = STANDARD_PREFIX + '-rig-' + Date.now() + '.glb';
  const animations = new File([await standard.exportClips(gltf.scene, clips)], name, { type: 'model/gltf-binary' });
  const slots = Object.fromEntries(Object.entries(STANDARD_SLOTS).map(([key, clip]) => ['slot:' + key, animRef(name, clip)]));
  return { animations, slots, count: clips.length };
}
