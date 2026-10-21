/** Prévia do Arsenal: o item sozinho girando e, ao lado, um manequim de 1 m segurando/vestindo o item (pegada). */
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ItemDef } from '@rules';
import { ItemModel } from './ItemModel';
import { EquipmentLayer } from './Equipment';
import { AssetBoundary } from './Biome';

function Spin({ item }: { item: ItemDef }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.6; });
  return <group ref={g} position={[0.9, 0.35, 0]}><AssetBoundary><Suspense fallback={null}><ItemModel item={{ ...item, grip: { ...item.grip, pos: [0, 0, 0], rot: [0, 0, 0] } }} /></Suspense></AssetBoundary></group>;
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

export function ItemPreview({ item, charge }: { item: ItemDef; charge: number }) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0.2, 1.1, 2.6], fov: 38 }} onCreated={({ camera }) => camera.lookAt(0.2, 0.55, 0)}>
      <color attach="background" args={['#cfe9ff']} />
      <hemisphereLight args={['#ffffff', '#5aa84c', 1.4]} />
      <directionalLight position={[3, 6, 4]} intensity={1.7} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[3, 40]} /><meshLambertMaterial color="#8fcf60" /></mesh>
      <Mannequin item={item} charge={charge} />
      <Spin item={item} />
    </Canvas>
  );
}
