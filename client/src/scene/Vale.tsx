/**
 * Vale dos Ecos (Ecos da Terra): riacho, bosque e afloramento com os recursos clicáveis, a nascente (e o Jardim, se
 * preservada) e a Ponte do Riacho, que aparece em etapas conforme a obra comunitária avança.
 * Modelos simples por código (low-poly), na paleta do Companion World. A interação mora no ecosStore.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { VALE, VALE_NODES, STREAM, NASCENTE, BRIDGE, NODE_KINDS, SEIVA_AZUL, waterLevelAt, nodeById, JARDIM, type ResourceNode } from '@rules';
import { useEcos, amountOf, bridgeDone, work } from '../ecos/ecosStore';
import { colliders, companionFocus } from './world';
import { gameVfx } from './vfx/engine';
import { burst } from './vfx/recipes';

type Height = (x: number, z: number) => number;

// ---------------------------------------------------------------------------
// Riacho
// ---------------------------------------------------------------------------

function waterTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6cc3e6'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.22})`; const x = Math.random() * 64, y = Math.random() * 128; g.fillRect(x, y, 2 + Math.random() * 10, 1.4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Stream() {
  const tex = useMemo(waterTexture, []);
  const geo = useMemo(() => {
    // fita ao longo do riacho, com largura que cresce rio abaixo
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < STREAM.length - 1; i++) for (let k = 0; k < 8; k++) { const t = k / 8; pts.push(new THREE.Vector2(STREAM[i][0] + (STREAM[i + 1][0] - STREAM[i][0]) * t, STREAM[i][1] + (STREAM[i + 1][1] - STREAM[i][1]) * t)); }
    pts.push(new THREE.Vector2(...STREAM[STREAM.length - 1]));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let acc = 0;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.y - a.y, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      const w = 0.55 + (i / pts.length) * 0.5;
      if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
      const y = waterLevelAt(p.x, p.y);
      pos.push(p.x + nx * w, y, p.y + nz * w, p.x - nx * w, y, p.y - nz * w);
      uv.push(0, acc / 3, 1, acc / 3);
      if (i > 0) { const q = i * 2; idx.push(q - 2, q - 1, q, q - 1, q + 1, q); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }, []);
  useFrame((_, dt) => { tex.offset.y -= dt * 0.35; });
  return <mesh geometry={geo} renderOrder={2}><meshLambertMaterial map={tex} transparent opacity={0.82} depthWrite={false} emissive="#2a6f8f" emissiveIntensity={0.25} side={THREE.DoubleSide} /></mesh>;
}

// ---------------------------------------------------------------------------
// Recursos
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
function Pebbles({ amount, cap, specks }: { amount: number; cap: number; specks: boolean }) {
  const n = 4 + Math.round((amount / cap) * 6);
  return (
    <group>
      {Array.from({ length: n }, (_, i) => { const a = i * 2.4, r = 0.2 + (i % 3) * 0.18; return <mesh key={i} position={[Math.cos(a) * r, 0.04, Math.sin(a) * r]} scale={[0.12, 0.06, 0.09]}><sphereGeometry args={[1, 6, 4]} /><meshLambertMaterial color={i % 2 ? '#b8b2a6' : '#d8d2c4'} /></mesh>; })}
      {specks && [0, 1].map((i) => <mesh key={'s' + i} position={[0.1 + i * 0.2, 0.08, -0.1]}><octahedronGeometry args={[0.035, 0]} /><meshBasicMaterial color="#7fd6ff" toneMapped={false} /></mesh>)}
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

function NodeMesh({ node, amount, glow, specks }: { node: ResourceNode; amount: number; glow: boolean; specks: boolean }) {
  const k = NODE_KINDS[node.kind];
  switch (node.kind) {
    case 'salgueiro': return <Willow amount={amount} cap={k.capacity} glow={glow} />;
    case 'carvalho': return <Oak amount={amount} cap={k.capacity} />;
    case 'erva': return <Herb amount={amount} cap={k.capacity} />;
    case 'cascalho': return <Pebbles amount={amount} cap={k.capacity} specks={specks} />;
    case 'granito': return <Rock amount={amount} cap={k.capacity} tint="#8d8f94" vein="#e6e2da" />;
    case 'cobre': return <Rock amount={amount} cap={k.capacity} tint="#7d7468" vein="#4fb38a" />;
    case 'geodo': return <Geode amount={amount} cap={k.capacity} />;
  }
  return null;
}

const VFX_OF: Record<string, string> = { madeira: 'folhas', planta: 'folhas', pedra: 'pedras', minerio: 'pedras', gema: 'luz', magico: 'luz', caca: 'impacto' };
const COLOR_OF: Record<string, string> = { madeira: '#a68a64', planta: '#7bd47a', pedra: '#c9c3b6', minerio: '#62c39a', gema: '#8fd8ff', magico: '#7fd6ff', caca: '#d0b090' };

function ResourceNodes({ height }: { height: Height }) {
  const view = useEcos((s) => s.view), selected = useEcos((s) => s.selected), run = useEcos((s) => s.run);
  const chain = view?.profile.chain[SEIVA_AZUL.id];
  const bridge = bridgeDone(view);
  const nodes = VALE_NODES.filter((n) => !n.needs || bridge);
  useEffect(() => {
    colliders.set('vale', nodes.filter((n) => ['salgueiro', 'carvalho', 'granito', 'cobre', 'geodo'].includes(n.kind)).map((n) => ({ x: n.x, z: n.z, r: n.kind === 'carvalho' ? 0.45 : n.kind === 'salgueiro' ? 0.3 : 0.55 })));
    return () => { colliders.delete('vale'); };
  }, [nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // efeito enquanto coleta
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (!run || run.phase !== 'coletando' || t.current < 0.7) return;
    t.current = 0;
    const n = nodeById(run.node); if (!n) return;
    const cat = NODE_KINDS[n.kind].category, y = height(n.x, n.z);
    burst(gameVfx, VFX_OF[cat] ?? 'impacto', new THREE.Vector3(n.x, y + 0.6, n.z), COLOR_OF[cat] ?? '#ffffff', 0.45, y);
  });
  const pick = (e: ThreeEvent<MouseEvent>, id: string) => { e.stopPropagation(); useEcos.getState().select(id); };
  return (
    <group>
      {nodes.map((n) => {
        const y = height(n.x, n.z), amount = amountOf(view, n), sel = selected === n.id, k = NODE_KINDS[n.kind];
        const empty = amount < Math.min(...k.approaches.map((a) => a.cost));
        return (
          <group key={n.id} position={[n.x, y, n.z]} onClick={(e) => pick(e, n.id)} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
            <NodeMesh node={n} amount={amount} glow={n.id === 'salgueiro-nascente'} specks={n.id === 'cascalho-alto'} />
            {/* área de clique generosa (toque) */}
            <mesh position={[0, 0.8, 0]} visible={false}><cylinderGeometry args={[0.9, 0.9, 1.8, 8]} /><meshBasicMaterial /></mesh>
            {sel && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><ringGeometry args={[0.95, 1.12, 40]} /><meshBasicMaterial color={empty ? '#9aa3ad' : '#d9f0ff'} transparent opacity={0.85} toneMapped={false} /></mesh>}
          </group>
        );
      })}
      {/* indício: a nascente provável (só depois de ler as pistas no riacho) */}
      {(chain?.step ?? 0) >= 2 && !chain?.completedAt && <ClueWisp x={NASCENTE.x} z={NASCENTE.z} y={height(NASCENTE.x, NASCENTE.z)} />}
    </group>
  );
}

