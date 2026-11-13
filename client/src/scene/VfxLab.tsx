/** Lab dos efeitos (só no dev, forge-lab.html?vfx=missil|area|cone|corte|aura|feixe): um estilo por célula, em loop. */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VfxStore } from './vfx/engine';
import { VfxLayer } from './vfx/VfxLayer';
import { area, aura, beam, burst, cone, missile, slash } from './vfx/recipes';
import { techniqueFx } from './vfx/techniques';
import { COMBO_FINISHERS, WEAPON_TECHNIQUES } from '@rules';

const COLORS: Record<string, string> = { impacto: '#ffd56b', chamas: '#ff7a3d', gotas: '#3fb6ff', folhas: '#7be36b', pedras: '#c8a26b', gelo: '#7fd0ff', raios: '#ffe14d', vento: '#9ff0d8', luz: '#fff1a8', sombra: '#a07cff', faiscas: '#ffb84d', veneno: '#b45cff' };

function Driver({ store, style, mode, slow, freeze }: { store: VfxStore; style: string; mode: string; slow: number; freeze: number | null }) {
  const t = useRef(10);
  const color = COLORS[style] ?? '#fff';
  useFrame(() => {
    if (freeze !== null && t.current < 10) return; // congelado: dispara uma vez e avança exatamente `freeze` segundos
    t.current += 1 / 60 / slow;
    if (t.current < 2.4) return;
    t.current = 0;
    const o = new THREE.Vector3(-2.2, 0.7, 0);
    if (mode === 'missil') missile(store, { style, color, from: o, to: new THREE.Vector3(0.6, 0.8, 0), duration: 0.55, arc: 0.4, size: 0.6, onArrive: (at) => burst(store, style, at, color, 1, 0) });
    if (mode === 'area') area(store, style, new THREE.Vector3(0, 0, 0), 2, color, 0);
    if (mode === 'cone') cone(store, style, o, Math.PI / 2, 50, 4, color);
    if (mode === 'corte') slash(store, new THREE.Vector3(-0.5, 0.7, 0), Math.PI / 2, 2, color, true);
    if (mode === 'aura') aura(store, style, new THREE.Vector3(0, 0, 0), 2.2, color, 0);
    if (mode === 'feixe') beam(store, style, o, new THREE.Vector3(2.2, 0.7, 0), 0.5, color);
    // técnica de arma (forge-lab.html?tec=<slug>,<slug>&so=chamas): o efeito próprio, com os números da técnica.
    // O alcance é encurtado para caber no quadro (o arco tem 12–14 m).
    if (mode.startsWith('tec:')) {
      const sk = [...WEAPON_TECHNIQUES, ...COMBO_FINISHERS].find((t) => t.slug === mode.slice(4));
      if (sk) {
        const far = sk.shape === 'circle' || sk.shape === 'leap', range = Math.min(sk.range, 4.4);
        const feet = new THREE.Vector3(far || sk.shape === 'aura' ? -1.2 : -2.2, 0, 0);
        const own = techniqueFx(store, sk.slug, { feet, chest: feet.clone().setY(0.7), target: new THREE.Vector3(far ? 1 : feet.x + range, 0, 0), yaw: Math.PI / 2, range, radius: Math.min(sk.radius, 2.4), angle: sk.angle, style, color, ground: () => 0 });
        if (own?.generic) missile(store, { style, color, from: feet.clone().setY(0.7), to: new THREE.Vector3(feet.x + range, 0.7, 0), duration: 0.35, arc: 0.3, size: 0.55, onArrive: (at) => burst(store, style, at, color, 0.85, 0) });
      }
    }
    if (freeze !== null) for (let k = 0; k < Math.round(freeze * 60); k++) store.update(1 / 60);
  });
  return null;
}

export function VfxLab({ style, mode }: { style: string; mode: string }) {
  const store = useMemo(() => new VfxStore(), []);
  const q = new URLSearchParams(location.search), slow = Number(q.get('lento') ?? 1), freeze = q.has('congela') ? Number(q.get('congela')) : null;
  return (
    <Canvas dpr={1} camera={{ position: [0, 2.4, 4], fov: 45 }} onCreated={({ camera }) => camera.lookAt(0, 0.5, 0)}>
      <color attach="background" args={['#9fd3f0']} />
      <hemisphereLight args={['#ffffff', '#5aa84c', 1.4]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[8, 40]} /><meshLambertMaterial color="#7fbf55" /></mesh>
      <Driver store={store} style={style} mode={mode} slow={slow} freeze={freeze} />
      <VfxLayer store={store} fixedDt={freeze !== null ? 0 : 1 / 60 / slow} />
    </Canvas>
  );
}

export const VFX_STYLES = Object.keys(COLORS);
