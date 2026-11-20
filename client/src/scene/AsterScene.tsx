/**
 * Áster, a Cidade-Farol — os dois mapas fixos (regras em shared/rules/aster.ts):
 * - Arredores: a cidade vista de fora (o .GLB grande do ADM ou a muralha provisória) com o Cristal Ápice, os anéis de
 *   defesa (Labirinto Prismático, Trincheiras Rúnicas, Campos Cinzentos), quatro portões para dentro e o portal de
 *   volta ao Companion World, no fim da estrada do sul.
 * - Cidade: o interior montado no Estúdio da Cidade (peças .GLB e marcadores), no estado normal ou destruído.
 * Sem luzes pontuais (pesam em todo material a cada quadro): o brilho vem de materiais sem luz + bloom.
 */
import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Clone, Html, useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ToneMapping, SMAA } from '@react-three/postprocessing';
import { AdaptiveResolution } from './AdaptiveResolution';
import { SMAAPreset, ToneMappingMode } from 'postprocessing';
import { fitTextures } from './fitTextures';
import * as THREE from 'three';
import {
  gameTime, BRIDGE_DECKS, BRIDGE_HW, bridgeSpan, CITY_MARKERS, CITY_R, CITY_SCHOOLS, CRYSTAL_Y, CRATERS, DEAD_CRYSTALS, GATES, GATE_IDS, GATE_GAP, LABYRINTH_R, LABYRINTH_WALLS, MOAT_DEPTH, MOAT_IN, MOAT_OUT,
  OUT_ARRIVAL, OUT_GATE_ARRIVE, OUT_R, OUT_WALL_R, ROAD_W, TRENCH_R, TRENCH_RINGS, WATER_Y, gateAxisPoint, onBridge, outskirtsDirt, outskirtsGatePoint, outskirtsHeight,
  outskirtsPlaceName, roadDistance, visibleIn, SHOP_KINDS,
  type BiomePalette, type CityLayout, type CityMarker, type CityPiece, type CityState, type GateId, type WeatherKind,
} from '@rules';
import type { AppendageSpec } from './Appendages';
import type { CompanionModelFiles } from '../backend/types';
import { CompanionModel, type Gear, type Roam } from './CompanionModel';
import { CombatFx } from './Combat';
import { RemoteCompanions } from './RemoteCompanions';
import { WeatherFx } from './Weather';
import { AssetBoundary, CameraRig, ClickMarker, Sky, WindClock } from './Biome';
import { colliders, companionFocus, decks, groundDown, groundMove, groundPointer, moveRequest, requestMove, smooth, type Circle, type WorldShape } from './world';
import { hoverCursor } from '../ui/gameCursor';
import { bakeMeshField } from './meshField';
import { openShop } from '../ui/ShopPanel';
import { openSchool } from '../ui/SchoolPanel';
import { openEcosHouse } from '../ui/EcosHouse';
import { openTower } from '../ui/TowerPanel';
import { runeTexture } from './textures';
import { settings } from '../settings';

export type AsterMap = 'arredores' | 'cidade';
export type AsterTravel = { to: 'mundo' } | { to: 'cidade'; gate: GateId } | { to: 'arredores'; gate: GateId };

export interface AsterSceneProps {
  map: AsterMap;
  layout: CityLayout;
  state: CityState;
  /** onde o Companion aparece */
  arrive: { x: number; z: number };
  model: CompanionModelFiles;
  appendages?: AppendageSpec | null;
  speed?: number;
  gear?: Gear | null;
  weather?: { kind: WeatherKind; intensity: number };
  speech: string | null;
  burstKey: number;
  quality: 'high' | 'low';
  onTravel: (t: AsterTravel) => void;
  onPlace: (name: string) => void;
}

const C = (h: string) => new THREE.Color(h);
const SKY_OUT: BiomePalette = { grassLight: '#9a978c', grassDark: '#6c6a62', dirt: '#6b5f50', dirtDark: '#4a4239', rockSide: '#7d7a72', rockTop: '#a5a196', rockBottom: '#5d5a53', sky: '#f2c88f', fog: '#e3bd8f', skyNight: '#262a52', fogNight: '#363a66' };
const SKY_CITY: BiomePalette = { ...SKY_OUT, grassLight: '#b8b09c', grassDark: '#8f8a7e', sky: '#f6d4a2', fog: '#ebcfa6' };
const CRYSTAL = '#b9a5ff', CRYSTAL_CORE = '#e8f4ff', CRYSTAL_DEAD = '#5d5670';

const noise2 = (x: number, z: number) => 0.5 + 0.25 * Math.sin(x * 0.71 + z * 0.13) * Math.cos(z * 0.53 - x * 0.29) + 0.25 * Math.sin(x * 1.93 - z * 2.11);
const OUT_SHAPE: WorldShape = { seed: 7331, gap: 0, open: true, heightAt: outskirtsHeight, dirtAt: outskirtsDirt, noise: noise2 };
const CITY_SHAPE: WorldShape = { seed: 7332, gap: 0, open: true, heightAt: () => 0, dirtAt: () => 0, noise: noise2 };

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

/**
 * Camada própria para as placas (Html do drei): sem ela, o drei põe cada placa ao lado do canvas e, ao trocar de
 * mapa, tenta tirá-la de um lugar onde ela já não está ("removeChild… not a child").
 */
const LabelLayer = createContext<React.MutableRefObject<HTMLElement> | null>(null);
function Label({ y, distanceFactor, children }: { y: number; distanceFactor: number; children: React.ReactNode }) {
  const layer = useContext(LabelLayer);
  return <Html position={[0, y, 0]} center distanceFactor={distanceFactor} portal={layer ?? undefined} style={{ pointerEvents: 'none' }}>{children}</Html>;
}

