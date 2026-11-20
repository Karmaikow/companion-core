/**
 * O Companion em 3D no livro do Inventário: o modelo do jogo com as peças equipadas (arma na mão, escudo, chapéu...),
 * parado em pé sobre o pergaminho. Arraste para girar. Fundo transparente; só existe enquanto o livro está aberto.
 */
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { EquipSlot, ItemDef } from '@rules';
import { AssetBoundary } from './Biome';
import { TrainingModel } from './TrainingModel';

export default function CompanionStage({ url, anims, companionId, items, slots }: { url: string; anims?: { url: string; kind: string; name: string }[]; companionId: string; items: ItemDef[]; slots?: Record<string, EquipSlot> }) {
  return (
    <Canvas dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0.78, 2.05], fov: 34 }} onCreated={({ camera }) => camera.lookAt(0, 0.6, 0)}>
      <hemisphereLight args={['#fff8ec', '#b48a5a', 1.6]} />
      <directionalLight position={[2, 4, 3]} intensity={1.5} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#ffd9a8" />
      <OrbitControls makeDefault target={[0, 0.6, 0]} enablePan={false} enableZoom={false} enableDamping dampingFactor={0.12} minPolarAngle={Math.PI * 0.32} maxPolarAngle={Math.PI * 0.55} />
      <AssetBoundary><Suspense fallback={null}><TrainingModel url={url} anims={anims} cue={null} items={items} equipSlots={slots} modelKey={companionId} companionId={companionId} /></Suspense></AssetBoundary>
    </Canvas>
  );
}
