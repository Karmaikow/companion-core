/**
 * Baús de drop no Companion World (modelos do pacote Quaternius): fechado dá pulinhos no lugar (tem algo dentro);
 * ao abrir, treme e "estoura" — vira o baú com ouro, com brilho e moedas saltando — e os itens aparecem em cima. O que
 * não coube na bolsa fica no baú aberto (com ouro) por 2 min; vazio, vira o baú sem ouro e some em 10 s.
 * A cor do tipo (comum, raro, lendário) fica no brilho do chão; Cristal Ápice dentro, um cristal flutuando.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { BudgetLight } from './lightBudget';
import { sharpTextures } from './fitTextures';
import { CHEST_TIERS, type CompanionWorld } from '@rules';
import { useChests, type ChestView } from '../chests/chestStore';
import { useGame } from '../store';
import { companionFocus } from './world';
import { hoverCursor } from '../ui/gameCursor';
import { gameVfx } from './vfx/engine';
import { burst } from './vfx/recipes';

const SHOW_R = 70;
const MODEL = { fechado: '/assets/baus/Chest_Closed.glb', aberto: '/assets/baus/Chest_Ingots.glb', vazio: '/assets/baus/Chest_Open.glb' } as const;
const COIN = '/assets/baus/Coin.glb';
const OPEN_MS = 900;
/** largura ÷ altura do modelo aberto (Chest_Open: 0,95 × 1,15): mantém o baú aberto do tamanho que sempre teve */
const OPEN_WIDTH_PER_HEIGHT = 0.95 / 1.15;

/**
 * Modelo do baú no tamanho do jogo, pé no chão. A medida é a LARGURA do corpo, que é a mesma nos três estados.
 * Antes era a altura: o baú aberto é mais alto (a tampa levantada), então o corpo dele saía menor e o fechado
 * parecia bem maior — o baú "encolhia" ao abrir.
 */
function useChestModel(url: string, width: number) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const o = sharpTextures(scene.clone(true));
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const k = width / Math.max(1e-3, s.x);
    o.scale.setScalar(k); o.position.set(-c.x * k, -b.min.y * k, -c.z * k);
    o.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return o;
  }, [scene, width]);
}

/** Moedas saltando do baú quando ele abre (1,2 s). */
function Coins({ start }: { start: number }) {
  const { scene } = useGLTF(COIN);
  const coins = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const o = scene.clone(true); const b = new THREE.Box3().setFromObject(o); const k = 0.07 / Math.max(1e-3, b.getSize(new THREE.Vector3()).x); o.scale.setScalar(k);
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
    return { o, vx: Math.cos(a) * (0.8 + Math.random() * 0.6), vz: Math.sin(a) * (0.8 + Math.random() * 0.6), vy: 2.6 + Math.random() * 1.2, spin: 6 + Math.random() * 6 };
  }), [scene]);
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = (performance.now() - start) / 1000;
    if (g.current) g.current.visible = t < 1.25;
    for (const c of coins) {
      const y = Math.max(0, 0.3 + c.vy * 0.7 * t - 4.9 * t * t);
      c.o.position.set(c.vx * 0.6 * t, y, c.vz * 0.6 * t); c.o.rotation.y = c.spin * t; c.o.rotation.x = c.spin * 0.5 * t;
    }
  });
  return <group ref={g}>{coins.map((c, i) => <primitive key={i} object={c.o} />)}</group>;
}

function ChestBody({ c, opening }: { c: ChestView; opening: number | null }) {
  // largura do corpo: o tamanho que o baú aberto (o menor) já tinha — os três estados ficam iguais a ele
  const size = (c.tier === 'lendario' ? 0.48 : c.tier === 'raro' ? 0.41 : 0.36) * OPEN_WIDTH_PER_HEIGHT;
  const closed = useChestModel(MODEL.fechado, size), gold = useChestModel(MODEL.aberto, size), empty = useChestModel(MODEL.vazio, size);
  const body = useRef<THREE.Group>(null);
  const popAt = useRef(0);
  const prev = useRef(c.state);
  useEffect(() => {
    if (prev.current === 'fechado' && c.state !== 'fechado') {
      popAt.current = performance.now();
      // brilho dourado e estrelinhas quando a tampa estoura
      const p = new THREE.Vector3(c.x, companionFocus.y + 0.35, c.z);
      burst(gameVfx, 'luz', p, '#ffd36b', 0.6, companionFocus.y);
    }
    prev.current = c.state;
  }, [c.state, c.x, c.z]);
  const seed = useMemo(() => (c.id.charCodeAt(0) + c.id.charCodeAt(1)) % 10, [c.id]);
  useFrame((s) => {
    const b = body.current; if (!b) return;
    const t = s.clock.elapsedTime + seed;
    b.position.set(0, 0, 0); b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1);
    if (c.state === 'fechado' && opening === null) {
      // pulinhos no lugar: um salto curto a cada ~1,6 s, com um tombo leve de lado
      const ph = (t % 1.6) / 1.6, hop = ph < 0.22 ? Math.sin((ph / 0.22) * Math.PI) : 0;
      b.position.y = hop * 0.08;
      b.rotation.z = hop * 0.12 * Math.sin(t * 7);
      const sq = ph < 0.05 || (ph > 0.22 && ph < 0.27) ? 0.9 : 1; b.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
    } else if (opening !== null) {
      // abrindo: treme cada vez mais e estica antes de estourar
      const k = Math.min(1, (performance.now() - opening) / OPEN_MS);
      b.rotation.z = Math.sin(t * 40) * 0.08 * k; b.rotation.x = Math.cos(t * 33) * 0.05 * k;
      b.scale.set(1 - k * 0.1, 1 + k * 0.18, 1 - k * 0.1);
    } else {
      const since = (performance.now() - popAt.current) / 1000;
      if (since < 0.45) { const e = 1 + Math.sin((since / 0.45) * Math.PI) * 0.22; b.scale.set(e, e, e); }
      if (c.state === 'vazio') {
        // some nos últimos 1,5 s
        const left = (c.expiresAt - Date.now()) / 1000;
        if (left < 1.5) b.scale.setScalar(Math.max(0.01, left / 1.5));
      }
    }
  });
  const model = c.state === 'fechado' ? closed : c.state === 'aberto' ? gold : empty;
  return (
    <group ref={body}>
      <primitive object={model} />
      {popAt.current > 0 && performance.now() - popAt.current < 1300 && <Coins start={popAt.current} />}
    </group>
  );
}