function walkHandlers() {
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => groundDown(e, settings().click === 'atacar' ? 2 : 0),
    onPointerMove: (e: ThreeEvent<PointerEvent>) => groundMove(e),
    onContextMenu: (e: ThreeEvent<MouseEvent>) => { if (settings().click === 'atacar') e.nativeEvent.preventDefault(); },
  };
}

/** Várias cópias de uma geometria numa malha instanciada (cada matriz é uma cópia). */
function Instanced({ geometry, material, matrices, shadows = false }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; shadows?: boolean }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.count = matrices.length;
    m.castShadow = shadows; m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    return m;
  }, [geometry, material, matrices, shadows]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}
const mat4 = (x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number, tiltX = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, 0)), new THREE.Vector3(sx, sy, sz));

/** Usa a lista de colisores enquanto o componente existe. */
function useColliders(key: string, list: Circle[]) {
  useEffect(() => { colliders.set(key, list); return () => { colliders.delete(key); }; }, [key, list]);
}

// ---------------------------------------------------------------------------
// Chão dos arredores (uma malha só, feita uma vez)
// ---------------------------------------------------------------------------

let outskirtsGeo: THREE.BufferGeometry | null = null;
function outskirtsGeometry() {
  if (outskirtsGeo) return outskirtsGeo;
  const R = OUT_R + 30, step = 2, N = Math.ceil((R * 2) / step);
  const V = (N + 1) * (N + 1), pos = new Float32Array(V * 3), col = new Float32Array(V * 3), idx = new Uint32Array(N * N * 6);
  const H = new Float32Array(V);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = outskirtsHeight(-R + i * step, -R + j * step);
  const pave = C('#a59d8d'), road = C('#9a8d74'), lab = C('#cfd2d8'), labD = C('#b5b9c3'), trench = C('#5f564b'), mud = C('#40382f'),
    ash = C('#8b8a83'), ashD = C('#6c6b65'), crater = C('#3e3a36'), hill = C('#787469'), a = new THREE.Color(), b = new THREE.Color();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const v = j * (N + 1) + i, x = -R + i * step, z = -R + j * step, r = Math.hypot(x, z), k = noise2(x * 0.3, z * 0.3);
    pos.set([x, H[v], z], v * 3);
    // anel por anel, misturando na borda
    a.copy(ashD).lerp(ash, k);
    a.lerp(b.copy(trench).lerp(ash, 0.35 + k * 0.3), 1 - smooth(TRENCH_R - 4, TRENCH_R + 8, r));
    a.lerp(b.copy(labD).lerp(lab, k), 1 - smooth(LABYRINTH_R - 3, LABYRINTH_R + 5, r));
    a.lerp(pave, 1 - smooth(OUT_WALL_R + 3, OUT_WALL_R + 7, r));
    a.lerp(hill, smooth(OUT_R - 24, OUT_R, r));
    const d = outskirtsDirt(x, z);
    if (d > 0) {
      const onRoad = roadDistance(x, z) < ROAD_W + 1 && r > OUT_WALL_R;
      a.lerp(onRoad ? road : CRATERS.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * 1.3) ? crater : mud, d * 0.85);
    }
    col.set([a.r, a.g, a.b], v * 3);
  }
  let t = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const p = j * (N + 1) + i, q = p + N + 1; idx.set([p, q, p + 1, p + 1, q, q + 1], t); t += 6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  outskirtsGeo = g;
  return g;
}

function OutskirtsGround({ walkable = true }: { walkable?: boolean }) {
  const geo = useMemo(outskirtsGeometry, []);
  return <mesh geometry={geo} receiveShadow {...(walkable ? walkHandlers() : {})}><meshLambertMaterial vertexColors /></mesh>;
}

