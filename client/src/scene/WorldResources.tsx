/**
 * Recursos de coleta do Companion World (Ecos da Terra): nascem por chunk em todas as regiões, pela tabela de recursos
 * de cada bioma (shared/rules/ecosWorld.ts). Só os chunks em volta do Companion entram na cena; os que dependem de
 * horário ou clima somem e voltam sozinhos. Modelos simples por código (low-poly); a interação mora no ecosStore.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { NODE_KINDS, chunkResources, type CompanionWorld, type WeatherConfig, type ResourceNode, type WorldNode } from '@rules';
import { useEcos, amountOf, work } from '../ecos/ecosStore';
import { setEcosWorld, findNode, isAvailable } from '../ecos/worldNodes';
import { colliders } from './world';
import { gameVfx } from './vfx/engine';
import { burst } from './vfx/recipes';
import { WillowResource } from './WillowResource';

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

function Willow({ amount, cap, glow }: { amount: number; cap: number; glow: boolean }) {
  const cut = amount < 2, sparse = amount / cap < 0.5;
  return (
    <group>
      <mesh position={[0, cut ? 0.25 : 1.1, 0]} castShadow><cylinderGeometry args={[0.16, 0.26, cut ? 0.5 : 2.2, 7]} /><meshLambertMaterial color="#6d5a45" /></mesh>
      {glow && !cut && <mesh position={[0.17, 0.9, 0.05]}><boxGeometry args={[0.04, 1.2, 0.08]} /><meshBasicMaterial color="#7fd6ff" toneMapped={false} /></mesh>}
      {!cut && [0, 1, 2, 3, 4, 5].slice(0, sparse ? 3 : 6).map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 0.55, 1.75, Math.sin(a) * 0.55]} rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]} castShadow><coneGeometry args={[0.45, 1.7, 6]} /><meshLambertMaterial color={i % 2 ? '#8fb57a' : '#a6c79a'} /></mesh>;
      })}
      {!cut && <mesh position={[0, 2.45, 0]} castShadow><sphereGeometry args={[0.75, 8, 6]} /><meshLambertMaterial color="#9cc28c" /></mesh>}
    </group>
  );
}
function Oak({ amount, cap }: { amount: number; cap: number }) {
  const cut = amount < 2;
  return (
    <group>
      <mesh position={[0, cut ? 0.25 : 1.0, 0]} castShadow><cylinderGeometry args={[0.28, 0.4, cut ? 0.5 : 2, 8]} /><meshLambertMaterial color="#5a4532" /></mesh>
      {!cut && <>
        <mesh position={[0, 2.5, 0]} castShadow><dodecahedronGeometry args={[1.25 * (0.75 + 0.25 * amount / cap), 0]} /><meshLambertMaterial color="#4f7a3e" flatShading /></mesh>
        <mesh position={[0.6, 2.1, 0.3]} castShadow><dodecahedronGeometry args={[0.7, 0]} /><meshLambertMaterial color="#5d8a48" flatShading /></mesh>
      </>}
    </group>
  );
}
function Herb({ amount, cap }: { amount: number; cap: number }) {
  const k = amount / cap;
  return (
    <group scale={0.5 + 0.5 * Math.max(0.15, k)}>
      {[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.18, 0.18, Math.sin(a) * 0.18]} rotation={[Math.sin(a) * 0.8, a, Math.cos(a) * 0.8]} scale={[0.22, 0.04, 0.12]}><sphereGeometry args={[1, 6, 4]} /><meshLambertMaterial color="#5fae6a" /></mesh>; })}
      {k > 0.4 && [0, 1, 2].map((i) => <mesh key={'f' + i} position={[Math.cos(i * 2.1) * 0.12, 0.38 + i * 0.03, Math.sin(i * 2.1) * 0.12]}><sphereGeometry args={[0.06, 6, 4]} /><meshLambertMaterial color="#f2f6ff" emissive="#9fd8ff" emissiveIntensity={0.3} /></mesh>)}
    </group>
  );
}
function Pebbles({ amount, cap }: { amount: number; cap: number }) {
  const n = 4 + Math.round((amount / cap) * 6);
  return (
    <group>
      {Array.from({ length: n }, (_, i) => { const a = i * 2.4, r = 0.2 + (i % 3) * 0.18; return <mesh key={i} position={[Math.cos(a) * r, 0.04, Math.sin(a) * r]} scale={[0.12, 0.06, 0.09]}><sphereGeometry args={[1, 6, 4]} /><meshLambertMaterial color={i % 2 ? '#b8b2a6' : '#d8d2c4'} /></mesh>; })}
    </group>
  );
}
function Rock({ amount, cap, tint, vein }: { amount: number; cap: number; tint: string; vein: string }) {
  const s = 0.6 + 0.4 * (amount / cap);
  return (
    <group>
      <mesh position={[0, 0.45 * s, 0]} castShadow receiveShadow scale={[1.1 * s, 0.85 * s, 0.95 * s]}><dodecahedronGeometry args={[0.7, 0]} /><meshLambertMaterial color={tint} flatShading /></mesh>
      <mesh position={[0.2 * s, 0.6 * s, 0.45 * s]} rotation={[0.3, 0.5, 0.2]}><boxGeometry args={[0.5 * s, 0.05, 0.06]} /><meshLambertMaterial color={vein} /></mesh>
      <mesh position={[-0.3 * s, 0.35 * s, 0.4 * s]} rotation={[0.1, -0.4, 0.5]}><boxGeometry args={[0.35 * s, 0.05, 0.05]} /><meshLambertMaterial color={vein} /></mesh>
    </group>
  );
}
function Geode({ amount, cap }: { amount: number; cap: number }) {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow><dodecahedronGeometry args={[0.55, 0]} /><meshLambertMaterial color="#8c8580" flatShading /></mesh>
      {amount >= 1 && [0, 1, 2].map((i) => <mesh key={i} position={[0.15 * Math.cos(i * 2), 0.55 + i * 0.04, 0.38 + 0.08 * Math.sin(i * 2)]} rotation={[0.4, i, 0.2]} scale={(amount / cap) * 0.7 + 0.3}><octahedronGeometry args={[0.13, 0]} /><meshBasicMaterial color="#8fd8ff" toneMapped={false} /></mesh>)}
    </group>
  );
}
/** Salgueiro Antigo: tronco largo e retorcido, copa baixa, um galho de cerne claro. */
function AncientWillow({ amount, cap }: { amount: number; cap: number }) {
  const has = amount >= 1;
  return (
    <group scale={1.25}>
      <mesh position={[0, 1, 0]} rotation={[0, 0, 0.12]} castShadow><cylinderGeometry args={[0.32, 0.55, 2, 8]} /><meshLambertMaterial color="#54473a" /></mesh>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = (i / 7) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.8, 1.9, Math.sin(a) * 0.8]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]} castShadow><coneGeometry args={[0.5, 2.1, 6]} /><meshLambertMaterial color={i % 2 ? '#6f9a6a' : '#86ad7d'} /></mesh>; })}
      {has && <mesh position={[0.55, 1.35, 0.1]} rotation={[0, 0, -0.9]} scale={0.6 + 0.4 * (amount / cap)}><cylinderGeometry args={[0.07, 0.1, 1.1, 6]} /><meshLambertMaterial color="#e8d7a8" emissive="#a88b4a" emissiveIntensity={0.25} /></mesh>}
    </group>
  );
}
/** Remanso Profundo: poça escura e funda que só se forma com chuva. */
function DeepPool({ amount, cap }: { amount: number; cap: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}><circleGeometry args={[0.9 + 0.3 * (amount / cap), 24]} /><meshLambertMaterial color="#2f6f8f" emissive="#123a52" emissiveIntensity={0.6} transparent opacity={0.88} /></mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 1.1, 0.08, Math.sin(a) * 1.1]} scale={[0.22, 0.14, 0.18]}><dodecahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#7d8b8f" flatShading /></mesh>; })}
    </group>
  );
}
/** Líquen dos Ventos: rocha alta com fios claros que balançam. */
function WindLichen({ amount, cap }: { amount: number; cap: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => { if (ref.current) ref.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.6) * 0.12; });
  const n = 2 + Math.round((amount / cap) * 5);
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow scale={[0.7, 1.6, 0.6]}><dodecahedronGeometry args={[0.6, 0]} /><meshLambertMaterial color="#9b9a96" flatShading /></mesh>
      <group ref={ref} position={[0, 1.6, 0]}>
        {Array.from({ length: n }, (_, i) => <mesh key={i} position={[Math.cos(i * 1.3) * 0.25, 0.25, Math.sin(i * 1.3) * 0.25]} rotation={[0.3, i, 0.2]}><cylinderGeometry args={[0.012, 0.02, 0.6, 4]} /><meshLambertMaterial color="#e6f4ff" emissive="#9fd2ff" emissiveIntensity={0.35} /></mesh>)}
      </group>
    </group>
  );
}
/** Pedra Inscrita: estela com runas que brilham à noite. */
function InscribedStone({ amount }: { amount: number }) {
  const lit = amount >= 1;
  return (
    <group>
      <mesh position={[0, 0.75, 0]} castShadow><boxGeometry args={[0.7, 1.5, 0.28]} /><meshLambertMaterial color="#77737c" flatShading /></mesh>
      {[0, 1, 2].map((i) => <mesh key={i} position={[0, 0.45 + i * 0.35, 0.15]}><boxGeometry args={[0.36, 0.05, 0.02]} /><meshBasicMaterial color={lit ? '#c9a8ff' : '#55505c'} toneMapped={false} /></mesh>)}
      {lit && <pointLight position={[0, 1, 0.5]} color="#b994ff" intensity={0.8} distance={4} decay={1.8} />}
    </group>
  );
}

