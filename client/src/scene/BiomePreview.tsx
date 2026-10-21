/** Prévia 3D de um bioma no Estúdio: a mesma clareira do jogo, sem o Companion. */
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { sanitizeBiome, type BiomeConfig } from '@rules';
import { makeWorld } from './world';
import { Terrain, Cliffs, GrassBlades, BiomeVegetation, Sky, Motes, CameraRig, WindClock, Ambient } from './Biome';

export function BiomePreview({ biome, daylight, seed, open }: { biome: BiomeConfig; daylight: number; seed: number; open: boolean }) {
  const world = useMemo(() => makeWorld(seed, open), [seed, open]);
  const b = useMemo(() => sanitizeBiome(biome), [biome]);
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 9, 13], fov: 34, near: 0.3, far: 140 }} gl={{ antialias: true }} onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; }}>
      <Sky daylight={daylight} palette={b.palette} />
      <WindClock />
      <CameraRig />
      <Terrain world={world} palette={b.palette} />
      {b.settings.cliffs && <Cliffs world={world} quality="high" palette={b.palette} />}
      <GrassBlades world={world} count={Math.round(2200 * b.settings.grassBlades)} palette={b.palette} />
      <BiomeVegetation biome={b} world={world} quality="high" />
      {b.settings.ambient === 'fireflies' || b.settings.ambient === 'none' ? <Motes world={world} night={1 - daylight} amount={b.settings.ambient === 'none' ? 0.3 : 0.8} /> : <Ambient kind={b.settings.ambient} world={world} />}
    </Canvas>
  );
}