/** Os arredores inteiros (chão, cidade vista de fora, anéis de defesa, portal de volta) — o jogo e o Estúdio usam. */
export function OutskirtsView({ layout, state, high, walkable = true, labels = true }: { layout: CityLayout; state: CityState; high: boolean; walkable?: boolean; /** placas flutuantes (o Estúdio desliga) */ labels?: boolean }) {
  return (
    <>
      <OutskirtsGround walkable={walkable} />
      <CityFromOutside layout={layout} state={state} high={high} labels={labels} />
      <Labyrinth high={high} />
      <TrenchesAndFields dead={state === 'destruida'} />
      <RunePortal x={OUT_ARRIVAL.x} z={OUT_ARRIVAL.z} y={outskirtsHeight(OUT_ARRIVAL.x, OUT_ARRIVAL.z)} color="#ffd98a" label={labels ? 'Estrada para Áster · Companion World' : undefined} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Cristal Ápice
// ---------------------------------------------------------------------------

function ApexCrystal({ y, size = 1, dead }: { y: number; size?: number; dead: boolean }) {
  const g = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (g.current) { g.current.rotation.y = t * (dead ? 0.02 : 0.15); g.current.position.y = y + (dead ? 0 : Math.sin(t * 0.7) * 0.6 * size); }
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(t * 1.3) * 0.05;
  });
  const tint = dead ? C(CRYSTAL_DEAD) : C(CRYSTAL).multiplyScalar(1.5);
  return (
    <>
      <group ref={g} position={[0, y, 0]} scale={size}>
        <mesh scale={[2.4, 6.5, 2.4]}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={tint} toneMapped={false} transparent opacity={dead ? 0.85 : 0.92} /></mesh>
        {!dead && <mesh scale={[1.1, 4.2, 1.1]}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={C(CRYSTAL_CORE).multiplyScalar(1.8)} toneMapped={false} /></mesh>}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[Math.cos(i * 1.257) * 3, -2 + (i % 2) * 2.4, Math.sin(i * 1.257) * 3]} rotation={[0.4 * (i % 2 ? 1 : -1), i, 0.3]} scale={[0.6, 2, 0.6]}>
            <octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={tint} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {!dead && (
        <mesh ref={beam} position={[0, y + 70 * size, 0]}>
          <cylinderGeometry args={[1.2 * size, 3 * size, 140 * size, 24, 1, true]} />
          <meshBasicMaterial color={tint} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Portais (círculo de runas no chão; `arch` só sobe o rótulo — o véu de luz saiu, destoava da cidade)
// ---------------------------------------------------------------------------

function RunePortal({ x, z, y = 0, color, label, rot = 0, arch = false }: { x: number; z: number; y?: number; color: string; label?: string; rot?: number; arch?: boolean }) {
  const runes = useMemo(runeTexture, []);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ring.current) ring.current.rotation.z += dt * 0.25; });
  const tint = useMemo(() => C(color).multiplyScalar(1.6), [color]);
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <circleGeometry args={[2.2, 48]} />
        <meshBasicMaterial map={runes} color={tint} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {label && <Label y={arch ? 5.8 : 3} distanceFactor={9}><div className="aster-label">{label}</div></Label>}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Cidade vista de fora (muralha provisória ou o .GLB do ADM)
// ---------------------------------------------------------------------------

const gateAngle = (g: GateId) => Math.atan2(GATES[g].dz, GATES[g].dx);
const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const nearGate = (a: number, r: number, gap: number) => GATE_IDS.some((g) => angDist(a, gateAngle(g)) * r < gap);

/** A cidade provisória vista de fora; `walls`/`inner` somem conforme o ADM monta a muralha e os prédios dele. */
function ProceduralCity({ dead, high, walls = true, inner = true }: { dead: boolean; high: boolean; walls?: boolean; inner?: boolean }) {
  const parts = useMemo(() => {
    const wall: THREE.Matrix4[] = [], towers: THREE.Matrix4[] = [], roofs: THREE.Matrix4[] = [], spires: THREE.Matrix4[] = [], domes: THREE.Matrix4[] = [];
    const R = OUT_WALL_R, seg = 5;
    const n = walls ? Math.floor((2 * Math.PI * R) / seg) : 0;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * (2 * Math.PI / n);
      if (nearGate(a, R, GATE_GAP)) continue;
      const broken = dead && (i * 7) % 11 === 0;
      wall.push(mat4(Math.cos(a) * R, broken ? 2.5 : 5, Math.sin(a) * R, -a + Math.PI / 2, seg * 1.02, broken ? 5 : 10, 3));
    }
    for (let k = 0; k < (walls ? 16 : 0); k++) {
      const a = k * (Math.PI / 8) + Math.PI / 16, x = Math.cos(a) * R, z = Math.sin(a) * R;
      const h = dead && k % 3 === 0 ? 7 : 15;
      towers.push(mat4(x, h / 2, z, 0, 3.4, h, 3.4));
      if (!(dead && k % 3 === 0)) roofs.push(mat4(x, h + 3, z, 0, 4, 6, 4));
    }
    if (walls) for (const g of GATE_IDS) for (const s of [-1, 1]) {
      const a = gateAngle(g) + (s * (GATE_GAP + 2)) / R, x = Math.cos(a) * R, z = Math.sin(a) * R;
      towers.push(mat4(x, 9, z, 0, 4, 18, 4)); roofs.push(mat4(x, 21, z, 0, 4.6, 6, 4.6));
    }
    // silhueta do interior: casas, torres e cúpulas (só para ser lida de fora)
    for (let k = 0; k < (inner ? (high ? 90 : 50) : 0); k++) {
      const a = (k * 2.39996) % (Math.PI * 2), r = 14 + ((k * 37) % 41), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const tall = k % 7 === 0, h = tall ? 16 + (k % 5) * 3 : 5 + (k % 4) * 2;
      if (dead && k % 2 === 0) { spires.push(mat4(x, 1.5, z, k, 5, 3, 4)); continue; }
      spires.push(mat4(x, h / 2, z, k, tall ? 3 : 5 + (k % 3), h, tall ? 3 : 4 + (k % 2) * 2));
      if (tall) roofs.push(mat4(x, h + 3.5, z, 0, 3.4, 7, 3.4));
      else if (k % 5 === 0) domes.push(mat4(x, h, z, 0, 3, 3, 3));
    }
    return { wall, towers, roofs, spires, domes };
  }, [dead, high, walls, inner]);
  const geo = useMemo(() => ({ box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.56, 1, 10), cone: new THREE.ConeGeometry(0.5, 1, 10), dome: new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2) }), []);
  const mat = useMemo(() => ({
    stone: new THREE.MeshLambertMaterial({ color: dead ? '#8a8378' : '#cfc6b2' }),
    dark: new THREE.MeshLambertMaterial({ color: dead ? '#6d665d' : '#b3a991' }),
    roof: new THREE.MeshLambertMaterial({ color: dead ? '#4a3f45' : '#5b6fb0' }),
    dome: new THREE.MeshLambertMaterial({ color: dead ? '#5c5560' : '#8aa0d8' }),
  }), [dead]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow><circleGeometry args={[OUT_WALL_R, 64]} /><meshLambertMaterial color={dead ? '#6f6a62' : '#b4ab98'} /></mesh>
      <Instanced geometry={geo.box} material={mat.stone} matrices={parts.wall} shadows={high} />
      <Instanced geometry={geo.cyl} material={mat.dark} matrices={parts.towers} shadows={high} />
      <Instanced geometry={geo.cone} material={mat.roof} matrices={parts.roofs} />
      <Instanced geometry={geo.box} material={mat.dark} matrices={parts.spires} shadows={high} />
      <Instanced geometry={geo.dome} material={mat.dome} matrices={parts.domes} />
    </group>
  );
}

