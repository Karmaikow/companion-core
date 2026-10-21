/**
 * Clima na cena: partículas em volta do Companion (chuva, neve, areia, névoa), névoa e cor do céu puxadas para o
 * clima, e o relâmpago da tempestade. A transição entre climas é suave (a força sobe e desce em ~3 s).
 * O escurecimento/tinta da tela fica no DOM (WeatherOverlay), mais barato que pós-processamento.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WeatherKind } from '@rules';
import { companionFocus, mulberry32, type WorldShape } from './world';
import { softDot } from './textures';

const LOOK: Record<WeatherKind, { fog: string | null; fogNear: number; fogFar: number; sky: string | null; amt: number }> = {
  limpo: { fog: null, fogNear: 1, fogFar: 1, sky: null, amt: 0 },
  sol: { fog: '#fff1cf', fogNear: 1.1, fogFar: 1.15, sky: '#cfe8ff', amt: 0.35 },
  chuva: { fog: '#8d98a8', fogNear: 0.55, fogFar: 0.7, sky: '#8f9bab', amt: 0.75 },
  tempestade: { fog: '#5f6878', fogNear: 0.4, fogFar: 0.55, sky: '#5a6272', amt: 0.9 },
  nevoa: { fog: '#e3e6ee', fogNear: 0.05, fogFar: 0.3, sky: '#dde1ea', amt: 0.95 },
  neve: { fog: '#e8f2ff', fogNear: 0.5, fogFar: 0.7, sky: '#d5e4f5', amt: 0.7 },
  areia: { fog: '#d9a76a', fogNear: 0.06, fogFar: 0.32, sky: '#d8a86e', amt: 0.95 },
};

const N = 1400;
/** Força atual do clima (0..1), compartilhada com o overlay do DOM (relâmpago). */
export const weatherNow = { kind: 'limpo' as WeatherKind, k: 0, flash: 0 };

