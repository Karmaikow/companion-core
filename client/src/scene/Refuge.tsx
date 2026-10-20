import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, TiltShift2, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { gameTime, type IdentityContractV1 } from '@rules';
import { ParticleCore } from './ParticleCore';
import { FirstForm } from './FirstForm';
import { woodTexture, stoneTexture, runeTexture } from './textures';

export interface RefugeProps {
  color: string;
  glow: string;
  element?: string;
  energy: number; // 0..1, cresce com o vínculo
  pulseKey: number;
  contract: IdentityContractV1 | null;
  quality: 'high' | 'low';
}

const RNG = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------------------------------------------------------------------

function Floor({ runeColor }: { runeColor: string }) {
  const wood = useMemo(woodTexture, []);
  const runes = useMemo(runeTexture, []);
  const ring = useRef<THREE.Mesh>(null);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame((s, dt) => {
    if (!ring.current) return;
    ring.current.rotation.z += dt * 0.05;
    const m = ring.current.material as THREE.MeshBasicMaterial;
    m.color.lerp(tint.set(runeColor).multiplyScalar(1.6 + Math.sin(s.clock.elapsedTime * 1.5) * 0.3), Math.min(1, dt * 1.5));
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial map={wood} roughness={0.8} color="#e8c9a8" />
      </mesh>
      {/* estrado de pedra do círculo */}
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <cylinderGeometry args={[1.9, 2.05, 0.12, 48]} />
        <meshStandardMaterial color="#5b5d78" roughness={0.7} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.125, 0]}>
        <circleGeometry args={[1.8, 64]} />
        <meshBasicMaterial map={runes} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* tapete */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.6, 0.01, 1.6]}>
        <circleGeometry args={[1.1, 32]} />
        <meshStandardMaterial color="#7a2f3b" roughness={1} />
      </mesh>
    </group>
  );
}

function Walls() {
  const stone = useMemo(stoneTexture, []);
  return (
    <group>
      <mesh position={[0, 2.6, 0]} receiveShadow>
        <cylinderGeometry args={[7.2, 7.2, 5.2, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8]} />
        <meshStandardMaterial map={stone} side={THREE.BackSide} roughness={0.95} color="#c9c3e6" />
      </mesh>
    </group>
  );
}

function Bookshelf({ position, rotation = 0, seed }: { position: [number, number, number]; rotation?: number; seed: number }) {
  const books = useMemo(() => {
    const r = RNG(seed);
    const out: { p: [number, number, number]; s: [number, number, number]; c: string }[] = [];
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -0.72;
      while (x < 0.68) {
        const w = 0.07 + r() * 0.07, h = 0.3 + r() * 0.16;
        if (r() > 0.1) out.push({ p: [x + w / 2, 0.22 + shelf * 0.55 + h / 2, 0], s: [w, h, 0.26], c: `hsl(${Math.floor(r() * 360)}, ${35 + r() * 30}%, ${30 + r() * 25}%)` });
        x += w + 0.01;
      }
    }
    return out;
  }, [seed]);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.15, -0.12]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 2.3, 0.08]} />
        <meshStandardMaterial color="#4a2c1d" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, 0.2 + i * 0.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.05, 0.36]} />
          <meshStandardMaterial color="#5c3624" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.85, 1.15, 0]} castShadow>
          <boxGeometry args={[0.07, 2.3, 0.38]} />
          <meshStandardMaterial color="#4a2c1d" />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={b.p} castShadow>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color={b.c} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Plant({ position, scale = 1, seed }: { position: [number, number, number]; scale?: number; seed: number }) {
  const leaves = useMemo(() => {
    const r = RNG(seed);
    return Array.from({ length: 9 }, () => ({ p: [(r() - 0.5) * 0.5, 0.45 + r() * 0.55, (r() - 0.5) * 0.5] as [number, number, number], s: 0.18 + r() * 0.16, c: `hsl(${95 + r() * 40}, ${40 + r() * 25}%, ${26 + r() * 16}%)` }));
  }, [seed]);
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.34, 12]} />
        <meshStandardMaterial color="#9a5a3a" />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.p} castShadow>
          <icosahedronGeometry args={[l.s, 0]} />
          <meshStandardMaterial color={l.c} flatShading roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Lantern({ position, seed }: { position: [number, number, number]; seed: number }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime + seed;
    if (light.current) light.current.intensity = 4.2 + Math.sin(t * 7.1) * 0.25 + Math.sin(t * 13.3) * 0.15;
  });
  return (
    <group position={position}>
      <mesh>
        <octahedronGeometry args={[0.11, 0]} />
        <meshBasicMaterial color="#ffd38a" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <coneGeometry args={[0.14, 0.12, 4]} />
        <meshStandardMaterial color="#2b1d14" metalness={0.5} />
      </mesh>
      <pointLight ref={light} color="#ffb766" distance={7} decay={1.4} />
    </group>
  );
}