/** O .GLB grande do ADM; o cristal flutua acima do ponto mais alto dele. */
function ExteriorModel({ layout, dead }: { layout: CityLayout; dead: boolean }) {
  const { scene } = useGLTF(layout.exterior.url!);
  const top = useMemo(() => new THREE.Box3().setFromObject(fitTextures(scene, 1024)).max.y, [scene]);
  return (
    <group>
      <Clone object={scene} position={[0, layout.exterior.y, 0]} rotation={[0, layout.exterior.rot, 0]} scale={layout.exterior.scale} castShadow receiveShadow />
      <ApexCrystal y={layout.exterior.y + top * layout.exterior.scale + 8} size={1.4} dead={dead} />
    </group>
  );
}

function CityFromOutside({ layout, state, high, labels = true }: { layout: CityLayout; state: CityState; high: boolean; labels?: boolean }) {
  const dead = state === 'destruida';
  // a muralha bloqueia em volta; nos portões, uma barreira um pouco para dentro (o portal leva antes de entrar)
  const ring = useMemo(() => {
    const out: Circle[] = [];
    for (let a = 0; a < Math.PI * 2; a += 1.8 / OUT_WALL_R) {
      const r = nearGate(a, OUT_WALL_R, GATE_GAP) ? OUT_WALL_R - 5 : OUT_WALL_R;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 1.6 });
    }
    return out;
  }, []);
  useColliders('aster-wall', ring);
  // fosso de fora: só se passa pelas pontes
  useColliders('aster-moat', useMemo(() => moatColliders(MOAT_OUT[1] + 0.8, 'fora', Infinity), []));
  useBridgeDecks(layout.wall.bridgeDeck, 'fora');
  // a cidade montada no Estúdio aparece de fora também: muralha por trechos e, se já houver, os prédios
  const pieces = useMemo(() => layout.pieces.filter((p) => visibleIn(p.show, state)), [layout, state]);
  const hasWall = pieces.some((p) => p.wall), hasBuildings = pieces.some((p) => !p.wall), hasBridge = pieces.some((p) => p.wall === 'ponte');
  const crystals = useMemo(() => layout.markers.filter((m) => m.kind === 'cristal' && visibleIn(m.show, state)), [layout, state]);
  return (
    <group>
      {layout.exterior.url
        ? <AssetBoundary><Suspense fallback={<ProceduralCity dead={dead} high={high} />}><ExteriorModel layout={layout} dead={dead} /></Suspense></AssetBoundary>
        : <>
          <ProceduralCity dead={dead} high={high} walls={!hasWall} inner={!hasBuildings} />
          {hasBuildings ? crystals.map((m) => <MarkerView key={m.id} m={m} dead={dead} labels={false} />) : <ApexCrystal y={46} size={1.4} dead={dead} />}
          {pieces.map((p) => <AssetBoundary key={p.id}><Suspense fallback={null}><Piece p={p} /></Suspense></AssetBoundary>)}
        </>}
      <WaterRing r0={MOAT_OUT[0] - 1.5} r1={MOAT_OUT[1] + 1.5} color={layout.ground.water} />
      {!hasBridge && <PlaceholderBridges deck={layout.wall.bridgeDeck} side="fora" />}
      {GATE_IDS.map((g) => { const p = outskirtsGatePoint(g, 1); return <RunePortal key={g} x={p.x} z={p.z} color="#9fd8ff" arch label={labels ? GATES[g].label : undefined} rot={-gateAngle(g) + Math.PI / 2} />; })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Fossos e pontes
// ---------------------------------------------------------------------------

const axisDist = (x: number, z: number) => Math.min(Math.abs(x), Math.abs(z));

/** Água de um fosso (anel), com um brilho que corre devagar. */
function WaterRing({ r0, r1, color, walkable }: { r0: number; r1: number; color: string; walkable?: boolean }) {
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9 }), []);
  const glow = useMemo(() => new THREE.Color(color).multiplyScalar(0.3), [color]);
  useEffect(() => { mat.color.set(color); }, [mat, color]);
  useFrame(() => { mat.emissive.copy(glow).multiplyScalar(1 + Math.sin(performance.now() / 1400) * 0.12); });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} material={mat} {...(walkable ? walkHandlers() : {})}>
      <ringGeometry args={[r0, r1, 160, 1]} />
    </mesh>
  );
}

/** Ponte provisória de pedra (até o ADM escolher o modelo da ponte no Estúdio). */
function PlaceholderBridges({ deck, side }: { deck: number; side: 'fora' | 'dentro' }) {
  const mats = useMemo(() => {
    const floor: THREE.Matrix4[] = [], rail: THREE.Matrix4[] = [];
    for (const d of BRIDGE_DECKS.filter((b) => b.side === side)) {
      const [from, to] = bridgeSpan(d), len = to - from, mid = (from + to) / 2, rot = -Math.atan2(GATES[d.gate].dz, GATES[d.gate].dx);
      const c = gateAxisPoint(d.gate, mid);
      floor.push(mat4(c.x, deck - 0.35, c.z, rot, len, 0.7, d.hw * 2));
      for (const t of [-1, 1]) { const p = gateAxisPoint(d.gate, mid, t * (d.hw - 0.2)); rail.push(mat4(p.x, deck + 0.35, p.z, rot, len, 0.7, 0.4)); }
    }
    return { floor, rail };
  }, [deck, side]);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#cbbf9f' }), []);
  return <><Instanced geometry={geo} material={mat} matrices={mats.floor} shadows /><Instanced geometry={geo} material={mat} matrices={mats.rail} shadows /></>;
}

/** Bordas da água (não dá para cair no fosso) e os parapeitos de cada ponte. */
function moatColliders(edgeR: number, side: 'fora' | 'dentro', reach: number): Circle[] {
  const out: Circle[] = [];
  for (let a = 0; a < Math.PI * 2; a += 1.4 / edgeR) {
    const x = Math.cos(a) * edgeR, z = Math.sin(a) * edgeR;
    if (axisDist(x, z) < BRIDGE_HW + 0.6) continue;
    out.push({ x, z, r: 0.9 });
  }
  for (const d of BRIDGE_DECKS.filter((b) => b.side === side))
    for (let r = d.from; r <= Math.min(d.to, reach); r += 0.9) for (const t of [-1, 1]) { const p = gateAxisPoint(d.gate, r, t * (d.hw + 0.45)); out.push({ ...p, r: 0.45 }); }
  return out;
}