function NodeMesh({ node, amount }: { node: ResourceNode; amount: number }) {
  const k = NODE_KINDS[node.kind];
  switch (node.kind) {
    case 'salgueiro': return <WillowResource id={node.id} amount={amount} glow={false} fallback={<Willow amount={amount} cap={k.capacity} glow={false} />} />;
    case 'carvalho': return <Oak amount={amount} cap={k.capacity} />;
    case 'erva': return <Herb amount={amount} cap={k.capacity} />;
    case 'cascalho': return <Pebbles amount={amount} cap={k.capacity} />;
    case 'granito': return <Rock amount={amount} cap={k.capacity} tint="#8d8f94" vein="#e6e2da" />;
    case 'cobre': return <Rock amount={amount} cap={k.capacity} tint="#7d7468" vein="#4fb38a" />;
    case 'geodo': return <Geode amount={amount} cap={k.capacity} />;
    case 'salgueiro-antigo': return <AncientWillow amount={amount} cap={k.capacity} />;
    case 'remanso-profundo': return <DeepPool amount={amount} cap={k.capacity} />;
    case 'liquen-dos-ventos': return <WindLichen amount={amount} cap={k.capacity} />;
    case 'pedra-inscrita': return <InscribedStone amount={amount} />;
  }
  return null;
}

