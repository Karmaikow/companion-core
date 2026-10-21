/** Prévia de uma criatura no Invocador: ela no centro de um gramado, virando de um lado para o outro, ao lado da silhueta de um Companion de 1 m. */
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CreatureDef } from '@rules';
import { CreatureBody, type CreatureAct } from './Creature';
import { AssetBoundary } from './Biome';

function Turntable({ def, act }: { def: CreatureDef; act: CreatureAct }) {
  const g = useRef<THREE.Group>(null);
  // balança de um lado para o outro (o rosto fica sempre à vista)
  useFrame((s) => { if (g.current) g.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.45) * 0.75; });
  return <group ref={g}><AssetBoundary><Suspense fallback={null}><CreatureBody def={def} act={act} /></Suspense></AssetBoundary></group>;
}

export function CreaturePreview({ def, act }: { def: CreatureDef; act: string }) {
  const h = Math.max(1, def.size);
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [h * 1.4, h * 1.1, h * 2.6], fov: 38 }} onCreated={({ camera }) => camera.lookAt(0, h * 0.45, 0)}>
      <color attach="background" args={['#cfe9ff']} />
      <hemisphereLight args={['#ffffff', '#5aa84c', 1.5]} />
      <directionalLight position={[4, 8, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[h * 4, 48]} /><meshLambertMaterial color="#8fcf60" /></mesh>
      <Turntable key={def.slug + (def.model?.url ?? '') + (def.art?.url ?? '') + def.size} def={def} act={act as CreatureAct} />
      {/* escala: um Companion de 1 m */}
      <mesh position={[-Math.max(0.9, def.size * 0.8) - 0.3, 0.5, 0]}><capsuleGeometry args={[0.28, 0.44, 6, 14]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.28} depthWrite={false} /></mesh>
    </Canvas>
  );
}