/** Modelos de ponte na cena (o piso sai deles) + cache espacial em grade de 25 cm para evitar raycast repetido por quadro. */
const bridgeObjs = new Map<string, THREE.Object3D>();
const bridgeHeightCache = new Map<string, number>();
const deckRay = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), rayFrom = new THREE.Vector3();

/**
 * Liga o piso das pontes enquanto a cena existe: em cima de uma ponte, um raio de cima para baixo acha a superfície
 * do modelo (rampa e arco valem); sem modelo (ou se o raio não acha nada), vale a altura fixa `deck`.
 */
function useBridgeDecks(deck: number, side: 'fora' | 'dentro') {
  useEffect(() => {
    bridgeHeightCache.clear();
    decks.at = (x, z) => {
      if (!onBridge(x, z, side)) return null;
      const cellKey = `${side}:${Math.round(x * 4)},${Math.round(z * 4)}`;
      const cached = bridgeHeightCache.get(cellKey);
      if (cached !== undefined) return cached;
      let y = deck;
      if (bridgeObjs.size) {
        rayFrom.set(x, 30, z); deckRay.set(rayFrom, DOWN); deckRay.far = 40;
        // a superfície mais alta abaixo de ~3 m acima da água (ignora arcos e enfeites altos por cima)
        const hit = deckRay.intersectObjects([...bridgeObjs.values()], true).find((h) => h.point.y < WATER_Y + 6);
        if (hit) y = hit.point.y;
      }
      if (bridgeHeightCache.size > 4096) bridgeHeightCache.clear();
      bridgeHeightCache.set(cellKey, y);
      return y;
    };
    return () => { decks.at = null; };
  }, [deck, side]);
}

// ---------------------------------------------------------------------------
// Anéis de defesa
// ---------------------------------------------------------------------------

function Labyrinth({ high }: { high: boolean }) {
  const { walls, glow, mirrors, ring } = useMemo(() => {
    const walls: THREE.Matrix4[] = [], glow: THREE.Matrix4[] = [], mirrors: THREE.Matrix4[] = [], ring: Circle[] = [];
    LABYRINTH_WALLS.forEach((w, i) => {
      const y = outskirtsHeight(w.x, w.z);
      walls.push(mat4(w.x, y + 1.6, w.z, w.rot, w.len, 3.2, 1.1));
      glow.push(mat4(w.x, y + 3.25, w.z, w.rot, w.len * 0.96, 0.12, 0.5));
      if (i % 4 === 0) mirrors.push(mat4(w.x + Math.cos(w.rot) * w.len * 0.5, y + 3.2, w.z - Math.sin(w.rot) * w.len * 0.5, w.rot, 0.5, 6.4, 1.6));
      for (let s = -0.5; s <= 0.5; s += 0.25) ring.push({ x: w.x + Math.cos(w.rot) * w.len * s, z: w.z - Math.sin(w.rot) * w.len * s, r: 0.95 });
    });
    return { walls, glow, mirrors, ring };
  }, []);
  useColliders('aster-labyrinth', ring);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => ({
    stone: new THREE.MeshLambertMaterial({ color: '#dfe1e8' }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe6ff').multiplyScalar(1.4), toneMapped: false }),
    mirror: new THREE.MeshBasicMaterial({ color: new THREE.Color('#d9f2ff').multiplyScalar(1.25), toneMapped: false, transparent: true, opacity: 0.85 }),
  }), []);
  return (
    <group>
      <Instanced geometry={geo} material={mat.stone} matrices={walls} shadows={high} />
      <Instanced geometry={geo} material={mat.glow} matrices={glow} />
      <Instanced geometry={geo} material={mat.mirror} matrices={mirrors} />
    </group>
  );
}

