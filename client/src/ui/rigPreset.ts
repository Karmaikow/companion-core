/**
 * Esqueleto salvo para o rig no Administrador: o encaixe feito num modelo (ex.: Mayuna) vira o ponto de partida dos
 * próximos. Fica em game_config.values.rigPresets.<tipo> = { url, box, from, at } (arquivo público em world-assets);
 * o editor estica o esqueleto da caixa do modelo salvo para a caixa do modelo aberto.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { supabase } from '../backend/online';
import { uploadWorldAsset } from './catalog';

export interface RigPreset { url: string; box: number[]; from: string; at: string }

export async function loadRigPreset(kind = 'human'): Promise<RigPreset | null> {
  const { data } = await supabase().from('game_config').select('values').eq('id', 1).maybeSingle();
  const p = ((data?.values ?? {}) as { rigPresets?: Record<string, RigPreset> }).rigPresets?.[kind];
  return p && typeof p.url === 'string' && Array.isArray(p.box) && p.box.length === 6 ? p : null;
}

/** Confere que o .GLB tem o esqueleto humano do Mesh2Motion e mede a caixa do modelo na pose de encaixe. */
export async function inspectRigFile(buf: ArrayBuffer): Promise<number[]> {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const g = await loader.parseAsync(buf, '');
  const bones = new Set<string>();
  g.scene.traverse((o) => { if ((o as THREE.Bone).isBone) bones.add(o.name); if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.pose(); });
  if (!['pelvis', 'spine_01', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r'].every((b) => bones.has(b))) {
    throw new Error('Esse modelo não tem o esqueleto humano do Mesh2Motion. Faça o rig dele aqui primeiro (Fazer o rig aqui).');
  }
  g.scene.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g.scene);
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((n) => +n.toFixed(5));
}

/** Guarda o esqueleto deste modelo como ponto de partida dos próximos rigs desse tipo. */
export async function saveRigPreset(source: Blob, from: string, kind = 'human'): Promise<RigPreset> {
  const buf = await source.arrayBuffer();
  const box = await inspectRigFile(buf);
  const up = await uploadWorldAsset(`rig-presets/${kind}-${Date.now()}.glb`, new File([buf], `${kind}.glb`, { type: 'model/gltf-binary' }));
  const preset: RigPreset = { url: up.url, box, from, at: new Date().toISOString() };
  const db = supabase();
  const { data, error } = await db.from('game_config').select('values').eq('id', 1).maybeSingle();
  if (error) throw new Error('Não consegui ler a configuração: ' + error.message);
  const values = (data?.values ?? {}) as Record<string, unknown>;
  const presets = { ...((values.rigPresets ?? {}) as Record<string, RigPreset>), [kind]: preset };
  const uid = (await db.auth.getUser()).data.user?.id;
  const r = await db.from('game_config').update({ values: { ...values, rigPresets: presets }, updated_at: new Date().toISOString(), updated_by: uid }).eq('id', 1);
  if (r.error) throw new Error('Não consegui salvar o esqueleto: ' + r.error.message);
  return preset;
}

/** Parâmetros do editor para começar pelo esqueleto salvo. */
export const presetQuery = (p: RigPreset | null, kind = 'human') =>
  p ? `&esqueleto=${encodeURIComponent(p.url)}&tipo=${kind}&caixa=${p.box.join(',')}` : '';
