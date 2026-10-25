/**
 * Equipamento visível no Companion: cada item é FILHO do osso (mão direita, mão esquerda, cabeça, peito) do rig
 * humanoide e acompanha a animação sozinho. O encaixe parte da pose de ligação (A-pose), igual para todo rig. Sem osso (manequim, rig sem nome
 * padrão), usa pontos fixos no corpo de 1 m. O ajuste fino de cada item fica na "pegada" (Arsenal).
 */
import { Suspense, useMemo, useRef } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ITEM_TYPES, SLOTS_EQ, gripFor, type Bone, type EquipSlot, type ItemDef } from '@rules';
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
  if (ITEM_TYPES[item.type].weapon) return new THREE.Euler(0.45, 0, 0);
  return new THREE.Euler(0, 0, 0);
}
/** Osso onde a peça fica: o do espaço em que foi equipada (arma secundária vai na mão esquerda). */
export function boneFor(item: ItemDef, slot?: EquipSlot): Bone {
  if (item.type === 'arco') return 'mao_esquerda'; // arco na mão esquerda, a direita puxa a corda
  const sl = slot ?? ITEM_TYPES[item.type].slot;
  return sl ? SLOTS_EQ[sl].bone : 'nenhum';
}

const v = new THREE.Vector3(), q = new THREE.Quaternion(), rq = new THREE.Quaternion(), sc = new THREE.Vector3(), m4 = new THREE.Matrix4();

/**
 * Giro do osso na pose de ligação (bind pose / A-pose do Tripo-Mixamo), no espaço do corpo. É fixo para cada rig, então
 * a pegada não depende da animação que estava tocando quando o item apareceu. Sem SkinnedMesh, devolve null.
 */
function bindRel(bone: THREE.Object3D, root: THREE.Object3D): THREE.Quaternion | null {
  let found: THREE.Quaternion | null = null;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (found || !sm.isSkinnedMesh || !sm.skeleton) return;
    const i = sm.skeleton.bones.indexOf(bone as THREE.Bone);
    if (i < 0) return;
    // osso no mundo na pose de ligação = malha agora × (malha na ligação)⁻¹ × (inversa do osso)⁻¹
    m4.copy(sm.skeleton.boneInverses[i]).invert().premultiply(sm.bindMatrixInverse).premultiply(sm.matrixWorld);
    const bq = new THREE.Quaternion(); m4.decompose(v, bq, sc);
    root.getWorldQuaternion(rq);
    found = rq.clone().invert().multiply(bq);
  });
  return found;
}

/** Matriz do osso no mundo na pose de ligação (independe da animação tocando). */
function bindWorld(bone: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 | null {
  let out: THREE.Matrix4 | null = null;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (out || !sm.isSkinnedMesh || !sm.skeleton) return;
    const i = sm.skeleton.bones.indexOf(bone as THREE.Bone);
    if (i < 0) return;
    out = new THREE.Matrix4().copy(sm.skeleton.boneInverses[i]).invert().premultiply(sm.bindMatrixInverse).premultiply(sm.matrixWorld);
  });
  return out;
}

/**
 * Encaixe pela própria mão (na pose de ligação), igual em qualquer rig — braços abertos (T) ou para baixo (A), nomes do
 * Tripo/Mixamo ou do Mesh2Motion: "ao longo" = do pulso para os dedos; "polegar" = do mindinho para o indicador; a palma
 * fica no meio. Arma: a lâmina sai do lado do polegar (como num punho fechado). Arco: as pontas seguem o polegar e a flecha
 * aponta para onde os dedos apontam (o braço esticado). Devolve a orientação (espaço do mundo, na ligação) e a palma
 * (espaço do osso), ou null se a mão não tiver dedos nem antebraço para medir.
 */
function handSocket(hand: THREE.Object3D, root: THREE.Object3D, kind: 'arma' | 'arco'): { q: THREE.Quaternion; palm: THREE.Vector3 } | null {
  const Mh = bindWorld(hand, root);
  if (!Mh) return null;
  const at = (o: THREE.Object3D) => { const m = bindWorld(o, root); return m ? new THREE.Vector3().setFromMatrixPosition(m) : null; };
  const H = new THREE.Vector3().setFromMatrixPosition(Mh);
  const kids = hand.children.filter((c) => (c as THREE.Bone).isBone);
  const name = (o: THREE.Object3D) => o.name.toLowerCase();
  const pick = (re: RegExp) => kids.find((c) => re.test(name(c))) ?? null;
  const idx = pick(/index/), mid = pick(/middle/), pin = pick(/pinky|little/) ?? pick(/ring/);
  const fingers = kids.filter((c) => !/thumb/.test(name(c)));
  let along: THREE.Vector3 | null = null;
  const mp = mid ? at(mid) : null;
  if (mp) along = mp.clone().sub(H);
  else if (fingers.length) { const c = new THREE.Vector3(); let n = 0; for (const f of fingers) { const p = at(f); if (p) { c.add(p); n++; } } if (n) along = c.divideScalar(n).sub(H); }
  if ((!along || along.lengthSq() < 1e-10) && hand.parent) { const pa = at(hand.parent); if (pa) along = H.clone().sub(pa); }
  if (!along || along.lengthSq() < 1e-10) return null;
  along.normalize();
  const ip = idx ? at(idx) : null, pp = pin ? at(pin) : null;
  let thumb = ip && pp ? ip.clone().sub(pp) : null;
  if (!thumb || thumb.lengthSq() < 1e-10) { root.getWorldQuaternion(rq); thumb = new THREE.Vector3(0, 0, 1).applyQuaternion(rq); }
  thumb.sub(along.clone().multiplyScalar(thumb.dot(along))).normalize();
  const n = new THREE.Vector3().crossVectors(along, thumb).normalize();
  const basis = kind === 'arco'
    ? new THREE.Matrix4().makeBasis(along, thumb, n) // x: flecha (dedos), y: pontas do arco (polegar)
    : new THREE.Matrix4().makeBasis(n, thumb, along.clone().negate()); // y: lâmina (polegar), z: para o pulso
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  // palma: um pouco a caminho dos dedos, no espaço do osso
  const len = mp ? mp.distanceTo(H) : 0.05 * (H.length() || 1);
  const palmWorld = H.clone().add(along.clone().multiplyScalar(len * 0.45));
  const palm = palmWorld.applyMatrix4(Mh.clone().invert());
  return { q, palm };
}

