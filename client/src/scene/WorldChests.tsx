/**
 * Baús de drop no Companion World: aparecem onde o monstro caiu, com a cor do tipo (comum, raro, lendário) e um
 * brilho quando trazem Cristal Ápice. Tocar faz o Companion ir até o baú e abrir. Modelo simples por código.
 */
import { useEffect, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CHEST_TIERS, type CompanionWorld } from '@rules';
import { useChests, type ChestView } from '../chests/chestStore';
import { useGame } from '../store';
import { companionFocus } from './world';

const SHOW_R = 70;

function Chest({ c, y }: { c: ChestView; y: number }) {
  const lid = useRef<THREE.Group>(null), glow = useRef<THREE.Mesh>(null);
  const color = CHEST_TIERS[c.tier].color;
  const going = useChests((s) => s.going?.id === c.id);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (lid.current) lid.current.rotation.x = going ? -0.35 - Math.sin(t * 6) * 0.08 : -Math.max(0, Math.sin(t * 1.6)) * 0.06;
    if (glow.current) glow.current.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
  });
  const pick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); useChests.getState().open(c.id); };
  const s = c.tier === 'lendario' ? 1.25 : c.tier === 'raro' ? 1.1 : 1;
  return (
    <group position={[c.x, y, c.z]} scale={s} onClick={pick} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      <mesh position={[0, 0.22, 0]} castShadow><boxGeometry args={[0.7, 0.44, 0.48]} /><meshLambertMaterial color="#6b4a2c" /></mesh>
      {[-0.3, 0.3].map((x) => <mesh key={x} position={[x, 0.24, 0]}><boxGeometry args={[0.07, 0.47, 0.5]} /><meshLambertMaterial color={color} /></mesh>)}
      <group ref={lid} position={[0, 0.44, -0.24]}>
        <mesh position={[0, 0.08, 0.24]} castShadow><boxGeometry args={[0.72, 0.16, 0.5]} /><meshLambertMaterial color="#7a5533" /></mesh>
        <mesh position={[0, 0.17, 0.24]}><boxGeometry args={[0.74, 0.03, 0.08]} /><meshLambertMaterial color={color} /></mesh>
      </group>
      <mesh position={[0, 0.3, 0.25]}><boxGeometry args={[0.1, 0.12, 0.03]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      {c.crystals > 0 && <mesh ref={glow} position={[0, 0.95, 0]}><octahedronGeometry args={[0.14, 0]} /><meshBasicMaterial color="#b9a5ff" toneMapped={false} /></mesh>}
      {(c.tier !== 'comum' || c.crystals > 0) && <pointLight position={[0, 0.8, 0]} color={c.crystals ? '#b9a5ff' : color} intensity={0.9} distance={4} decay={1.8} />}
      {/* área de clique generosa (toque) */}
      <mesh position={[0, 0.4, 0]} visible={false}><cylinderGeometry args={[0.8, 0.8, 1, 8]} /><meshBasicMaterial /></mesh>
    </group>
  );
}

export function WorldChests({ cw }: { cw: CompanionWorld }) {
  const chests = useChests((s) => s.chests);
  const online = useGame((s) => s.backend?.kind === 'online');
  useEffect(() => { if (online) void useChests.getState().refresh(); }, [online]);
  const t = useRef(0);
  useFrame((_, dt) => { t.current += dt; if (t.current < 0.25) return; t.current = 0; useChests.getState().tick(); });
  const near = chests.filter((c) => Math.hypot(c.x - companionFocus.x, c.z - companionFocus.z) < SHOW_R && c.expiresAt > Date.now());
  return <group>{near.map((c) => <Chest key={c.id} c={c} y={cw.heightAt(c.x, c.z)} />)}</group>;
}
