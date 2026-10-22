/**
 * Prévia do Arsenal: o item sozinho girando e, ao lado, quem o segura — o manequim de 1 m ou, no campo de treino,
 * o modelo de um Companion (com a pegada daquele modelo), golpeando em loop com o efeito do golpe.
 */
import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ITEM_TYPES, basicAttack, type ItemDef } from '@rules';
import { ItemModel } from './ItemModel';
import { EquipmentLayer } from './Equipment';
import { AssetBoundary } from './Biome';
import { TrainingModel, type Cue } from './TrainingModel';
import { VfxStore } from './vfx/engine';
import { VfxLayer } from './vfx/VfxLayer';
import { Charge, missile, slash } from './vfx/recipes';

function Spin({ item, x }: { item: ItemDef; x: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.6; });
  return <group ref={g} position={[x, 0.35, 0]}><AssetBoundary><Suspense fallback={null}><ItemModel item={{ ...item, grip: { ...item.grip, pos: [0, 0, 0], rot: [0, 0, 0] } }} /></Suspense></AssetBoundary></group>;
}

function Mannequin({ item, charge }: { item: ItemDef; charge: number }) {
  const root = useRef<THREE.Group>(null);
  const ch = useRef(charge); ch.current = charge;
  useFrame((s) => { if (root.current) root.current.rotation.y = 0.5 + Math.sin(s.clock.elapsedTime * 0.5) * 0.5; });
  return (
    <>
      <EquipmentLayer items={[item]} bones={null} root={root} charge={ch} />
      <group ref={root} position={[-0.35, 0, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow><capsuleGeometry args={[0.13, 0.3, 6, 12]} /><meshStandardMaterial color="#e8d6c4" /></mesh>
        <mesh position={[0, 0.62, 0]} castShadow><capsuleGeometry args={[0.16, 0.18, 6, 12]} /><meshStandardMaterial color="#64834b" /></mesh>
        <mesh position={[0, 0.86, 0]} castShadow><sphereGeometry args={[0.17, 20, 16]} /><meshStandardMaterial color="#f3e1d0" /></mesh>
        {[-1, 1].map((k) => <mesh key={k} position={[k * 0.24, 0.45, 0.06]} castShadow><sphereGeometry args={[0.05, 10, 8]} /><meshStandardMaterial color="#f3e1d0" /></mesh>)}
        <mesh position={[-0.06, 0.86, 0.16]}><sphereGeometry args={[0.025, 10, 10]} /><meshBasicMaterial color="#2a2040" /></mesh>
        <mesh position={[0.06, 0.86, 0.16]}><sphereGeometry args={[0.025, 10, 10]} /><meshBasicMaterial color="#2a2040" /></mesh>
      </group>
    </>
  );
}

const ESSENCE_STYLE: Record<string, string> = { fogo: 'chamas', agua: 'gotas', terra: 'pedras', vento: 'vento', luz: 'luz', sombra: 'sombra', gelo: 'gelo', raio: 'raios', natureza: 'folhas', veneno: 'veneno' };

/** Campo de treino: o Companion escolhido segura o item e golpeia no ritmo da arma, de lado para a câmera. */
function Trainer({ item, body, charge }: { item: ItemDef; body: { url: string; companionId: string; swing: boolean }; charge: number }) {
  const store = useMemo(() => new VfxStore(), []);
  const charger = useMemo(() => new Charge(store), [store]);
  const prof = useMemo(() => (ITEM_TYPES[item.type].weapon ? basicAttack(item) : null), [item]);
  const [cue, setCue] = useState<Cue | null>(null);
  const t = useRef(0), n = useRef(0);
  const ch = useRef(charge); ch.current = charge;
  const color = item.essence ? '#ffd56b' : '#ffe8a8';
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (!prof || !body.swing) { charger.stop(); return; }
    const period = prof.ranged === 'charged' ? 2.4 : Math.max(0.9, 1 / prof.cadence + 0.35);
    t.current += dt;
    const hand = new THREE.Vector3(0.4, 0.62, 0);
    if (prof.ranged === 'charged') { if (t.current < 1.5) charger.update(hand, '#ffd56b', Math.min(1, t.current / 1.4), t.current > 1.35, dt); else charger.stop(); }
    if (t.current >= period) {
      t.current = 0; n.current++;
      const kinds = ['attack:' + item.type, prof.anim, 'attack'];
      setCue({ id: n.current, kinds, speed: prof.ranged === 'charged' ? 1 : 1.6 });
      const fx = item.essence ? ESSENCE_STYLE[item.essence] : 'luz';
      if (prof.ranged === 'charged') missile(store, { style: 'faiscas', color: '#ffe68a', from: hand.clone(), to: new THREE.Vector3(3.2, 0.7, 0), duration: 0.25, size: 0.2 });
      else if (prof.ranged === 'magic') store.after(0.25, () => missile(store, { style: fx, color, from: hand.clone(), to: new THREE.Vector3(3, 0.7, 0), duration: 0.35, size: 0.45 }));
      else store.after(0.12, () => slash(store, new THREE.Vector3(0, 0.62, 0), Math.PI / 2, prof.range, color, prof.power > 1.2));
    }
  });
  return (
    <>
      <group rotation={[0, Math.PI / 2, 0]}>
        <AssetBoundary><Suspense fallback={null}><TrainingModel url={body.url} cue={cue} items={[item]} modelKey={body.companionId} charge={ch} /></Suspense></AssetBoundary>
      </group>
      <VfxLayer store={store} />
    </>
  );
}

export function ItemPreview({ item, charge, body }: { item: ItemDef; charge: number; body?: { url: string; companionId: string; swing: boolean } | null }) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={body ? { position: [0.6, 1.1, 2.9], fov: 38 } : { position: [0.2, 1.1, 2.6], fov: 38 }} onCreated={({ camera }) => camera.lookAt(body ? 0.6 : 0.2, 0.55, 0)}>
      <color attach="background" args={['#cfe9ff']} />
      {/* arraste para girar, roda/pinça para aproximar (ver a mão de perto) */}
      <OrbitControls makeDefault target={[body ? 0.6 : 0.2, 0.55, 0]} enablePan={false} enableDamping dampingFactor={0.12} minDistance={0.4} maxDistance={6} maxPolarAngle={Math.PI * 0.55} />
      <hemisphereLight args={['#ffffff', '#5aa84c', 1.4]} />
      <directionalLight position={[3, 6, 4]} intensity={1.7} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[3.5, 40]} /><meshLambertMaterial color="#8fcf60" /></mesh>
      {body ? <Trainer item={item} body={body} charge={charge} /> : <Mannequin item={item} charge={charge} />}
      <Spin item={item} x={body ? 1.9 : 0.9} />
    </Canvas>
  );
}
