import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Índice do comportamento por elemento (afeta o movimento das partículas). */
const ELEMENT_MODE: Record<string, number> = { fogo: 1, agua: 2, vento: 3, terra: 4, luz: 5, sombra: 6, gelo: 7, raio: 8, natureza: 9 };

const vertex = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uPulse;
uniform float uMode;
uniform float uSpread;
attribute vec4 aSeed;
varying float vR;
varying float vTw;

vec3 orbit(vec4 s, float t) {
  float r = (0.18 + s.x * 0.55) * uSpread * (1.0 + uPulse * 0.9);
  float th = s.y * 6.2831 + t * (0.25 + s.z * 0.9);
  float ph = acos(2.0 * s.w - 1.0) + sin(t * 0.7 + s.x * 9.0) * 0.25;
  vec3 p = vec3(r * sin(ph) * cos(th), r * cos(ph), r * sin(ph) * sin(th));
  if (uMode == 1.0) {           // fogo: sobe e reinicia
    float h = fract(s.z + t * (0.25 + s.x * 0.3));
    p.y += h * 0.9 - 0.2; p.xz *= 1.0 - h * 0.6;
  } else if (uMode == 2.0) {    // água: ondas
    p.y += sin(th * 3.0 + t * 1.5) * 0.08;
  } else if (uMode == 3.0) {    // vento: redemoinho achatado
    p.y *= 0.45; p.xz *= 1.25;
  } else if (uMode == 4.0) {    // terra: órbitas lentas e pesadas
    p *= 0.85;
  } else if (uMode == 6.0) {    // sombra: pulsar para dentro
    p *= 0.8 + 0.25 * sin(t * 1.3 + s.y * 6.0);
  } else if (uMode == 8.0) {    // raio: saltos
    p += normalize(p + 0.001) * step(0.97, fract(t * 2.0 + s.w)) * 0.25;
  } else if (uMode == 9.0) {    // natureza: espiral ascendente
    p.y += sin(th * 0.5) * 0.15;
  }
  return p;
}

void main() {
  vec3 p = orbit(aSeed, uTime);
  vR = length(p) / (0.75 * uSpread);
  vTw = 0.6 + 0.4 * sin(uTime * (2.0 + aSeed.w * 4.0) + aSeed.y * 30.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.5 + aSeed.x * 1.6) * (0.75 + uEnergy * 0.6) * (1.0 + uPulse);
  gl_PointSize = size * 38.0 / -mv.z;
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uPulse;
varying float vR;
varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  vec3 col = mix(vec3(1.0, 0.98, 0.92), uColor, smoothstep(0.05, 0.55, vR));
  col = mix(col, uGlow, smoothstep(0.6, 1.1, vR) * 0.7);
  col *= 1.3 + uPulse * 2.0;
  gl_FragColor = vec4(col, a * vTw);
}
`;

export function ParticleCore({ color, glow, element, energy, pulseKey, count = 1400, spread = 1, position = [0, 1.25, 0] as [number, number, number], showCore = true }: {
  color: string; glow: string; element?: string; energy: number; pulseKey: number; count?: number; spread?: number; position?: [number, number, number]; showCore?: boolean;
}) {
  const points = useRef<THREE.Points>(null);
  const core = useRef<THREE.Mesh>(null);
  const pulse = useRef({ key: pulseKey, value: 0 });

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    return g;
  }, [count]);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uEnergy: { value: energy }, uPulse: { value: 0 }, uMode: { value: 0 }, uSpread: { value: spread },
      uColor: { value: new THREE.Color(color) }, uGlow: { value: new THREE.Color(glow) },
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const target = useMemo(() => ({ c: new THREE.Color(), g: new THREE.Color() }), []);

  useFrame((state, dt) => {
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    if (pulse.current.key !== pulseKey) pulse.current = { key: pulseKey, value: 1 };
    pulse.current.value = Math.max(0, pulse.current.value - dt * 0.45);
    u.uPulse.value = pulse.current.value * pulse.current.value;
    u.uEnergy.value += (energy - u.uEnergy.value) * Math.min(1, dt * 2);
    u.uMode.value = element ? ELEMENT_MODE[element] ?? 0 : 0;
    u.uSpread.value = spread;
    // a cor muda devagar — é a "alma" ganhando tom
    (u.uColor.value as THREE.Color).lerp(target.c.set(color), Math.min(1, dt * 1.2));
    (u.uGlow.value as THREE.Color).lerp(target.g.set(glow), Math.min(1, dt * 1.2));
    if (points.current) points.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.2) * 0.06;
    if (core.current) {
      core.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.2) * 0.06;
      const s = 0.13 + 0.015 * Math.sin(state.clock.elapsedTime * 2.4) + pulse.current.value * 0.12;
      core.current.scale.setScalar(s * spread);
      (core.current.material as THREE.MeshBasicMaterial).color.copy(u.uColor.value as THREE.Color).multiplyScalar(2.2);
    }
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      <points ref={points} geometry={geo} material={mat} position={[0, position[1], 0]} frustumCulled={false} />
      <mesh ref={core} position={[0, position[1], 0]} visible={showCore}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      <pointLight position={[0, position[1], 0]} color={color} intensity={2.2 + energy * 3} distance={5.5} decay={1.6} />
    </group>
  );
}