function TrenchesAndFields({ dead }: { dead: boolean }) {
  const { runes, crystals } = useMemo(() => {
    const runes: THREE.Matrix4[] = [], crystals: THREE.Matrix4[] = [];
    for (const t of TRENCH_RINGS) for (const side of [-4.6, 4.6]) {
      const r = t + side, n = Math.floor((2 * Math.PI * r) / 11);
      for (let i = 0; i < n; i++) {
        const a = (i + (side > 0 ? 0.5 : 0)) * (2 * Math.PI / n), x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (roadDistance(x, z) < ROAD_W + 1.5) continue;
        runes.push(mat4(x, outskirtsHeight(x, z) + 0.45, z, -a, 0.7, 0.9, 0.7));
      }
    }
    for (const c of DEAD_CRYSTALS) crystals.push(mat4(c.x, outskirtsHeight(c.x, c.z) + c.h * 0.4, c.z, c.rot, 0.45 * c.h * 0.5, c.h, 0.45 * c.h * 0.5, c.tilt));
    return { runes, crystals };
  }, []);
  const ring = useMemo(() => DEAD_CRYSTALS.filter((c) => c.h > 2).map((c) => ({ x: c.x, z: c.z, r: 0.5 })), []);
  useColliders('aster-crystals', ring);
  const geo = useMemo(() => ({ rune: new THREE.BoxGeometry(1, 1, 1), shard: new THREE.OctahedronGeometry(1, 0) }), []);
  const mat = useMemo(() => ({
    rune: new THREE.MeshBasicMaterial({ color: new THREE.Color(dead ? '#7a3b2c' : '#ff9a5c').multiplyScalar(dead ? 1 : 1.3), toneMapped: false }),
    shard: new THREE.MeshLambertMaterial({ color: '#4d4760', emissive: '#1d1830', flatShading: true }),
  }), [dead]);
  return (
    <group>
      <Instanced geometry={geo.rune} material={mat.rune} matrices={runes} />
      <Instanced geometry={geo.shard} material={mat.shard} matrices={crystals} shadows />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Cidade por dentro
// ---------------------------------------------------------------------------

/** Chão da cidade: o miolo até o fosso de dentro e o anel sob a muralha; no meio, o fosso com água e barrancos. */
export function CityGround({ layout, walkable = true }: { layout: CityLayout; walkable?: boolean }) {
  const geos = useMemo(() => {
    const base = C(layout.ground.color), plaza = C(layout.ground.plaza), c = new THREE.Color();
    const paint = (g: THREE.BufferGeometry) => {
      const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y);
        c.copy(base).lerp(plaza, 1 - smooth(16, 22, r)).multiplyScalar(0.92 + noise2(x * 0.4, y * 0.4) * 0.16);
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.rotateX(-Math.PI / 2);
      return g;
    };
    return [paint(new THREE.CircleGeometry(MOAT_IN[0], 128)), paint(new THREE.RingGeometry(MOAT_IN[1], CITY_R + 45, 128, 2))];
  }, [layout.ground.color, layout.ground.plaza]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const bank = useMemo(() => new THREE.MeshLambertMaterial({ color: '#8d8573', side: THREE.DoubleSide }), []);
  return (
    <group>
      {geos.map((g, i) => <mesh key={i} geometry={g} receiveShadow {...(walkable ? walkHandlers() : {})}><meshLambertMaterial vertexColors /></mesh>)}
      {/* fosso de dentro: barrancos de pedra, fundo escuro e a água */}
      {MOAT_IN.map((r) => <mesh key={r} position={[0, -MOAT_DEPTH / 2, 0]} material={bank}><cylinderGeometry args={[r, r, MOAT_DEPTH, 160, 1, true]} /></mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -MOAT_DEPTH, 0]}><ringGeometry args={[MOAT_IN[0], MOAT_IN[1], 160, 1]} /><meshLambertMaterial color="#1d3440" /></mesh>
      <WaterRing r0={MOAT_IN[0]} r1={MOAT_IN[1]} color={layout.ground.water} walkable={walkable} />
    </group>
  );
}

/** Muralha por dentro (provisória: aparece até o ADM montar a dele), com aberturas nos portões. */
export function InnerWall({ layout, dead }: { layout: CityLayout; dead: boolean }) {
  const gates = layout.markers.filter((m) => m.kind === 'portao').map((m) => Math.atan2(m.z, m.x));
  const key = gates.map((a) => a.toFixed(2)).join(',');
  // sem colisão: o raio andável (CITY_R) já para o Companion antes dela
  const mats = useMemo(() => {
    const R = OUT_WALL_R, seg = 5, n = Math.floor((2 * Math.PI * R) / seg), out: THREE.Matrix4[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * (2 * Math.PI / n);
      if (gates.some((g) => angDist(a, g) * R < GATE_GAP)) continue;
      out.push(mat4(Math.cos(a) * R, dead && i % 9 === 0 ? 2 : 4.5, Math.sin(a) * R, -a + Math.PI / 2, seg * 1.02, dead && i % 9 === 0 ? 4 : 9, 2.6));
    }
    return out;
  }, [key, dead]); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: dead ? '#857e73' : '#cbc2ad' }), [dead]);
  return <Instanced geometry={geo} material={mat} matrices={mats} shadows />;
}

/**
 * Clique (botão de andar) que vira outra ordem: não deixa o chão de trás receber o mesmo clique — e anula o clique
 * de andar se o chão estava na frente (a base do prédio rente ao chão).
 */
const pickHandlers = (onPick?: () => void) => onPick ? {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    if (groundPointer.down) { clearTimeout(groundPointer.down.timer); groundPointer.down = null; }
    onPick();
  },
  onPointerOver: () => hoverCursor('apontar'),
  onPointerOut: () => hoverCursor(null),
} : {};

const nrm = new THREE.Vector3();
/** O ponto clicado é piso do prédio (calçada, degrau, tablado): face virada para cima e baixa. */
const isFloorHit = (e: ThreeEvent<PointerEvent>, base: number) => {
  if (!e.face || e.point.y > base + 1.2) return false;
  nrm.copy(e.face.normal).transformDirection(e.object.matrixWorld);
  return nrm.y > 0.7;
};
const setEnterCursor = (on: boolean) => hoverCursor(on ? 'apontar' : null);

/**
 * Prédio de loja/escola: o clique nas paredes, no telhado e na fachada leva até a porta e abre o painel; no piso
 * (calçada, degraus) é um clique de andar comum. Com o mouse em cima, o cursor vira o de "entrar".
 */
const buildingHandlers = (base: number, onPick?: () => void) => {
  const walk = walkHandlers();
  if (!onPick) return walk;
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (isFloorHit(e, base)) { walk.onPointerDown(e); return; }
      if (e.nativeEvent.button !== 0) return;
      e.stopPropagation();
      if (groundPointer.down) { clearTimeout(groundPointer.down.timer); groundPointer.down = null; }
      onPick();
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      setEnterCursor(!isFloorHit(e, base));
      walk.onPointerMove(e);
    },
    onPointerOut: () => setEnterCursor(false),
    onContextMenu: walk.onContextMenu,
  };
};

/** Prédio (não é muralha e tem colisão): a colisão sai da malha dele em vez do círculo (ver meshField). */
export const meshSolid = (p: CityPiece) => !p.wall && p.solid >= 1.5;