function ClueWisp({ x, y, z }: { x: number; y: number; z: number }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (m.current) { m.current.position.y = y + 2 + Math.sin(s.clock.elapsedTime * 2) * 0.15; m.current.rotation.y = s.clock.elapsedTime; } });
  return <mesh ref={m} position={[x, y + 2, z]}><octahedronGeometry args={[0.18, 0]} /><meshBasicMaterial color="#9fe0ff" toneMapped={false} /></mesh>;
}

// ---------------------------------------------------------------------------
// Nascente e Jardim da Nascente
// ---------------------------------------------------------------------------

function Spring({ height }: { height: Height }) {
  const view = useEcos((s) => s.view);
  const chain = view?.profile.chain[SEIVA_AZUL.id];
  const site = view?.sites.find((s) => s.id === JARDIM.id);
  const asleep = chain?.choice === 'extrair';
  const y = height(NASCENTE.x, NASCENTE.z);
  const glow = useRef<THREE.PointLight>(null);
  useFrame((s) => { if (glow.current) glow.current.intensity = (asleep ? 0.3 : 1.2) + Math.sin(s.clock.elapsedTime * 1.7) * 0.2; });
  const plants = site ? Math.max(1, Math.min(10, Math.floor(site.now))) : 0;
  return (
    <group position={[NASCENTE.x, y, NASCENTE.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><circleGeometry args={[1.1, 28]} /><meshLambertMaterial color={asleep ? '#4f7f99' : '#5fd0ff'} emissive={asleep ? '#10303f' : '#2a8fbf'} emissiveIntensity={0.6} transparent opacity={0.85} /></mesh>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = (i / 7) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 1.3, 0.12, Math.sin(a) * 1.3]} scale={[0.28, 0.2, 0.24]}><dodecahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#9c9a94" flatShading /></mesh>; })}
      {!asleep && !site && [0, 1, 2].map((i) => <mesh key={'c' + i} position={[Math.cos(i * 2.1) * 0.5, 0.25, Math.sin(i * 2.1) * 0.5]} rotation={[0.3, i, 0.2]}><octahedronGeometry args={[0.16, 0]} /><meshBasicMaterial color="#9fe6ff" toneMapped={false} /></mesh>)}
      {site && Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2, grown = i < plants;
        return <group key={'g' + i} position={[Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1]} scale={grown ? 0.8 : 0.35}><Herb amount={grown ? 6 : 1} cap={6} /></group>;
      })}
      <pointLight ref={glow} position={[0, 0.8, 0]} color="#7fd6ff" distance={7} decay={1.6} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ponte do Riacho (etapas)