/**
 * Item preso DIRETO no osso (filho do osso na cena): acompanha a mão em toda animação, sem cálculo por quadro.
 * O encaixe ("socket") desfaz o giro do osso na pose de ligação e aplica a orientação base do tipo de item, então a
 * pegada (Arsenal) fica no espaço da mão em A-pose: igual para todo rig humanoide. A escala do osso é compensada para
 * o item ter o tamanho de mundo dele. O ajuste fino continua na pegada (posição, giro, tamanho).
 */
function Attached({ item, slot, bones, root, charge, showSocket }: { item: ItemDef; slot?: EquipSlot; bones: GearBones | null; root: React.RefObject<THREE.Group | null>; charge?: { current: number }; showSocket?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const bone = boneFor(item, slot);
  const base = useMemo(() => new THREE.Quaternion().setFromEuler(baseRotation(item)), [item]);
  const b = bone === 'nenhum' ? null : bones?.[bone] ?? null;
  const local = useRef<THREE.Quaternion | null>(null);
  const firstRel = useRef<THREE.Quaternion | null>(null);
  const palm = useRef<THREE.Vector3 | null>(null);
  useFrame(() => {
    const r = root.current, grp = g.current; if (!r || !grp || bone === 'nenhum') return;
    if (b) {
      if (!local.current) {
        // mãos com arma ou arco: encaixe medido na própria mão (igual em qualquer rig e pose de ligação)
        const hand = (bone === 'mao_direita' || bone === 'mao_esquerda') && (item.type === 'arco' || !!ITEM_TYPES[item.type].weapon);
        const sock = hand ? handSocket(b, r, item.type === 'arco' ? 'arco' : 'arma') : null;
        const Mb = sock ? bindWorld(b, r) : null;
        if (sock && Mb) {
          const bq = new THREE.Quaternion(); Mb.decompose(v, bq, sc);
          local.current = bq.invert().multiply(sock.q);
          palm.current = sock.palm;
        } else {
          // pose de ligação; sem ela (rig sem pele), o primeiro quadro serve de descanso
          let rest = bindRel(b, r);
          if (!rest) { r.getWorldQuaternion(rq); b.getWorldQuaternion(q); firstRel.current ??= rq.clone().invert().multiply(q); rest = firstRel.current; }
          local.current = rest.clone().invert().multiply(base);
        }
      }
      grp.quaternion.copy(local.current);
      b.getWorldScale(sc);
      const k = 1 / Math.max(1e-4, (Math.abs(sc.x) + Math.abs(sc.y) + Math.abs(sc.z)) / 3);
      grp.scale.setScalar(k);
      // chapéu e coroa: um pouco acima do osso da cabeça (no espaço do corpo em A-pose)
      if (bone === 'cabeca') grp.position.copy(v.set(0, 0.3 * k, 0).applyQuaternion(local.current.clone().multiply(base.clone().invert())));
      else if (palm.current) grp.position.copy(palm.current);
      else grp.position.set(0, 0, 0);
    } else {
      r.getWorldQuaternion(rq);
      r.getWorldPosition(grp.position).add(v.set(...FALLBACK[bone]).applyQuaternion(rq));
      grp.quaternion.copy(rq).multiply(base);
      grp.scale.setScalar(1);
    }
  });
  const body = (
    <group ref={g}>
      {showSocket && <axesHelper args={[0.12]} />}
      <AssetBoundary><Suspense fallback={null}><ItemModel item={item} charge={item.type === 'arco' ? charge : undefined} draw={item.type === 'arco' && bone === 'mao_esquerda' ? bones?.mao_direita ?? null : null} /></Suspense></AssetBoundary>
    </group>
  );
  return b ? createPortal(body, b) : body;
}

/** `modelKey`: id do Companion — usa a pegada ajustada para aquele modelo no Arsenal, se houver. */
/** `slots`: em que espaço cada peça foi equipada (slug → espaço); sem ele, o espaço natural do tipo. */
export function EquipmentLayer({ items, slots, bones, root, charge, modelKey, showSocket }: { items: ItemDef[]; slots?: Record<string, EquipSlot>; bones: GearBones | null; root: React.RefObject<THREE.Group | null>; charge?: { current: number }; modelKey?: string | null; showSocket?: boolean }) {
  return <>{items.filter((i) => boneFor(i, slots?.[i.slug]) !== 'nenhum').map((i) => { const it = { ...i, grip: gripFor(i, modelKey) }; return <Attached key={i.slug + (slots?.[i.slug] ?? '') + JSON.stringify(it.grip)} item={it} slot={slots?.[i.slug]} bones={bones} root={root} charge={charge} showSocket={showSocket} />; })}</>;
}