export function Piece({ p, onPick, walkable = false }: { p: CityPiece; onPick?: () => void; walkable?: boolean }) {
  const { scene } = useGLTF(p.url);
  useMemo(() => fitTextures(scene, 1024), [scene]);
  const box = useRef<THREE.Object3D | null>(null);
  // pontes e portões: o piso por onde se anda sai do próprio modelo (ver useBridgeDecks)
  const reg = (o: THREE.Object3D | null) => {
    box.current = o;
    if (p.wall !== 'ponte' && p.wall !== 'portao') return;
    if (o) bridgeObjs.set(p.id, o); else bridgeObjs.delete(p.id);
    bridgeHeightCache.clear();
  };
  const mesh = walkable && meshSolid(p);
  useEffect(() => {
    if (!mesh || !box.current) return;
    return bakeMeshField(p.id, [p.url, p.x, p.y, p.z, p.rot, p.scale].join('|'), box.current, p.y);
  }, [mesh, scene, p.id, p.url, p.x, p.y, p.z, p.rot, p.scale]);
  // prédio: o piso dele recebe o clique de andar; o resto abre a loja
  const handlers = mesh ? buildingHandlers(p.y, onPick) : pickHandlers(onPick);
  return <group ref={reg} {...handlers}><Clone object={scene} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]} scale={p.scale} castShadow receiveShadow /></group>;
}

/** Loja pedida pelo clique (prédio ou placa): o Companion anda até a porta (o marcador) e o modal abre na chegada. */
const shopWalk = { id: '', move: 0 };
function goShop(m: CityMarker) { requestMove(new THREE.Vector3(m.x, 0, m.z)); shopWalk.id = m.id; shopWalk.move = moveRequest.id; }
/** Distância da porta (marcador) até onde um prédio conta como daquela loja. */
const SHOP_PICK_R = 14;
/** Marcadores que abrem um painel na chegada (lojas, escolas, a Casa dos Ecos e a Torre Central). */
const opens = (m: CityMarker) => m.kind === 'loja' || m.kind === 'escola' || m.kind === 'ecos' || m.kind === 'cristal';

export function MarkerView({ m, dead, labels = true, sign = true, onPick }: { m: CityMarker; dead: boolean; labels?: boolean; sign?: boolean; onPick?: () => void }) {
  const info = CITY_MARKERS[m.kind];
  // só o cristal: a torre é um modelo do ADM
  if (m.kind === 'cristal') return <group position={[m.x, 0, m.z]} {...pickHandlers(onPick)}><ApexCrystal y={m.y ?? CRYSTAL_Y} size={0.8} dead={dead} />{labels && <Label y={3.4} distanceFactor={8}><div className="aster-label"><span aria-hidden>◆</span> Torre Central{dead ? ' · reconstruir' : ''}</div></Label>}</group>;
  if (m.kind === 'portao') return <RunePortal x={m.x} z={m.z} color="#9fd8ff" arch rot={-Math.atan2(m.z, m.x) + Math.PI / 2} label={labels ? `${m.name} · sair para os arredores` : undefined} />;
  if (m.kind === 'chegada') return null;
  const icon = m.kind === 'loja' && m.shop ? SHOP_KINDS[m.shop].icon : m.kind === 'escola' && m.school ? CITY_SCHOOLS[m.school].icon : info.icon;
  return (
    <group position={[m.x, 0, m.z]} {...pickHandlers(onPick)}>
      {sign && <>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.07, 0.09, 2.8, 6]} /><meshLambertMaterial color="#5b4a36" /></mesh>
        <mesh position={[0.45, 2.3, 0]}><planeGeometry args={[0.85, 0.6]} /><meshBasicMaterial color={info.color} side={THREE.DoubleSide} /></mesh>
      </>}
      {labels && <Label y={3.4} distanceFactor={8}><div className="aster-label"><span aria-hidden>{icon}</span> {m.name}</div></Label>}
    </group>
  );
}

