/**
 * Equipamento visível no Companion: cada item preso a um osso (mão direita, mão esquerda, cabeça, peito) do rig
 * humanoide. A posição vem do osso; a orientação vem do corpo, mais o quanto o osso girou desde a pose de descanso —
 * assim a espada acompanha o golpe sem depender de como cada rig orienta os ossos. Sem osso (manequim, rig sem nome
 * padrão), usa pontos fixos no corpo de 1 m. O ajuste fino de cada item fica na "pegada" (Arsenal).
 */
import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ITEM_TYPES, SLOTS_EQ, type Bone, type ItemDef } from '@rules';
import { ItemModel } from './ItemModel';
import { AssetBoundary } from './Biome';

export interface GearBones { mao_direita: THREE.Object3D | null; mao_esquerda: THREE.Object3D | null; cabeca: THREE.Object3D | null; peito: THREE.Object3D | null }

export function findGearBones(model: THREE.Object3D): GearBones {
  const out: GearBones = { mao_direita: null, mao_esquerda: null, cabeca: null, peito: null };
  model.traverse((o) => {
    const n = o.name.toLowerCase().replace(/mixamorig[:_]?/, '');
    if (!out.mao_direita && /(right_?hand|hand_?r$|r_?hand|hand\.r|righthand)/.test(n) && !/thumb|index|middle|ring|pinky/.test(n)) out.mao_direita = o;
    if (!out.mao_esquerda && /(left_?hand|hand_?l$|l_?hand|hand\.l|lefthand)/.test(n) && !/thumb|index|middle|ring|pinky/.test(n)) out.mao_esquerda = o;
    if (!out.cabeca && /^head$|(^|[^a-z])head($|[^a-z])/.test(n) && !/top|end/.test(n)) out.cabeca = o;
    if (!out.peito && /upper_?chest|chest|spine_?0?3|spine2/.test(n)) out.peito = o;
  });
  return out;
}

// pontos fixos (corpo de 1 m, frente em +Z, lado direito em −X) quando não há osso
const FALLBACK: Record<Exclude<Bone, 'nenhum'>, [number, number, number]> = {
  mao_direita: [-0.24, 0.42, 0.1], mao_esquerda: [0.24, 0.42, 0.1], cabeca: [0, 0.98, 0], peito: [0, 0.66, -0.1],
};
// orientação base no corpo, por tipo (armas apontam para cima/frente; o arco fica de pé com a flecha para a frente)
function baseRotation(item: ItemDef): THREE.Euler {
  if (item.type === 'arco') return new THREE.Euler(0, -Math.PI / 2, 0.08);
  if (item.type === 'escudo') return new THREE.Euler(0, Math.PI * 0.32, 0);
  if (item.type === 'grimorio') return new THREE.Euler(-0.3, 0.5, 0);
  if (ITEM_TYPES[item.type].slot === 'weapon') return new THREE.Euler(0.45, 0, 0);
  return new THREE.Euler(0, 0, 0);
}
export function boneFor(item: ItemDef): Bone {
  if (item.type === 'arco') return 'mao_esquerda'; // arco na mão esquerda, a direita puxa a corda
  return SLOTS_EQ[ITEM_TYPES[item.type].slot].bone;
}

const v = new THREE.Vector3(), q = new THREE.Quaternion(), rq = new THREE.Quaternion(), rel = new THREE.Quaternion();

function Attached({ item, bones, root, charge }: { item: ItemDef; bones: GearBones | null; root: React.RefObject<THREE.Group | null>; charge?: { current: number } }) {
  const g = useRef<THREE.Group>(null);
  const bone = boneFor(item);
  const base = useMemo(() => new THREE.Quaternion().setFromEuler(baseRotation(item)), [item]);
  const rest = useRef<THREE.Quaternion | null>(null);
  useFrame(() => {
    const r = root.current, grp = g.current; if (!r || !grp || bone === 'nenhum') return;
    r.getWorldQuaternion(rq);
    const b = bones?.[bone] ?? null;
    if (b) {
      b.getWorldPosition(grp.position);
      if (bone === 'cabeca') grp.position.add(v.set(0, 0.3, 0).applyQuaternion(rq));
      // quanto o osso girou desde a pose de descanso (no espaço do corpo)
      b.getWorldQuaternion(q); rel.copy(rq).invert().multiply(q);
      if (!rest.current) rest.current = rel.clone().invert();
      const delta = rel.multiply(rest.current);
      grp.quaternion.copy(rq).multiply(bone === 'cabeca' || bone === 'peito' ? base : delta.multiply(base));
    } else {
      r.getWorldPosition(grp.position).add(v.set(...FALLBACK[bone]).applyQuaternion(rq));
      grp.quaternion.copy(rq).multiply(base);
    }
  });
  return <group ref={g}><AssetBoundary><Suspense fallback={null}><ItemModel item={item} charge={item.type === 'arco' ? charge : undefined} /></Suspense></AssetBoundary></group>;
}

export function EquipmentLayer({ items, bones, root, charge }: { items: ItemDef[]; bones: GearBones | null; root: React.RefObject<THREE.Group | null>; charge?: { current: number } }) {
  return <>{items.filter((i) => boneFor(i) !== 'nenhum').map((i) => <Attached key={i.slug + JSON.stringify(i.grip)} item={i} bones={bones} root={root} charge={charge} />)}</>;
}
