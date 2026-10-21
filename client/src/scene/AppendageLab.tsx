/** Lab (só dev): manequim humanoide de 1 m andando em círculo, com cauda e asas — para ajustar a física e o visual. */
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Appendages, type AppendageSpec } from './Appendages';

function Mannequin({ spec, walk }: { spec: AppendageSpec; walk: boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame((s) => {
    const r = root.current; if (!r) return;
    const t = s.clock.elapsedTime * (walk ? 0.5 : 0);
    r.position.set(Math.sin(t) * 0.9, 0, Math.cos(t) * 0.9 - 0.5);
    r.rotation.y = walk ? t + Math.PI / 2 : 2.1 + Math.sin(s.clock.elapsedTime * 0.5) * 0.4;
  });
  return (
    <>
      <Appendages spec={spec} anchors={{ hips: null, chest: null }} root={root} heightAt={() => 0} />
      <group ref={root}>
        <mesh position={[0, 0.3, 0]} castShadow><capsuleGeometry args={[0.13, 0.3, 6, 12]} /><meshStandardMaterial color="#e8d6c4" /></mesh>
        <mesh position={[0, 0.62, 0]} castShadow><capsuleGeometry args={[0.16, 0.18, 6, 12]} /><meshStandardMaterial color={spec.palette.primary} /></mesh>
        <mesh position={[0, 0.86, 0]} castShadow><sphereGeometry args={[0.17, 20, 16]} /><meshStandardMaterial color="#f3e1d0" /></mesh>
        <mesh position={[0, 0.9, 0.02]} castShadow scale={[1.08, 1, 1.05]}><sphereGeometry args={[0.17, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={spec.palette.secondary} /></mesh>
        <mesh position={[-0.06, 0.86, 0.16]}><sphereGeometry args={[0.025, 10, 10]} /><meshBasicMaterial color="#2a2040" /></mesh>
        <mesh position={[0.06, 0.86, 0.16]}><sphereGeometry args={[0.025, 10, 10]} /><meshBasicMaterial color="#2a2040" /></mesh>
      </group>
    </>
  );
}

export function AppendageLab({ spec, walk }: { spec: AppendageSpec; walk: boolean }) {
  return (
    <Canvas shadows camera={{ position: [1.6, 1.4, 2.6], fov: 40 }} onCreated={({ camera }) => camera.lookAt(0, 0.5, -0.3)}>
      <color attach="background" args={['#cfe9ff']} />
      <hemisphereLight args={['#ffffff', '#5aa84c', 1.4]} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[4, 40]} /><meshLambertMaterial color="#8fcf60" /></mesh>
      <Mannequin spec={spec} walk={walk} />
    </Canvas>
  );
}
