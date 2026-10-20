import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, TiltShift2, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { gameTime, type IdentityContractV1, type RefugeFeatures } from '@rules';
import { ParticleCore } from './ParticleCore';
import { FirstForm } from './FirstForm';
import { woodTexture, stoneTexture, runeTexture } from './textures';

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
    </group>
  );
}

function Walls({ light }: { light: number }) {
  const stone = useMemo(stoneTexture, []);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const target = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    // o Refúgio "acende" devagar conforme cresce
    mat.current?.color.lerp(target.set('#c9c3e6').multiplyScalar(0.35 + light * 0.65), Math.min(1, dt * 0.8));
  });
  return (
    <group>
      <mesh position={[0, 2.6, 0]} receiveShadow>
        <cylinderGeometry args={[7.2, 7.2, 5.2, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8]} />
        <meshStandardMaterial ref={mat} map={stone} side={THREE.BackSide} roughness={0.95} color="#5a5770" />
      </mesh>
    </group>
  );
}

/** Faz uma peça "surgir": cresce do chão com um leve exagero quando aparece. */
function Grow({ children, position, rotation = 0, scale = 1 }: { children: React.ReactNode; position?: [number, number, number]; rotation?: number; scale?: number }) {
  const g = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!g.current || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt * 0.9);
    const x = t.current;
    const back = 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2); // ease-out-back
    g.current.scale.setScalar(Math.max(0.001, back) * scale);
  });
  return <group ref={g} position={position} rotation={[0, rotation, 0]} scale={0.001}>{children}</group>;
}

function Crystals({ color }: { color: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => { if (g.current) g.current.rotation.y = s.clock.elapsedTime * 0.08; });
  return (
    <group ref={g}>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        return (
          <mesh key={i} position={[Math.cos(a) * 2.35, 0.32 + (i % 2) * 0.1, Math.sin(a) * 2.35]} rotation={[0.15 * (i % 3), a, 0.2]} castShadow>
            <octahedronGeometry args={[0.13 + (i % 2) * 0.05, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.2} flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

function Nest() {
  return (
    <group position={[2.7, 0, 1.4]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[1.15, 32]} />
        <meshStandardMaterial color="#7a2f3b" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <ringGeometry args={[0.95, 1.05, 32]} />
        <meshStandardMaterial color="#d6b06a" roughness={1} />
      </mesh>
      {[[-0.4, 0.1, '#d98a5c'], [0.45, -0.25, '#6a8fd9']].map(([x, z, c], i) => (
        <mesh key={i} position={[x as number, 0.16, z as number]} scale={[1, 0.55, 1]} castShadow>
          <sphereGeometry args={[0.32, 16, 12]} />
          <meshStandardMaterial color={c as string} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function Cauldron() {
  const steam = useRef<THREE.Group>(null);
  useFrame((s) => {
    steam.current?.children.forEach((m, i) => {
      const t = (s.clock.elapsedTime * 0.5 + i * 0.33) % 1;
      m.position.set(Math.sin(t * 6 + i) * 0.08, 0.75 + t * 0.9, 0);
      m.scale.setScalar(0.08 + t * 0.14);
      ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
    });
  });
  return (
    <group position={[-2.9, 0, 1.6]}>
      <mesh position={[0, 0.38, 0]} castShadow>
        <sphereGeometry args={[0.42, 20, 14, 0, Math.PI * 2, 0.35, Math.PI * 0.75]} />
        <meshStandardMaterial color="#26262e" metalness={0.6} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.36, 20]} />
        <meshBasicMaterial color="#8de08a" toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.9, 0]} color="#8de08a" intensity={1.5} distance={3} />
      <group ref={steam}>{[0, 1, 2].map((i) => <mesh key={i}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#dfffe0" transparent opacity={0.4} depthWrite={false} /></mesh>)}</group>
    </group>
  );
}

/** Peça do Refúgio que materializa a essência do Companion. */
function ElementFeature({ element }: { element: string }) {
  if (element === 'agua') return <Waterfall />;
  if (element === 'fogo') return <Hearth />;
  if (element === 'luz') return <Skylight color="#fff1a8" />;
  if (element === 'sombra') return <Skylight color="#a07cff" moon />;
  if (element === 'vento') return <WindChimes />;
  if (element === 'raio') return <StormOrb />;
  if (element === 'gelo') return <CrystalCluster color="#bfe9ff" position={[-4.2, 0, -3.6]} />;
  if (element === 'terra') return <CrystalCluster color="#c8a26b" position={[-4.2, 0, -3.6]} rock />;
  return <GlowFlowers />; // natureza
}

function Hearth() {
  const light = useRef<THREE.PointLight>(null);
  const flames = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (light.current) light.current.intensity = 5 + Math.sin(t * 9) * 0.8 + Math.sin(t * 17) * 0.4;
    flames.current?.children.forEach((m, i) => { m.scale.y = 1 + Math.sin(t * (7 + i) + i) * 0.25; });
  });
  return (
    <group position={[-4.3, 0, -3.9]} rotation={[0, 0.6, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.9, 1.0, 0.5, 10]} /><meshStandardMaterial color="#4b4554" flatShading /></mesh>
      <group ref={flames} position={[0, 0.5, 0]}>
        {[[0, 0.7, '#ffb347'], [0.25, 0.5, '#ff7a3d'], [-0.25, 0.5, '#ff7a3d']].map(([x, h, c], i) => (
          <mesh key={i} position={[x as number, (h as number) / 2, 0]}><coneGeometry args={[0.22, h as number, 8]} /><meshBasicMaterial color={c as string} toneMapped={false} /></mesh>
        ))}
      </group>
      <pointLight ref={light} position={[0, 1.2, 0]} color="#ff9a4d" distance={8} decay={1.4} />
    </group>
  );
}

function Skylight({ color, moon = false }: { color: string; moon?: boolean }) {
  const beam = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.045 + Math.sin(s.clock.elapsedTime * 0.8) * 0.015; });
  return (
    <group>
      <mesh ref={beam} position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.7, 1.7, 6.4, 24, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {moon && <mesh position={[-3.6, 3.6, -5.6]}><circleGeometry args={[0.6, 32]} /><meshBasicMaterial color="#e8e0ff" toneMapped={false} /></mesh>}
      <spotLight position={[0, 7, 0]} color={color} intensity={9} angle={0.3} penumbra={0.7} distance={10} />
    </group>
  );
}

function WindChimes() {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => g.current?.children.forEach((m, i) => { m.rotation.z = Math.sin(s.clock.elapsedTime * 1.6 + i) * 0.18; }));
  return (
    <group ref={g} position={[-3.8, 3.3, -3.4]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} position={[(i - 2) * 0.22, 0, 0]}>
          <mesh position={[0, -0.35 - (i % 2) * 0.15, 0]}><cylinderGeometry args={[0.035, 0.035, 0.55 + (i % 3) * 0.15, 8]} /><meshStandardMaterial color="#9ff0d8" metalness={0.8} roughness={0.2} emissive="#2f6b5c" /></mesh>
        </group>
      ))}
    </group>
  );
}

