/** Peças do Refúgio que surgem conforme o Companion cresce (reaproveitadas do Refúgio fechado). */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const RNG = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Faz uma peça "surgir": cresce do chão com um leve exagero quando aparece. */
export function Grow({ children, position, rotation = 0, scale = 1 }: { children: React.ReactNode; position?: [number, number, number]; rotation?: number; scale?: number }) {
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

export function Crystals({ color }: { color: string }) {
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

export function Nest() {
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

export function Cauldron() {
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
export function ElementFeature({ element }: { element: string }) {
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
export function Shockwave({ burstKey, color }: { burstKey: number; color: string }) {
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

export function Bookshelf({ position, rotation = 0, seed }: { position: [number, number, number]; rotation?: number; seed: number }) {
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

export function Plant({ position, scale = 1, seed }: { position: [number, number, number]; scale?: number; seed: number }) {
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

export function Lantern({ position, seed }: { position: [number, number, number]; seed: number }) {
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

