/**
 * Corpo de partículas: depois do despertar e enquanto a arte final não chega,
 * as partículas do núcleo se organizam na silhueta da criatura (amostrada do desenho
 * procedural do contrato). Parte delas se desprende e volta — um corpo ainda se formando.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { IdentityContractV1 } from '@rules';
import { drawCompanion } from './companionSprite';

const vertex = /* glsl */ `
uniform float uTime;
uniform float uForm;
uniform float uPulse;
attribute vec3 aTarget;
attribute vec4 aSeed;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float drifter = step(0.9, aSeed.w);
  // começo: espalhadas numa esfera em volta do núcleo
  vec3 scatter = normalize(aSeed.xyz - 0.5 + 0.0001) * (0.25 + aSeed.w * 0.45);
  vec3 p = mix(scatter, aTarget, smoothstep(0.0, 1.0, uForm));
  // respiração e brilho
  p += vec3(sin(uTime * 1.3 + aSeed.x * 40.0), cos(uTime * 1.1 + aSeed.y * 40.0), sin(uTime * 0.9 + aSeed.z * 40.0)) * 0.012;
  p *= 1.0 + sin(uTime * 1.6) * 0.012 + uPulse * 0.08;
  // as que se desprendem: sobem e se afastam para um lado, depois voltam
  float ph = fract(uTime * (0.08 + aSeed.z * 0.1) + aSeed.y);
  p += drifter * uForm * vec3(ph * (0.6 + aSeed.x * 0.6), ph * 0.5, (aSeed.z - 0.5) * ph * 0.4);
  vAlpha = mix(1.0, 1.0 - ph, drifter) * (0.55 + 0.45 * sin(uTime * (2.0 + aSeed.w * 3.0) + aSeed.x * 20.0));
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.8 + aSeed.w * 1.2) * (1.0 + uPulse) * 34.0 / -mv.z;
}`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
uniform float uPulse;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  gl_FragColor = vec4(vColor * (1.35 + uPulse * 1.5), a);
}`;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

export function ParticleBody({ contract, pulseKey, count = 4200 }: { contract: IdentityContractV1; pulseKey: number; count?: number }) {
  const group = useRef<THREE.Group>(null);
  const pulse = useRef({ key: pulseKey, value: 0 });

  const geo = useMemo(() => {
    const SIZE = 160;
    const cv = drawCompanion(contract, SIZE);
    const img = cv.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
    const filled: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) if (img[i * 4 + 3] > 140) filled.push(i);
    const r = rng(contract.seed);
    const glow = new THREE.Color(contract.palette.glow);
    const target = new Float32Array(count * 3), seeds = new Float32Array(count * 4), colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const idx = filled.length ? filled[Math.floor(r() * filled.length)] : 0;
      const px = idx % SIZE, py = Math.floor(idx / SIZE);
      const x = (px / SIZE - 0.5) * 1.8, y = (0.5 - py / SIZE) * 1.8;
      target.set([x + (r() - 0.5) * 0.012, y + (r() - 0.5) * 0.012, (r() - 0.5) * 0.14 * Math.cos(x * 1.4)], k * 3);
      seeds.set([r(), r(), r(), r()], k * 4);
      c.setRGB(img[idx * 4] / 255, img[idx * 4 + 1] / 255, img[idx * 4 + 2] / 255, THREE.SRGBColorSpace).lerp(glow, 0.25 + r() * 0.2);
      colors.set([c.r, c.g, c.b], k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    return g;
  }, [contract, count]);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uForm: { value: 0 }, uPulse: { value: 0 } },
  }), []);

  useFrame((state, dt) => {
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uForm.value = Math.min(1, u.uForm.value + dt * 0.35); // ~3 s para o corpo se formar
    if (pulse.current.key !== pulseKey) pulse.current = { key: pulseKey, value: 1 };
    pulse.current.value = Math.max(0, pulse.current.value - dt * 0.5);
    u.uPulse.value = pulse.current.value ** 2;
    if (group.current) {
      group.current.quaternion.copy(state.camera.quaternion); // silhueta sempre de frente (HD-2D)
      group.current.position.y = 1.0 + Math.sin(state.clock.elapsedTime * 1.2) * 0.05;
    }
  });

  return (
    <group>
      <group ref={group} position={[0, 1.0, 0]}>
        <points geometry={geo} material={mat} frustumCulled={false} />
      </group>
      <pointLight position={[0, 1.1, 0.4]} color={contract.palette.glow} intensity={2.4} distance={5} decay={1.6} />
    </group>
  );
}