function CityInside({ layout, state }: { layout: CityLayout; state: CityState }) {
  const dead = state === 'destruida';
  const pieces = useMemo(() => layout.pieces.filter((p) => visibleIn(p.show, state)), [layout, state]);
  const markers = useMemo(() => layout.markers.filter((m) => visibleIn(m.show, state)), [layout, state]);
  // prédios colidem pela malha (Piece); o círculo fica para o resto (árvores, estátuas)
  const solid = useMemo(() => pieces.filter((p) => p.solid > 0 && !meshSolid(p)).map((p) => ({ x: p.x, z: p.z, r: p.solid })), [pieces]);
  useColliders('aster-pieces', solid);
  // fosso de dentro: o Companion vai até o começo da ponte (o portal de dentro fica ali)
  useColliders('aster-moat-in', useMemo(() => moatColliders(MOAT_IN[0] - 0.7, 'dentro', CITY_R + 1), []));
  useBridgeDecks(layout.wall.bridgeDeck, 'dentro');
  // prédio de loja/escola = peça (fora da muralha) perto de um marcador "loja" ou "escola": o clique leva até a porta
  const shops = useMemo(() => markers.filter(opens), [markers]);
  const shopOf = (p: CityPiece) => {
    if (p.wall || !shops.length) return undefined;
    const near = shops.map((m) => ({ m, d: Math.hypot(m.x - p.x, m.z - p.z) })).sort((a, b) => a.d - b.d)[0];
    return near.d <= SHOP_PICK_R ? () => goShop(near.m) : undefined;
  };
  // marcador com prédio perto: a loja abre pelo clique no prédio, e o marcador vira só o nome (sem a placa)
  const hasBuilding = (m: CityMarker) => m.kind !== 'cristal' && opens(m) && pieces.some((p) => !p.wall && Math.hypot(m.x - p.x, m.z - p.z) <= SHOP_PICK_R);
  return (
    <group>
      <CityGround layout={layout} />
      {!pieces.some((p) => p.wall === 'ponte') && <PlaceholderBridges deck={layout.wall.bridgeDeck} side="dentro" />}
      {!pieces.some((p) => p.wall) && <InnerWall layout={layout} dead={dead} />}
      {pieces.map((p) => <AssetBoundary key={p.id}><Suspense fallback={null}><Piece p={p} onPick={shopOf(p)} walkable /></Suspense></AssetBoundary>)}
      {markers.map((m) => { const b = hasBuilding(m); return <MarkerView key={m.id} m={m} dead={dead} sign={!b} onPick={opens(m) && !b ? () => goShop(m) : undefined} />; })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Lógica: lugar no brasão e as passagens (portões, portal de volta)
// ---------------------------------------------------------------------------

function AsterLogic({ map, layout, state, onTravel, onPlace }: { map: AsterMap; layout: CityLayout; state: CityState; onTravel: (t: AsterTravel) => void; onPlace: (n: string) => void }) {
  const props = useRef({ onTravel, onPlace, layout, state }); props.current = { onTravel, onPlace, layout, state };
  // cada passagem só dispara depois de o Companion se afastar dela (quem chega em cima de um portão não volta na hora)
  const st = useRef({ t: 0, name: '', away: new Map<string, boolean>(), done: false });
  useFrame((_, dt) => {
    const s = st.current, P = props.current;
    if (s.done) return;
    s.t += dt; if (s.t < 0.2) return; s.t = 0;
    const f = companionFocus;
    const name = map === 'arredores' ? outskirtsPlaceName(f.x, f.z) : Math.hypot(f.x, f.z) < 22 ? 'Praça do Cristal · Áster' : 'Áster';
    if (name !== s.name) { s.name = name; P.onPlace(name); }
    const passes: { key: string; x: number; z: number; go: AsterTravel }[] = map === 'arredores'
      ? [...GATE_IDS.map((g) => ({ key: g, ...outskirtsGatePoint(g, 1), go: { to: 'cidade', gate: g } as AsterTravel })), { key: 'volta', x: OUT_ARRIVAL.x, z: OUT_ARRIVAL.z, go: { to: 'mundo' } }]
      : P.layout.markers.filter((m) => m.kind === 'portao' && visibleIn(m.show, P.state)).map((m) => ({ key: m.id, x: m.x, z: m.z, go: { to: 'arredores', gate: m.gate ?? 'sul' } as AsterTravel }));
    for (const p of passes) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d > 7) s.away.set(p.key, true);
      if (d < 2.4 && s.away.get(p.key)) { s.done = true; P.onTravel(p.go); return; }
    }
    // loja pedida: abre ao chegar à porta; outro clique de andar cancela
    if (shopWalk.id) {
      const m = map === 'cidade' ? P.layout.markers.find((x) => x.id === shopWalk.id) : undefined;
      if (!m || moveRequest.id !== shopWalk.move) shopWalk.id = '';
      else if (Math.hypot(f.x - m.x, f.z - m.z) < 3) { shopWalk.id = ''; if (m.kind === 'escola') openSchool(m.name, m.school ?? 'forja'); else if (m.kind === 'ecos') openEcosHouse(m.name); else if (m.kind === 'cristal') openTower(); else openShop(m.name, m.shop ?? 'pocoes'); }
    }
  });
  return null;
}

// ---------------------------------------------------------------------------

export function AsterScene(props: AsterSceneProps) {
  const high = props.quality === 'high';
  const out = props.map === 'arredores';
  const shape = out ? OUT_SHAPE : CITY_SHAPE;
  const [daylight, setDaylight] = useState(() => gameTime(Date.now()).daylight);
  useEffect(() => { const t = setInterval(() => setDaylight(gameTime(Date.now()).daylight), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { companionFocus.set(props.arrive.x, shape.heightAt(props.arrive.x, props.arrive.z), props.arrive.z); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const night = 1 - daylight;
  const roam = useMemo<Roam>(() => ({
    limit: out ? OUT_R - 14 : CITY_R,
    wander: (x, z) => { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5; return [x + Math.cos(a) * r, z + Math.sin(a) * r]; },
    start: [props.arrive.x, props.arrive.z],
  }), [out]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useRef<HTMLDivElement>(null) as React.MutableRefObject<HTMLElement>;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <LabelLayer.Provider value={labels}>
    <Canvas
      shadows={high ? 'soft' : false}
      dpr={high ? [1, 1.75] : [0.75, 1]}
      camera={{ position: [props.arrive.x, 9, props.arrive.z + 13], fov: 34, near: 0.3, far: out ? 900 : 400 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}
    >
      <Sky daylight={daylight} palette={out ? SKY_OUT : SKY_CITY} follow fogFar={out ? 520 : 240} />
      {props.weather && <WeatherFx kind={props.weather.kind} intensity={props.weather.intensity} world={shape} />}
      <WindClock />
      <CameraRig ground={out ? outskirtsHeight : undefined} />
      <ClickMarker world={shape} />
      {out ? <OutskirtsView layout={props.layout} state={props.state} high={high} /> : <CityInside layout={props.layout} state={props.state} />}
      <Suspense fallback={null}>
        <CompanionModel files={props.model} world={shape} burstKey={props.burstKey} speech={props.speech} onFail={() => props.onTravel({ to: 'mundo' })} roam={roam} appendages={props.appendages} speed={props.speed} gear={props.gear} />
        <CombatFx world={shape} />
      </Suspense>
      <RemoteCompanions world={shape} />
      <AsterLogic map={props.map} layout={props.layout} state={props.state} onTravel={props.onTravel} onPlace={props.onPlace} />
      <AdaptiveResolution high={high} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={0.55 + night * 0.45} luminanceThreshold={0.78 - night * 0.12} luminanceSmoothing={0.2} />
        <Vignette offset={0.3} darkness={0.3} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <SMAA preset={SMAAPreset.ULTRA} />
      </EffectComposer>
    </Canvas>
    </LabelLayer.Provider>
    <div ref={labels as React.RefObject<HTMLDivElement>} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', isolation: 'isolate' }} />
    </div>
  );
}
