/**
 * O Refúgio é uma clareira escondida, cercada de pedras e árvores (portada do lab "Clareira do Refúgio").
 * Nasce só com o altar e o círculo mágico; as peças surgem conforme o Companion cresce (refugeFeatures).
 * A passagem na muralha de pedra — a "janela para o mundo" — só abre depois do primeiro sonho.
 * Visual: fantasia clara, materiais originais dos modelos (sem o filtro anime), dia e noite pelo relógio do jogo.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, TiltShift2, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { gameTime, REFUGE_BIOME, type BiomeConfig, type IdentityContractV1, type RefugeFeatures } from '@rules';
import type { CompanionModelFiles } from '../backend/types';
import { ParticleCore } from './ParticleCore';
import { FirstForm } from './FirstForm';
import { CompanionModel } from './CompanionModel';
import { runeTexture } from './textures';
import { Shockwave } from './pieces';
import { makeWorld, companionFocus, colliders, type WorldShape } from './world';
import { Terrain, Cliffs, GrassBlades, BiomeVegetation, Sky, Motes, CameraRig, WindClock, ClickMarker } from './Biome';
import { SpeechBubble } from './SpeechBubble';
import type { AppendageSpec } from './Appendages';

export interface RefugeProps {
  color: string;
  glow: string;
  element?: string;
  energy: number; // 0..1, cresce com o vínculo
  pulseKey: number;
  /** Conquistas grandes: onda de luz saindo do altar. */
  burstKey?: number;
  features?: RefugeFeatures;
  contract: IdentityContractV1 | null;
  /** Última fala do Companion: aparece num balão sobre a cabeça. */
  speech?: string | null;
  /** Modelo 3D aprovado na Fábrica, com as animações. */
  model?: CompanionModelFiles;
  /** Seed da clareira (cada Companion tem a sua). */
  seed: number;
  /** Bioma do Refúgio (vem do Estúdio quando publicado; senão, o de fábrica). */
  biome?: BiomeConfig;
  quality: 'high' | 'low';
  /** cauda e asas da classe (desenhadas por código) */
  appendages?: AppendageSpec | null;
}

// ---------------------------------------------------------------------------
// Altar, fogueira, lanternas
// ---------------------------------------------------------------------------

function Altar({ runeColor }: { runeColor: string }) {
  const runes = useMemo(runeTexture, []);
  const ring = useRef<THREE.Mesh>(null);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame((s, dt) => {
    if (!ring.current) return;
    ring.current.rotation.z += dt * 0.05;
    (ring.current.material as THREE.MeshBasicMaterial).color.lerp(tint.set(runeColor).multiplyScalar(1.5 + Math.sin(s.clock.elapsedTime * 1.5) * 0.3), Math.min(1, dt * 1.5));
  });
  return (
    <group>
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.9, 2.1, 0.16, 48]} />
        <meshLambertMaterial color="#d9cfe8" />
      </mesh>
      <mesh position={[0, 0.16, 0]} receiveShadow>
        <cylinderGeometry args={[1.75, 1.85, 0.06, 48]} />
        <meshLambertMaterial color="#c4b8da" />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <circleGeometry args={[1.7, 64]} />
        <meshBasicMaterial map={runes} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Campfire({ world, night }: { world: WorldShape; night: number }) {
  const pos: [number, number, number] = [3.4, world.heightAt(3.4, -2.2), -2.2];
  useEffect(() => { colliders.set('campfire', [{ x: 3.4, z: -2.2, r: 0.72 }]); return () => { colliders.delete('campfire'); }; }, []);
  const flames = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const embers = useRef<THREE.Points>(null);
  const emberGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)); return g; }, []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    flames.current?.children.forEach((m, i) => { const k = 1 + Math.sin(t * 13 + i * 1.7) * 0.14; m.scale.set(0.22 * (2 - k), 0.55 * k, 0.22 * (2 - k)); });
    if (light.current) light.current.intensity = (1.6 + night * 2.2) * (0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.06);
    const p = emberGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const l = (t * 0.5 + i / p.count) % 1, a = i * 2.4 + t * 0.6; p.setXYZ(i, Math.cos(a) * (0.12 + l * 0.4), 0.3 + l * 2.2, Math.sin(a) * (0.12 + l * 0.4)); }
    p.needsUpdate = true;
  });
  return (
    <group position={pos}>
      {Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5]} scale={[0.17, 0.13, 0.17]} castShadow><dodecahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#b3a8d2" flatShading /></mesh>; })}
      {[0, 1, 2].map((i) => <mesh key={i} position={[Math.sin(i * 2.09) * -0.3, 0.1, Math.cos(i * 2.09) * -0.3]} rotation={[Math.PI / 2 - 0.35, i * 2.09, 0]}><cylinderGeometry args={[0.06, 0.08, 0.7, 6]} /><meshLambertMaterial color="#93653f" /></mesh>)}
      <group ref={flames} position={[0, 0.3, 0]}>
        {['#fff3c4', '#ffc35a', '#ff8a3d'].map((c, i) => <mesh key={i} position={[(i - 1) * 0.08, 0, 0]}><coneGeometry args={[1, 1, 8]} /><meshBasicMaterial color={c} transparent opacity={0.85 - i * 0.15} toneMapped={false} depthWrite={false} /></mesh>)}
      </group>
      <points ref={embers} geometry={emberGeo}><pointsMaterial size={0.06} color="#ffc070" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
      <pointLight ref={light} position={[0, 1.1, 0]} color="#ffa25a" distance={10} decay={1.6} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Céu, partículas mágicas e câmera