function Chest({ c, y }: { c: ChestView; y: number }) {
  const glow = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null);
  const color = CHEST_TIERS[c.tier].color;
  const opening = useChests((s) => (s.opening?.id === c.id ? s.opening.at : null));
  const reveal = useChests((s) => (s.reveal?.id === c.id ? s.reveal : null));
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (glow.current) glow.current.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    if (ring.current) (ring.current.material as THREE.MeshBasicMaterial).opacity = c.state === 'vazio' ? 0 : 0.35 + Math.sin(t * 2.4) * 0.15;
  });
  const pick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); useChests.getState().open(c.id); };
  const over = useRef(false);
  const hover = (on: boolean) => { over.current = on; hoverCursor(on ? 'pegar' : null); };
  // o baú some com o mouse em cima: a mão volta ao normal
  useEffect(() => () => { if (over.current) hoverCursor(null); }, []);
  const showReveal = reveal && Date.now() - reveal.at < 4500;
  return (
    <group position={[c.x, y, c.z]} onClick={pick} onPointerOver={(e) => { e.stopPropagation(); if (c.state !== 'vazio') hover(true); }} onPointerOut={() => hover(false)}>
      <Suspense fallback={null}><ChestBody c={c} opening={opening} /></Suspense>
      {/* brilho do tipo no chão */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><ringGeometry args={[0.3, 0.42, 32]} /><meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} toneMapped={false} /></mesh>
      {c.crystals > 0 && c.state === 'fechado' && <mesh ref={glow} position={[0, 0.65, 0]}><octahedronGeometry args={[0.09, 0]} /><meshBasicMaterial color="#b9a5ff" toneMapped={false} /></mesh>}
      {(c.tier !== 'comum' || c.crystals > 0) && c.state !== 'vazio' && <BudgetLight position={[0, 0.5, 0]} color={c.crystals ? '#b9a5ff' : color} intensity={0.9} distance={4} decay={1.8} />}
      {/* o que saiu do baú (alguns segundos) */}
      {showReveal && (
        <Html position={[0, 0.95, 0]} center distanceFactor={9} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className="chest-reveal">
            {reveal!.items.map((it, i) => <span key={i} className={it.kept ? 'kept' : ''} style={{ animationDelay: `${i * 90}ms` }}>+{it.qty} {it.label}{it.kept ? ' · ficou no baú' : ''}</span>)}
            {reveal!.lumes > 0 && <span className="lumes" style={{ animationDelay: `${reveal!.items.length * 90}ms` }}>+{reveal!.lumes} ✧ Lumes</span>}
            {reveal!.crystals > 0 && <span className="crystal">+{reveal!.crystals} Cristal Ápice</span>}
          </div>
        </Html>
      )}
      {/* aberto com itens que não couberam: o que ficou e o tempo */}
      {!showReveal && c.state === 'aberto' && c.drops.length > 0 && (
        <Html position={[0, 0.8, 0]} center distanceFactor={9} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className="chest-left">{c.drops.map((d) => `${d.qty}× ${d.label}`).join(' · ')}<small>some em {Math.max(0, Math.ceil((c.expiresAt - Date.now()) / 1000))} s</small></div>
        </Html>
      )}
      {/* área de clique generosa (toque) */}
      <mesh position={[0, 0.3, 0]} visible={false}><cylinderGeometry args={[0.6, 0.6, 0.7, 8]} /><meshBasicMaterial /></mesh>
    </group>
  );
}

export function WorldChests({ cw }: { cw: CompanionWorld }) {
  const chests = useChests((s) => s.chests);
  const online = useGame((s) => s.backend?.kind === 'online');
  useEffect(() => { if (online) void useChests.getState().refresh(); }, [online]);
  // redesenha a cada meio segundo (pulos, contagem e o sumiço do vazio)
  const t = useRef(0), [, setTick] = useState(0);
  useFrame((_, dt) => { t.current += dt; if (t.current < 0.25) return; t.current = 0; useChests.getState().tick(); setTick((n) => n + 1); });
  const now = Date.now();
  const near = chests.filter((c) => Math.hypot(c.x - companionFocus.x, c.z - companionFocus.z) < SHOW_R && c.expiresAt > now);
  return <group>{near.map((c) => <Chest key={c.id} c={c} y={cw.heightAt(c.x, c.z)} />)}</group>;
}

useGLTF.preload(MODEL.fechado); useGLTF.preload(MODEL.aberto); useGLTF.preload(MODEL.vazio); useGLTF.preload(COIN);