function StormOrb() {
  const orb = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    const flash = Math.random() > 0.97 ? 1 : 0;
    if (light.current) light.current.intensity = 1.5 + flash * 6;
    if (orb.current) orb.current.rotation.y = s.clock.elapsedTime;
  });
  return (
    <group position={[-4.0, 1.6, -3.6]}>
      <mesh ref={orb}><icosahedronGeometry args={[0.45, 1]} /><meshBasicMaterial color="#ffe14d" wireframe toneMapped={false} /></mesh>
      <mesh><sphereGeometry args={[0.22, 16, 12]} /><meshBasicMaterial color="#fff6b0" toneMapped={false} /></mesh>
      <mesh position={[0, -0.95, 0]}><cylinderGeometry args={[0.35, 0.5, 0.7, 8]} /><meshStandardMaterial color="#4b4554" flatShading /></mesh>
      <pointLight ref={light} color="#ffe14d" distance={6} />
    </group>
  );
}

function CrystalCluster({ color, position, rock = false }: { color: string; position: [number, number, number]; rock?: boolean }) {
  return (
    <group position={position}>
      {rock && <mesh position={[0, 0.35, 0]} castShadow><dodecahedronGeometry args={[0.8, 0]} /><meshStandardMaterial color="#6b5a48" flatShading /></mesh>}
      {[[0, 1.0, 0, 0.5], [0.45, 0.7, 0.2, 0.32], [-0.4, 0.65, -0.1, 0.35], [0.1, 0.55, -0.45, 0.28]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0.2 * i, i, 0.3]} castShadow>
          <octahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.15} flatShading transparent opacity={0.9} />
        </mesh>
      ))}
      <pointLight position={[0, 1.2, 0]} color={color} intensity={2} distance={5} />
    </group>
  );
}