// ---------------------------------------------------------------------------

/** Sem corpo andando, a câmera volta para o altar. */
function FocusAltar() { useFrame(() => { companionFocus.lerp(ZERO, 0.1); }); return null; }
const ZERO = new THREE.Vector3();

// ---------------------------------------------------------------------------

const BARE: RefugeFeatures = { lanterns: 0, crystals: false, shelves: 0, element: null, nest: false, window: false, plants: 0, cauldron: false, walls: 0.25 };

export function Refuge(props: RefugeProps) {
  const high = props.quality === 'high';
  const f = props.features ?? BARE;
  const biome = props.biome ?? REFUGE_BIOME;
  const world = useMemo(() => makeWorld(props.seed, f.window), [props.seed, f.window]);
  const [daylight, setDaylight] = useState(() => gameTime(Date.now()).daylight);
  useEffect(() => { const t = setInterval(() => setDaylight(gameTime(Date.now()).daylight), 60_000); return () => clearInterval(t); }, []);
  const night = 1 - daylight;
  const [modelFailed, setModelFailed] = useState(false);
  const onFail = useMemo(() => () => setModelFailed(true), []);
  return (
    <Canvas
      shadows={high}
      dpr={high ? [1, 1.75] : [0.75, 1]}
      camera={{ position: [0, 9, 13], fov: 34, near: 0.3, far: 140 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}
    >
      <Sky daylight={daylight} palette={biome.palette} />
      <WindClock />
      <CameraRig />
      <Terrain world={world} palette={biome.palette} walkable={!!props.model && !modelFailed} />
      <ClickMarker world={world} />
      {biome.settings.cliffs && <Cliffs world={world} quality={props.quality} palette={biome.palette} />}
      <GrassBlades world={world} count={Math.round((high ? 2200 : 900) * biome.settings.grassBlades)} palette={biome.palette} />
      <BiomeVegetation biome={biome} world={world} quality={props.quality} />
      <Altar runeColor={props.color} />
      {/* a clareira fica limpa: só a base do altar e a fogueira (as outras peças voltam quando o mundo pedir) */}
      <Campfire world={world} night={night} />
      <Motes world={world} night={night} amount={0.4 + f.walls * 0.6} />
      <Shockwave burstKey={props.burstKey ?? 0} color={props.glow} />
      {props.model && !modelFailed ? (
        <Suspense fallback={null}><CompanionModel files={props.model} world={world} burstKey={props.burstKey ?? 0} speech={props.speech ?? null} onFail={onFail} appendages={props.appendages} /></Suspense>
      ) : (
        <>
          {/* sem modelo aprovado: o núcleo (ou o corpo de partículas) no altar; a imagem de referência vai para o retrato */}
          {props.contract
            ? <FirstForm contract={props.contract} pulseKey={props.pulseKey} />
            : <ParticleCore color={props.color} glow={props.glow} element={props.element} energy={props.energy} pulseKey={props.pulseKey} count={high ? 1600 : 800} />}
          <SpeechBubble text={props.speech ?? null} position={[0, 2.5, 0]} />
          <FocusAltar />
        </>
      )}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={0.55 + night * 0.45} luminanceThreshold={0.78 - night * 0.12} luminanceSmoothing={0.2} />
        <TiltShift2 blur={high ? 0.12 : 0.06} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} />
        <Vignette offset={0.3} darkness={0.35} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