const VFX_OF: Record<string, string> = { madeira: 'folhas', planta: 'folhas', pedra: 'pedras', minerio: 'pedras', gema: 'luz', magico: 'luz', caca: 'impacto' };
const COLOR_OF: Record<string, string> = { madeira: '#a68a64', planta: '#7bd47a', pedra: '#c9c3b6', minerio: '#62c39a', gema: '#8fd8ff', magico: '#7fd6ff', caca: '#d0b090' };
const SOLID = new Set(['salgueiro', 'carvalho', 'granito', 'cobre', 'geodo', 'salgueiro-antigo', 'liquen-dos-ventos', 'pedra-inscrita']);
/** chunks em volta do Companion com recursos na cena (5×5 = ~80 m) */
const R = 2;

// ---------------------------------------------------------------------------
// Cena
// ---------------------------------------------------------------------------

export function WorldResources({ cw, center, weather }: { cw: CompanionWorld; center: [number, number]; weather?: WeatherConfig }) {
  useEffect(() => { setEcosWorld(cw, weather); }, [cw, weather]);
  useEffect(() => () => { setEcosWorld(null); }, []);
  // horário, clima e abundância mudam com o tempo: redesenha a cada segundo (a lista de chunks só muda com o centro)
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setTick((v) => v + 1), 1000); return () => window.clearInterval(t); }, []);
  const all = useMemo(() => {
    const out: WorldNode[] = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) out.push(...chunkResources(cw, center[0] + dx, center[1] + dz));
    return out;
  }, [cw, center]);
  const shown = useMemo(() => all.filter(isAvailable), [all, Math.floor(tick / 20)]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useEcos((s) => s.view), selected = useEcos((s) => s.selected), run = useEcos((s) => s.run);
  useEffect(() => {
    colliders.set('ecos', shown.filter((n) => SOLID.has(n.kind)).map((n) => ({ x: n.x, z: n.z, r: n.kind === 'carvalho' || n.kind === 'salgueiro-antigo' ? 0.45 : n.kind === 'salgueiro' ? 0.3 : 0.5 })));
    return () => { colliders.delete('ecos'); };
  }, [shown]);
  // efeito enquanto coleta
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (!run || run.phase !== 'coletando' || t.current < 0.7) return;
    t.current = 0;
    const n = findNode(run.node); if (!n) return;
    const cat = NODE_KINDS[n.kind].category, y = cw.heightAt(n.x, n.z);
    burst(gameVfx, VFX_OF[cat] ?? 'impacto', new THREE.Vector3(n.x, y + 0.6, n.z), COLOR_OF[cat] ?? '#ffffff', 0.45, y);
  });
  const pick = (e: ThreeEvent<MouseEvent>, id: string) => { e.stopPropagation(); useEcos.getState().select(id); };
  return (
    <group>
      <EcosTicker />
      {shown.map((n) => {
        const y = cw.heightAt(n.x, n.z), amount = amountOf(view, n), sel = selected === n.id, k = NODE_KINDS[n.kind];
        const empty = amount < Math.min(...k.approaches.map((a) => a.cost));
        return (
          <group key={n.id} position={[n.x, y, n.z]} onClick={(e) => pick(e, n.id)} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
            <NodeMesh node={n} amount={amount} />
            {/* área de clique generosa (toque) */}
            <mesh position={[0, 0.8, 0]} visible={false}><cylinderGeometry args={[0.9, 0.9, 1.8, 8]} /><meshBasicMaterial /></mesh>
            {sel && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><ringGeometry args={[0.95, 1.12, 40]} /><meshBasicMaterial color={empty ? '#9aa3ad' : '#d9f0ff'} transparent opacity={0.85} toneMapped={false} /></mesh>}
          </group>
        );
      })}
    </group>
  );
}

/** Lógica por quadro: avisa o ecosStore (terminar a coleta, a Companion por intenção). */
function EcosTicker() {
  const t = useRef(0);
  useEffect(() => { useEcos.getState().setInWorld(true); return () => { useEcos.getState().setInWorld(false); work.on = false; }; }, []);
  useFrame((_, dt) => {
    t.current += dt; if (t.current < 0.2) return; t.current = 0;
    useEcos.getState().tick();
  });
  return null;
}