function GlowFlowers() {
  return (
    <group position={[-3.9, 0, -3.2]}>
      {Array.from({ length: 7 }, (_, i) => {
        const a = i * 0.9, r = 0.4 + (i % 3) * 0.35;
        return (
          <group key={i} position={[Math.cos(a) * r, 0, Math.sin(a) * r]}>
            <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.5, 5]} /><meshStandardMaterial color="#3f7a3f" /></mesh>
            <mesh position={[0, 0.52, 0]}><sphereGeometry args={[0.09, 10, 8]} /><meshBasicMaterial color={i % 2 ? '#c8ff8a' : '#ffb3e6'} toneMapped={false} /></mesh>
          </group>
        );
      })}
      <pointLight position={[0, 0.8, 0]} color="#b6ff9a" intensity={1.6} distance={4} />
    </group>
  );
}

/** Onda de luz que sai do altar em conquistas grandes. */
function Shockwave({ burstKey, color }: { burstKey: number; color: string }) {
  const m = useRef<THREE.Mesh>(null);
  const st = useRef({ key: burstKey, t: 1 });
  useFrame((_, dt) => {
    if (st.current.key !== burstKey) st.current = { key: burstKey, t: 0 };
    st.current.t = Math.min(1, st.current.t + dt * 0.7);
    if (!m.current) return;
    const t = st.current.t;
    m.current.visible = t < 1;
    m.current.scale.setScalar(0.5 + t * 7);
    (m.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
  });
  return (
    <mesh ref={m} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} visible={false}>
      <ringGeometry args={[0.92, 1, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
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

const BARE: RefugeFeatures = { lanterns: 0, crystals: false, shelves: 0, element: null, nest: false, window: false, plants: 0, cauldron: false, walls: 0.25 };
const LANTERNS: [number, number, number][] = [[-2.2, 2.9, -4.8], [1.9, 3.1, -5.4], [-4.9, 2.6, -1.4], [4.6, 2.4, -0.6]];
const SHELVES: { p: [number, number, number]; r: number; seed: number }[] = [{ p: [0.6, 0, -5.9], r: 0, seed: 21 }, { p: [5.0, 0, -3.0], r: -0.95, seed: 8 }];
const PLANTS: { p: [number, number, number]; s: number; seed: number }[] = [
  { p: [2.4, 0, -5.4], s: 1.6, seed: 5 }, { p: [-1.6, 0, -4.9], s: 1.3, seed: 1 }, { p: [5.4, 0, -1.5], s: 1.8, seed: 13 }, { p: [-5.6, 0, 0.3], s: 1.4, seed: 9 }, { p: [3.2, 0, 2.6], s: 1, seed: 17 },
];

export function Refuge(props: RefugeProps) {
  const daylight = gameTime(Date.now()).daylight;
  const high = props.quality === 'high';
  const f = props.features ?? BARE;
  return (
    <Canvas
      shadows={high}
      dpr={high ? [1, 1.75] : [0.75, 1]}
      camera={{ position: [0, 5, 9.2], fov: 32, near: 0.1, far: 60 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}
    >
      <color attach="background" args={['#0e0c17']} />
      <fog attach="fog" args={['#15111f', 9, 20]} />
      <ambientLight intensity={0.3 + f.walls * 0.35 + daylight * 0.15} color="#a49ad6" />
      <hemisphereLight args={['#8d9be0', '#5a3a22', 0.35 + f.walls * 0.55]} />
      <CameraRig />
      <Floor runeColor={props.color} />
      <Walls light={f.walls} />
      {f.crystals && <Grow><Crystals color={props.color} /></Grow>}
      {SHELVES.slice(0, f.shelves).map((b) => <Grow key={b.seed} position={b.p} rotation={b.r}><Bookshelf position={[0, 0, 0]} seed={b.seed} /></Grow>)}
      {PLANTS.slice(0, f.plants).map((pl) => <Grow key={pl.seed} position={pl.p} scale={pl.s}><Plant position={[0, 0, 0]} seed={pl.seed} /></Grow>)}
      {LANTERNS.slice(0, f.lanterns).map((p, i) => <Grow key={i} position={p}><Lantern position={[0, 0, 0]} seed={i + 1} /></Grow>)}
      {f.element && <Grow key={f.element}><ElementFeature element={f.element} /></Grow>}
      {f.nest && <Grow><Nest /></Grow>}
      {f.cauldron && <Grow><Cauldron /></Grow>}
      {f.window && <Grow><Window daylight={daylight} /></Grow>}
      <Dust count={Math.round((high ? 260 : 120) * (0.35 + f.walls * 0.65))} />
      <Shockwave burstKey={props.burstKey ?? 0} color={props.glow} />
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