// ---------------------------------------------------------------------------

function Bridge({ height }: { height: Height }) {
  const stage = useEcos((s) => s.view?.project.stage ?? 0);
  const done = useEcos((s) => !!s.view?.project.completedAt);
  const y = Math.max(height(BRIDGE.x - 2.6, BRIDGE.z), height(BRIDGE.x + 2.6, BRIDGE.z));
  return (
    <group position={[BRIDGE.x, 0, BRIDGE.z]} rotation={[0, BRIDGE.rot - Math.PI / 2, 0]}>
      {/* etapa 0: estacas marcando onde a ponte vai */}
      {stage < 1 && [-2.4, 2.4].map((x) => <mesh key={x} position={[x, height(BRIDGE.x + x, BRIDGE.z) + 0.3, 0]}><cylinderGeometry args={[0.05, 0.05, 0.6, 5]} /><meshLambertMaterial color="#c8a878" /></mesh>)}
      {stage >= 1 && [-2.5, 2.5].map((x) => [-0.65, 0.65].map((z) => (
        <mesh key={`${x}${z}`} position={[x, y - 0.1, z]} castShadow><boxGeometry args={[0.55, 0.9, 0.45]} /><meshLambertMaterial color="#9a978f" flatShading /></mesh>
      )))}
      {stage >= 2 && <>
        <mesh position={[0, y + 0.42, 0]} castShadow receiveShadow><boxGeometry args={[BRIDGE.len, 0.12, 1.5]} /><meshLambertMaterial color="#8a6a48" /></mesh>
        {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[-BRIDGE.len / 2 + 0.35 + i * 0.7, y + 0.49, 0]}><boxGeometry args={[0.06, 0.02, 1.5]} /><meshLambertMaterial color="#6b5036" /></mesh>)}
      </>}
      {(stage >= 3 || done) && <>
        {[-0.72, 0.72].map((z) => <mesh key={z} position={[0, y + 0.95, z]}><boxGeometry args={[BRIDGE.len, 0.07, 0.07]} /><meshLambertMaterial color="#6b5036" /></mesh>)}
        {[-2.6, 2.6].map((x) => (
          <group key={x} position={[x, y + 0.45, 0.85]}>
            <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.05, 0.06, 1.4, 6]} /><meshLambertMaterial color="#b87333" /></mesh>
            <mesh position={[0, 1.5, 0]}><sphereGeometry args={[0.16, 10, 8]} /><meshBasicMaterial color="#9fe6ff" toneMapped={false} /></mesh>
            <pointLight position={[0, 1.5, 0]} color="#8fdcff" intensity={1.2} distance={6} decay={1.7} />
          </group>
        ))}
      </>}
    </group>
  );
}

/** Lógica por quadro: avisa o ecosStore (chegar na nascente, terminar a coleta, a Companion por intenção). */
function EcosTicker() {
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt; if (t.current < 0.2) return; t.current = 0;
    const st = useEcos.getState();
    st.setInVale(Math.hypot(companionFocus.x - VALE.x, companionFocus.z - VALE.z) < VALE.r + 8);
    st.tick();
  });
  useEffect(() => () => { work.on = false; }, []);
  return null;
}

export function Vale({ height }: { height: Height }) {
  // só existe na cena quando está perto (o resto do mundo segue igual)
  const near = useEcos((s) => s.inVale);
  return (
    <group>
      <EcosTicker />
      {near && <>
        <Stream />
        <ResourceNodes height={height} />
        <Spring height={height} />
        <Bridge height={height} />
      </>}
    </group>
  );
}