function Waterfall() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(float x){ return fract(sin(x*91.7)*43758.5); }
      void main(){
        float col = floor(vUv.x*24.0);
        float s = fract(vUv.y*3.0 + uTime*(0.9 + h(col)*0.8) + h(col+3.0));
        float streak = smoothstep(0.0, 0.4, s) * smoothstep(1.0, 0.6, s);
        vec3 c = mix(vec3(0.35,0.7,0.95), vec3(0.9,1.0,1.0), streak);
        float edge = smoothstep(0.0,0.12,vUv.x) * smoothstep(1.0,0.88,vUv.x);
        gl_FragColor = vec4(c*1.25, (0.55 + streak*0.4) * edge);
      }`,
  }), []);
  useFrame((s) => { mat.uniforms.uTime.value = s.clock.elapsedTime; });
  return (
    <group position={[-4.3, 0, -4.4]} rotation={[0, 0.6, 0]}>
      <mesh position={[0, 2.4, 0]} material={mat}>
        <planeGeometry args={[1.4, 4.8]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0.7]}>
        <circleGeometry args={[1.3, 32]} />
        <meshStandardMaterial color="#2a6f9a" roughness={0.1} metalness={0.3} emissive="#123b55" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.1, 1.0, 0.2]} castShadow>
          <dodecahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color="#5d6371" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Window({ daylight }: { daylight: number }) {
  const day = new THREE.Color('#bfe3ff'), night = new THREE.Color('#2b3a7a');
  const c = night.clone().lerp(day, daylight);
  return (
    <group position={[3.0, 2.7, -6.2]} rotation={[0, -0.45, 0]}>
      <mesh>
        <planeGeometry args={[1.6, 2.4]} />
        <meshBasicMaterial color={c.clone().multiplyScalar(1.3)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[0.06, 2.4, 0.04]} />
        <meshStandardMaterial color="#3a2618" />
      </mesh>
      <mesh position={[0, 0.2, 0.02]}>
        <boxGeometry args={[1.6, 0.06, 0.04]} />
        <meshStandardMaterial color="#3a2618" />
      </mesh>
      <spotLight position={[0, 0, 0.5]} target-position={[-2, -2.7, 4]} color={c} intensity={6 + daylight * 30} angle={0.6} penumbra={0.8} distance={12} castShadow />
    </group>
  );
}

function Dust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const r = RNG(99);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = (r() - 0.5) * 12; pos[i * 3 + 1] = r() * 4.5; pos[i * 3 + 2] = (r() - 0.5) * 10; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  useFrame((s) => { if (ref.current) { ref.current.rotation.y = s.clock.elapsedTime * 0.01; ref.current.position.y = Math.sin(s.clock.elapsedTime * 0.2) * 0.2; } });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.035} color="#ffe2a8" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function CameraRig() {
  const { camera, size } = useThree();
  const portrait = size.height > size.width;
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const px = s.pointer.x * 0.35, py = s.pointer.y * 0.15;
    const base = portrait ? new THREE.Vector3(0, 7.8, 15.5) : new THREE.Vector3(0, 5.0, 9.2);
    camera.position.lerp(base.add(new THREE.Vector3(Math.sin(t * 0.07) * 0.4 + px, py, 0)), 0.04);
    camera.lookAt(0, portrait ? -0.7 : 1.15, 0);
  });
  return null;
}

// ---------------------------------------------------------------------------

export function Refuge(props: RefugeProps) {
  const daylight = gameTime(Date.now()).daylight;
  const high = props.quality === 'high';
  return (
    <Canvas
      shadows={high}
      dpr={high ? [1, 1.75] : [0.75, 1]}
      camera={{ position: [0, 5, 9.2], fov: 32, near: 0.1, far: 60 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}
    >
      <color attach="background" args={['#120f1c']} />
      <fog attach="fog" args={['#1a1428', 10, 22]} />
      <ambientLight intensity={0.5 + daylight * 0.3} color="#a49ad6" />
      <hemisphereLight args={['#8d9be0', '#5a3a22', 0.9]} />
      <CameraRig />
      <Floor runeColor={props.color} />
      <Walls />
      <Bookshelf position={[-1.6, 0, -5.6]} rotation={0.15} seed={3} />
      <Bookshelf position={[5.0, 0, -3.0]} rotation={-0.95} seed={8} />
      <Bookshelf position={[0.6, 0, -5.9]} rotation={0} seed={21} />
      <Plant position={[-1.6, 0, -4.9]} seed={1} scale={1.3} />
      <Plant position={[2.4, 0, -5.4]} seed={5} scale={1.6} />
      <Plant position={[-5.6, 0, 0.3]} seed={9} scale={1.4} />
      <Plant position={[5.4, 0, -1.5]} seed={13} scale={1.8} />
      <Plant position={[3.2, 0, 2.6]} seed={17} />
      <Lantern position={[-2.2, 2.9, -4.8]} seed={1} />
      <Lantern position={[1.9, 3.1, -5.4]} seed={2} />
      <Lantern position={[-4.9, 2.6, -1.4]} seed={3} />
      <Lantern position={[4.6, 2.4, -0.6]} seed={4} />
      <Waterfall />
      <Window daylight={daylight} />
      <Dust count={high ? 260 : 120} />
      {props.contract ? (
        <FirstForm contract={props.contract} pulseKey={props.pulseKey} />
      ) : (
        <ParticleCore color={props.color} glow={props.glow} element={props.element} energy={props.energy} pulseKey={props.pulseKey} count={high ? 1600 : 800} />
      )}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.62} luminanceSmoothing={0.2} />
        <TiltShift2 blur={high ? 0.18 : 0.1} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} />
        <Vignette offset={0.25} darkness={0.75} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