export function WeatherFx({ kind, intensity, world }: { kind: WeatherKind; intensity: number; world: WorldShape }) {
  const { scene } = useThree();
  const base = useRef<{ fog: THREE.Fog | null; color: THREE.Color; near: number; far: number; bg: THREE.Color | null }>({ fog: null, color: new THREE.Color(), near: 30, far: 60, bg: null });
  const shown = useRef<{ kind: WeatherKind; k: number }>({ kind, k: 0 });
  const seeds = useMemo(() => { const r = mulberry32(99); return Array.from({ length: N }, () => ({ x: r() - 0.5, y: r(), z: r() - 0.5, s: 0.6 + r() * 0.8, ph: r() * 6.28 })); }, []);
  const rain = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3)); return g; }, []);
  const dots = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); return g; }, []);
  useEffect(() => () => { rain.dispose(); dots.dispose(); }, [rain, dots]);
  const rainRef = useRef<THREE.LineSegments>(null);
  const dotRef = useRef<THREE.Points>(null);
  const tmp = useMemo(() => new THREE.Color(), []);
  const nextFlash = useRef(3);

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), t = s.clock.elapsedTime;
    // transição: apaga o clima antigo, depois acende o novo
    const sh = shown.current;
    if (sh.kind !== kind) { sh.k -= dt / 1.5; if (sh.k <= 0) { sh.k = 0; sh.kind = kind; } }
    else sh.k = Math.min(intensity, sh.k + dt / 3);
    if (sh.k > intensity) sh.k = Math.max(intensity, sh.k - dt / 3);
    const K = sh.k, L = LOOK[sh.kind];
    weatherNow.kind = sh.kind; weatherNow.k = K;

    // névoa e céu: guarda a base que o Sky pôs (troca quando o Sky recria a névoa) e puxa para o clima
    const fog = scene.fog as THREE.Fog | null;
    if (fog && fog !== base.current.fog) { base.current = { fog, color: fog.color.clone(), near: fog.near, far: fog.far, bg: scene.background instanceof THREE.Color ? scene.background.clone() : null }; }
    if (fog && base.current.fog === fog) {
      const a = L.amt * K;
      fog.color.copy(base.current.color); if (L.fog) fog.color.lerp(tmp.set(L.fog), a);
      fog.near = base.current.near * (1 + (L.fogNear - 1) * K);
      fog.far = base.current.far * (1 + (L.fogFar - 1) * K);
      if (base.current.bg && scene.background instanceof THREE.Color) { scene.background.copy(base.current.bg); if (L.sky) scene.background.lerp(tmp.set(L.sky), a); }
    }

    // relâmpago
    weatherNow.flash = Math.max(0, weatherNow.flash - dt * 3);
    if (sh.kind === 'tempestade' && K > 0.3) { nextFlash.current -= dt; if (nextFlash.current <= 0) { weatherNow.flash = 1; nextFlash.current = 4 + Math.random() * 8; } }

    // partículas em volta do Companion
    const fx = companionFocus.x, fz = companionFocus.z, W = 30, H = 14;
    const isRain = sh.kind === 'chuva' || sh.kind === 'tempestade';
    const count = Math.floor(N * K * (sh.kind === 'tempestade' ? 1 : sh.kind === 'chuva' ? 0.6 : sh.kind === 'neve' ? 0.95 : sh.kind === 'areia' ? 0.7 : sh.kind === 'nevoa' ? 0.25 : sh.kind === 'sol' ? 0.08 : 0));
    const windX = sh.kind === 'tempestade' ? 3 : sh.kind === 'areia' ? 9 : sh.kind === 'chuva' ? 0.8 : 0.4;
    if (rainRef.current) rainRef.current.visible = isRain && count > 0;
    if (dotRef.current) dotRef.current.visible = !isRain && count > 0;
    if (isRain) {
      const p = rain.attributes.position as THREE.BufferAttribute, sp = sh.kind === 'tempestade' ? 22 : 15, len = sh.kind === 'tempestade' ? 1.8 : 1.3;
      for (let i = 0; i < N; i++) {
        if (i >= count) { p.setXYZ(i * 2, 0, -99, 0); p.setXYZ(i * 2 + 1, 0, -99, 0); continue; }
        const q = seeds[i], y = ((q.y * H - t * sp * q.s) % H + H) % H;
        const x = fx + q.x * W + (windX * y) / sp, z = fz + q.z * W, gy = world.heightAt(x, z);
        p.setXYZ(i * 2, x, gy + y, z); p.setXYZ(i * 2 + 1, x - windX * len / sp, gy + y + len, z);
      }
      p.needsUpdate = true;
    } else if (count > 0) {
      const p = dots.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        if (i >= count) { p.setXYZ(i, 0, -99, 0); continue; }
        const q = seeds[i];
        let x: number, y: number, z: number;
        if (sh.kind === 'areia') { const run = ((q.x * W + t * windX * q.s) % W + W) % W - W / 2; x = fx + run; y = q.y * 4 + Math.sin(t * 3 + q.ph) * 0.2; z = fz + q.z * W; }
        else if (sh.kind === 'neve') { y = ((q.y * H - t * 1.1 * q.s) % H + H) % H; x = fx + q.x * W + Math.sin(t * 0.8 + q.ph) * 0.6; z = fz + q.z * W + Math.cos(t * 0.6 + q.ph) * 0.6; }
        else if (sh.kind === 'nevoa') { x = fx + q.x * W + Math.sin(t * 0.1 + q.ph) * 2; y = 0.3 + q.y * 2.5; z = fz + q.z * W; }
        else { x = fx + q.x * W * 0.6; y = 0.5 + q.y * 5 + Math.sin(t + q.ph) * 0.3; z = fz + q.z * W * 0.6; } // sol: brilhos no ar
        p.setXYZ(i, x, world.heightAt(x, z) + y, z);
      }
      p.needsUpdate = true;
      const m = dotRef.current?.material as THREE.PointsMaterial | undefined;
      if (m) {
        m.color.set(sh.kind === 'areia' ? '#e0b070' : sh.kind === 'nevoa' ? '#ffffff' : sh.kind === 'sol' ? '#fff3b0' : '#ffffff');
        m.size = sh.kind === 'nevoa' ? 3.5 : sh.kind === 'areia' ? 0.32 : sh.kind === 'neve' ? 0.38 : 0.22;
        m.opacity = sh.kind === 'nevoa' ? 0.12 : sh.kind === 'areia' ? 0.75 : 0.95;
        m.blending = sh.kind === 'sol' ? THREE.AdditiveBlending : THREE.NormalBlending;
      }
    }
  });

  return (
    <>
      <lineSegments ref={rainRef} geometry={rain} frustumCulled={false}>
        <lineBasicMaterial color="#e2ecfa" transparent opacity={0.85} depthWrite={false} />
      </lineSegments>
      <points ref={dotRef} geometry={dots} frustumCulled={false}>
        <pointsMaterial map={softDot()} size={0.12} transparent depthWrite={false} />
      </points>
    </>
  );
}
