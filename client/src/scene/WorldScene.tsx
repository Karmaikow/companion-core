/**
 * Companion World — o mundo aberto além do Refúgio (v0, no cliente; o servidor de simulação vem no MVP 2).
 * Gerado por `makeCompanionWorld` (shared/rules/worldgen.ts): regiões com os biomas publicados no Estúdio, trilhas,
 * pedras-guia para descobrir e o Portal do Refúgio no centro. Só os chunks em volta do Companion existem na cena.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ToneMapping, SMAA } from '@react-three/postprocessing';
import { AdaptiveResolution } from './AdaptiveResolution';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { gameTime, CHUNK, WORLD_WALK_R, WORLD_ROLE, layerRole, type CompanionWorld, type WorldSite, type BiomePalette, type CreatureDef } from '@rules';
import { WorldCreatures } from './WorldCreatures';
import { WorldResources } from './WorldResources';
import { WorldChests } from './WorldChests';
import type { AppendageSpec } from './Appendages';
import type { Gear } from './CompanionModel';
import { WeatherFx } from './Weather';
import type { WeatherKind, WeatherConfig } from '@rules';
import { CombatFx } from './Combat';
import type { CompanionModelFiles } from '../backend/types';
import { CompanionModel, type Roam } from './CompanionModel';
import { RemoteCompanions } from './RemoteCompanions';
import { brain, notifyPlayer, primeBarks, sayMoment, type Place } from './brain';
import { useGame } from '../store';
import { settings } from '../settings';
import { companionFocus, groundDown, groundMove, colliders, smooth, type WorldShape } from './world';
import { GrassBlades, GlbInstances, AssetBoundary, Sky, CameraRig, WindClock, ClickMarker, Ambient, type Spot } from './Biome';
import { runeTexture } from './textures';

export interface WorldSceneProps {
  world: CompanionWorld;
  /** criaturas do Invocador (publicadas; sem elas, as de reserva) */
  creatures: CreatureDef[];
  model: CompanionModelFiles;
  appendages?: AppendageSpec | null;
  speed?: number;
  gear?: Gear | null;
  weather?: { kind: WeatherKind; intensity: number };
  /** clima do ADM (para os recursos que só aparecem com certo clima) */
  weatherCfg?: WeatherConfig;
  speech: string | null;
  burstKey: number;
  color: string;
  quality: 'high' | 'low';
  /** nomes das pedras-guia já descobertas */
  discovered: Set<string>;
  explore: boolean;
  onRegion: (site: WorldSite) => void;
  onDiscover: (site: WorldSite) => void;
  onHome: () => void;
  /** pisou no portal da Estrada para Áster */
  onAster: () => void;
  /** onde o Companion aparece (padrão: o Portal do Refúgio; voltando de Áster, ao lado do portal de lá) */
  start?: [number, number];
}

const C = (h: string) => new THREE.Color(h);

function shapeOf(cw: CompanionWorld): WorldShape {
  return { seed: cw.seed, gap: 0, open: true, heightAt: cw.heightAt, dirtAt: cw.dirtAt, noise: cw.noise };
}

// ---------------------------------------------------------------------------
// Chão em chunks (cores do bioma de cada região, misturadas na borda)
// ---------------------------------------------------------------------------

interface Pal { gl: THREE.Color; gd: THREE.Color; dirt: THREE.Color; dirtDark: THREE.Color; rock: THREE.Color }
const palOf = (p: BiomePalette): Pal => ({ gl: C(p.grassLight), gd: C(p.grassDark), dirt: C(p.dirt), dirtDark: C(p.dirtDark), rock: C(p.rockSide) });

function TerrainChunk({ cw, pals, cx, cz, walkable }: { cw: CompanionWorld; pals: Pal[]; cx: number; cz: number; walkable: boolean }) {
  const geo = useMemo(() => {
    const N = 16, step = CHUNK / N, x0 = cx * CHUNK, z0 = cz * CHUNK, W = N + 3;
    // alturas com uma borda extra: as normais batem com as do chunk vizinho (sem costura de luz)
    const H = new Float32Array(W * W);
    for (let j = -1; j <= N + 1; j++) for (let i = -1; i <= N + 1; i++) H[(j + 1) * W + (i + 1)] = cw.heightAt(x0 + i * step, z0 + j * step);
    const V = (N + 1) * (N + 1), pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), col = new Float32Array(V * 3), idx: number[] = [];
    const n = new THREE.Vector3(), a = new THREE.Color(), b = new THREE.Color(), t = new THREE.Color();
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const v = j * (N + 1) + i, x = x0 + i * step, z = z0 + j * step, h = (ii: number, jj: number) => H[(jj + 1) * W + (ii + 1)];
      pos.set([x, h(i, j), z], v * 3);
      n.set(h(i - 1, j) - h(i + 1, j), 2 * step, h(i, j - 1) - h(i, j + 1)).normalize();
      nor.set([n.x, n.y, n.z], v * 3);
      const hit = cw.regionAt(x, z), w = 0.5 + 0.5 * smooth(0, 10, hit.edge), k = cw.noise(x * 0.2 + 11, z * 0.2);
      const P = pals[hit.site.biome], Q = pals[hit.other.biome];
      a.copy(P.gd).lerp(P.gl, k); b.copy(Q.gd).lerp(Q.gl, k); a.lerp(b, 1 - w);
      a.multiplyScalar(1 - 0.14 * smooth(0.5, 0.72, cw.forestAt(x, z))); // sombra da mata
      const d = cw.dirtAt(x, z);
      if (d > 0) a.lerp(t.copy(P.dirtDark).lerp(P.dirt, cw.noise(x * 0.5, z * 0.5)), d);
      a.lerp(P.rock, smooth(0.86, 0.6, n.y));
      col.set([a.r, a.g, a.b], v * 3);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = j * (N + 1) + i, q = p + N + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }, [cw, pals, cx, cz]);
  useEffect(() => () => geo.dispose(), [geo]);
  // clique esquerdo anda (ou ataca, nos Ajustes — aí o direito anda)
  const onPointerDown = walkable ? (e: ThreeEvent<PointerEvent>) => groundDown(e, settings().click === 'atacar' ? 2 : 0) : undefined;
  const onPointerMove = walkable ? (e: ThreeEvent<PointerEvent>) => groundMove(e) : undefined;
  const onContextMenu = walkable ? (e: ThreeEvent<MouseEvent>) => { if (settings().click === 'atacar') e.nativeEvent.preventDefault(); } : undefined;
  return <mesh geometry={geo} receiveShadow onPointerDown={onPointerDown} onPointerMove={onPointerMove} onContextMenu={onContextMenu}><meshLambertMaterial vertexColors /></mesh>;
}

// ---------------------------------------------------------------------------
// Vegetação: as camadas dos chunks em volta, juntas numa malha instanciada por modelo
// ---------------------------------------------------------------------------

function useVegetation(cw: CompanionWorld, center: [number, number], high: boolean) {
  return useMemo(() => {
    const out = new Map<string, Spot[]>(), R = high ? 3 : 2, roleCache = new Map<string, string>();
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      for (const [key, list] of cw.chunkSpots(center[0] + dx, center[1] + dz)) {
        let role = roleCache.get(key);
        if (!role) { role = layerRole(cw, key)?.role ?? 'prop'; roleCache.set(key, role); }
        const view = Math.max(1, (WORLD_ROLE[role]?.view ?? 2) - (high ? 0 : 1));
        if (ring > view) continue;
        const arr = out.get(key); if (arr) arr.push(...list); else out.set(key, [...list]);
      }
    }
    return out;
  }, [cw, center, high]);
}

function Vegetation({ cw, shape, center, high }: { cw: CompanionWorld; shape: WorldShape; center: [number, number]; high: boolean }) {
  const veg = useVegetation(cw, center, high);
  // reserva que só cresce: andar pelo mundo troca os pontos sem recriar as malhas
  const caps = useRef(new Map<string, number>());
  const capOf = (key: string, n: number) => { const c = caps.current.get(key) ?? 0; if (n <= c) return c; const next = Math.max(64, 2 ** Math.ceil(Math.log2(n * 1.25))); caps.current.set(key, next); return next; };
  return (
    <group>
      {[...veg.entries()].map(([key, spots]) => {
        const info = layerRole(cw, key);
        if (!info) return null;
        const cap = capOf(key, spots.length);
        if (info.role === 'blades') return <GrassBlades key={key} world={shape} count={0} spots={spots} capacity={cap} palette={info.biome.palette} />;
        const a = info.asset!;
        const solid = a.role === 'tree' ? 0.18 : a.role === 'rock' || a.role === 'landmark' || a.role === 'prop' ? 0.42 : 0;
        return (
          <AssetBoundary key={key}>
            <Suspense fallback={null}>
              <GlbInstances look={a.look} url={a.url} spots={spots} world={shape} height={a.height} wind={a.wind} shadows={high && a.role !== 'grass'} hideNearCamera={a.height[1] > 2} solid={solid} layer={'w:' + key} capacity={cap} />
            </Suspense>
          </AssetBoundary>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Portal do Refúgio e pedras-guia
// ---------------------------------------------------------------------------

function Portal({ color }: { color: string }) {
  const runes = useMemo(runeTexture, []);
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.08;
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.09 + Math.sin(s.clock.elapsedTime * 1.4) * 0.03;
  });
  const tint = useMemo(() => C(color).multiplyScalar(1.6), [color]);
  return (
    <group>
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow><cylinderGeometry args={[1.9, 2.1, 0.16, 48]} /><meshLambertMaterial color="#d9cfe8" /></mesh>
      <mesh position={[0, 0.16, 0]} receiveShadow><cylinderGeometry args={[1.75, 1.85, 0.06, 48]} /><meshLambertMaterial color="#c4b8da" /></mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <circleGeometry args={[1.7, 64]} />
        <meshBasicMaterial map={runes} color={tint} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={beam} position={[0, 5.2, 0]}>
        <cylinderGeometry args={[0.25, 0.55, 10, 24, 1, true]} />
        <meshBasicMaterial color={tint} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.4, 0]} color={color} intensity={2.2} distance={9} decay={1.6} />
    </group>
  );
}

/** Estrada para Áster: arco de pedra com o cristal de Áster e um feixe alto (dá para achar de longe). */
function AsterGate({ site, y }: { site: WorldSite; y: number }) {
  const runes = useMemo(runeTexture, []);
  const ring = useRef<THREE.Mesh>(null), gem = useRef<THREE.Mesh>(null), veil = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    if (ring.current) ring.current.rotation.z += dt * 0.2;
    if (gem.current) { gem.current.rotation.y = t * 0.5; gem.current.position.y = 6.4 + Math.sin(t * 1.1) * 0.15; }
    if (veil.current) (veil.current.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 2) * 0.07;
  });
  const tint = useMemo(() => C('#b9a5ff').multiplyScalar(1.6), []);
  // de frente para o centro do mapa (quem vem do Refúgio chega pela frente)
  const face = Math.atan2(-site.x, -site.z);
  return (
    <group position={[site.x, y, site.z]} rotation={[0, face, 0]}>
      <mesh position={[0, 0.08, 0]} receiveShadow><cylinderGeometry args={[3.2, 3.5, 0.16, 48]} /><meshLambertMaterial color="#d8d2c4" /></mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}><circleGeometry args={[2.6, 64]} /><meshBasicMaterial map={runes} color={tint} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 2.4, 2.6, 0]} castShadow><boxGeometry args={[0.9, 5.2, 0.9]} /><meshLambertMaterial color="#cfc6b2" /></mesh>)}
      <mesh position={[0, 5.5, 0]} castShadow><boxGeometry args={[5.8, 0.8, 1.1]} /><meshLambertMaterial color="#b3a991" /></mesh>
      <mesh ref={veil} position={[0, 2.6, 0]}><planeGeometry args={[3.9, 5]} /><meshBasicMaterial color={tint} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <mesh ref={gem} scale={[0.45, 0.9, 0.45]}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={tint} toneMapped={false} /></mesh>
      <mesh position={[0, 30, 0]}><cylinderGeometry args={[0.35, 0.9, 50, 16, 1, true]} /><meshBasicMaterial color={tint} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    </group>
  );
}

function Waystones({ cw, discovered, center }: { cw: CompanionWorld; discovered: Set<string>; center: [number, number] }) {
  const all = useMemo(() => cw.sites.filter((s) => !s.home && Math.hypot(s.x - (center[0] + 0.5) * CHUNK, s.z - (center[1] + 0.5) * CHUNK) < 150), [cw, center]);
  const near = useMemo(() => all.filter((s) => !s.gate), [all]);
  const gates = useMemo(() => all.filter((s) => s.gate), [all]);
  useEffect(() => {
    // pedras-guia e os pilares do arco de Áster (o meio do arco fica livre para passar)
    const list = near.map((s) => ({ x: s.x, z: s.z, r: 0.75 }));
    for (const g of gates) { const f = Math.atan2(-g.x, -g.z), cx = Math.cos(f), sz = -Math.sin(f); for (const s of [-1, 1]) list.push({ x: g.x + cx * 2.4 * s, z: g.z + sz * 2.4 * s, r: 0.6 }); }
    colliders.set('waystones', list);
    return () => { colliders.delete('waystones'); };
  }, [near, gates]);
  return (
    <group>
      {near.map((s) => <Waystone key={s.name} site={s} y={cw.heightAt(s.x, s.z)} lit={discovered.has(s.name)} palette={cw.biomes[s.biome].palette} />)}
      {gates.map((s) => <AsterGate key={s.name} site={s} y={cw.heightAt(s.x, s.z)} />)}
    </group>
  );
}

function Waystone({ site, y, lit, palette }: { site: WorldSite; y: number; lit: boolean; palette: BiomePalette }) {
  const gem = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (gem.current) { gem.current.rotation.y = s.clock.elapsedTime * 0.6; gem.current.position.y = 2.25 + Math.sin(s.clock.elapsedTime * 1.3 + site.x) * 0.08; } });
  const glow = lit ? '#ffd98a' : '#c9b8ff';
  return (
    <group position={[site.x, y, site.z]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow scale={[0.75, 1.0, 0.75]}><dodecahedronGeometry args={[0.8, 0]} /><meshLambertMaterial color={palette.rockSide} flatShading /></mesh>
      <mesh position={[0, 1.15, 0]} castShadow scale={[0.32, 1.1, 0.32]}><octahedronGeometry args={[1, 0]} /><meshLambertMaterial color={palette.rockBottom} flatShading /></mesh>
      <mesh ref={gem} scale={[0.22, 0.38, 0.22]}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={glow} toneMapped={false} /></mesh>
      {lit && <pointLight position={[0, 2.2, 0]} color={glow} intensity={1.4} distance={7} decay={1.6} />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Lógica: chunk atual, região, descobertas, volta pelo portal, explorar sozinho
// ---------------------------------------------------------------------------

function WorldLogic(p: { cw: CompanionWorld; discovered: Set<string>; explore: boolean; goal: { current: THREE.Vector3 | null }; onCenter: (c: [number, number]) => void; onRegion: (s: WorldSite) => void; onDiscover: (s: WorldSite) => void; onHome: () => void; onAster: () => void }) {
  const props = useRef(p); props.current = p;
  const st = useRef({ t: 0, center: '', site: null as WorldSite | null, away: false, awayAster: false, asked: new Set<string>() });
  const asterSite = useMemo(() => p.cw.sites.find((x) => x.gate === 'aster') ?? null, [p.cw]);
  // lugares que ela conhece pelo nome (pedras-guia e regiões) — para "vá até a Floresta Densa"
  useEffect(() => {
    const out: Place[] = p.cw.sites.filter((x) => !x.home).map((x) => ({ name: x.name, x: x.x, z: x.z }));
    p.cw.biomes.forEach((b, i) => {
      let best: WorldSite | null = null, bd = Infinity;
      for (const x of p.cw.sites) if (!x.home && x.biome === i) { const d = Math.hypot(x.x, x.z); if (d < bd) { bd = d; best = x; } }
      if (best && !out.some((o) => o.name === b.name)) out.push({ name: b.name, x: best.x, z: best.z });
    });
    brain.places = out;
    primeBarks(); // estoque de falas pela IA (se ligado)
    return () => { brain.places = []; };
  }, [p.cw]);
  useFrame((_, dt) => {
    const s = st.current, P = props.current;
    s.t += dt; if (s.t < 0.2) return; s.t = 0;
    const f = companionFocus;
    const cx = Math.floor(f.x / CHUNK), cz = Math.floor(f.z / CHUNK), key = cx + ',' + cz;
    if (key !== s.center) { s.center = key; P.onCenter([cx, cz]); }
    const hit = P.cw.regionAt(f.x, f.z);
    if (hit.site !== s.site) { s.site = hit.site; P.onRegion(hit.site); }
    for (const site of P.cw.sites) {
      if (site.home || P.discovered.has(site.name) || s.asked.has(site.name)) continue;
      if (Math.hypot(site.x - f.x, site.z - f.z) < 5.5) { s.asked.add(site.name); P.onDiscover(site); }
    }
    const r0 = Math.hypot(f.x, f.z);
    if (r0 > 6) s.away = true;
    if (s.away && r0 < 1.2) { s.away = false; P.onHome(); }
    // Estrada para Áster (só depois de se afastar: quem volta de lá aparece ao lado do portal)
    if (asterSite) {
      const da = Math.hypot(f.x - asterSite.x, f.z - asterSite.z);
      if (da > 7) s.awayAster = true;
      if (s.awayAster && da < 1.8) { s.awayAster = false; P.onAster(); return; }
    }
    // ordens: ir até um lugar (e avisar ao chegar) ou caçar num lugar (vai até lá primeiro)
    const o = brain.order;
    const dest = o?.kind === 'goto' ? { name: o.name, x: o.x, z: o.z } : o?.kind === 'hunt' && o.place && !o.arrived ? o.place
      : o?.kind === 'clear' && o.phase === 'move' && o.next ? o.next : null; // "limpe a área": a caminho da próxima (a chegada é do tickClear)
    if (dest) {
      if (Math.hypot(dest.x - f.x, dest.z - f.z) < 6) {
        if (o?.kind === 'goto') {
          brain.order = null;
          sayMoment('arrive', { p: dest.name });
          useGame.getState().toast(`${useGame.getState().snap?.companion?.discoveries.name ?? 'Ela'} chegou em ${dest.name}!`, 'gold');
          if (o.call) notifyPlayer('Cheguei!', `Estou em ${dest.name}.`);
        } else if (o?.kind === 'hunt') { o.arrived = true; sayMoment('region', { p: dest.name }); }
        P.goal.current = null;
      } else { if (!P.goal.current) P.goal.current = new THREE.Vector3(); P.goal.current.set(dest.x, 0, dest.z); }
      return;
    }
    // explorar sozinho: a pedra-guia ainda não descoberta mais perto. Com uma ordem em andamento (caçar, atacar,
    // limpar a área) ela NÃO explora: era isso que a fazia largar a luta e sair correndo para a pedra-guia.
    if (P.explore && !o) {
      let best: WorldSite | null = null, bd = Infinity;
      for (const site of P.cw.sites) {
        if (site.home || P.discovered.has(site.name) || s.asked.has(site.name)) continue;
        const d = Math.hypot(site.x - f.x, site.z - f.z); if (d < bd) { bd = d; best = site; }
      }
      if (best) { if (!P.goal.current) P.goal.current = new THREE.Vector3(); P.goal.current.set(best.x, 0, best.z); } else P.goal.current = null;
    } else P.goal.current = null;
  });
  return null;
}

// ---------------------------------------------------------------------------

export function WorldScene(props: WorldSceneProps) {
  const { world: cw } = props;
  const high = props.quality === 'high';
  const shape = useMemo(() => shapeOf(cw), [cw]);
  const pals = useMemo(() => cw.biomes.map((b) => palOf(b.palette)), [cw]);
  const start = props.start ?? [0, 0.6];
  const [center, setCenter] = useState<[number, number]>(() => [Math.floor(start[0] / CHUNK), Math.floor(start[1] / CHUNK)]);
  const [region, setRegion] = useState<WorldSite>(() => cw.regionAt(start[0], start[1]).site);
  const [daylight, setDaylight] = useState(() => gameTime(Date.now()).daylight);
  useEffect(() => { const t = setInterval(() => setDaylight(gameTime(Date.now()).daylight), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { companionFocus.set(start[0], cw.heightAt(start[0], start[1]), start[1]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const night = 1 - daylight;
  const goal = useRef<THREE.Vector3 | null>(null);
  const roam = useMemo<Roam>(() => ({
    limit: WORLD_WALK_R,
    wander: (x, z) => { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5; return [x + Math.cos(a) * r, z + Math.sin(a) * r]; },
    goal, start,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const TR = high ? 4 : 3;
  const chunks = useMemo(() => {
    const out: [number, number][] = [];
    for (let dz = -TR; dz <= TR; dz++) for (let dx = -TR; dx <= TR; dx++) out.push([center[0] + dx, center[1] + dz]);
    return out;
  }, [center, TR]);
  return (
    <Canvas
      shadows={high ? 'soft' : false}
      dpr={high ? [1, 1.75] : [0.75, 1]}
      camera={{ position: [start[0], 9, start[1] + 13], fov: 34, near: 0.3, far: 140 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}
    >
      <Sky daylight={daylight} palette={cw.biomes[region.biome].palette} follow fogFar={((TR - 0.4) * CHUNK) / Math.max(1, cw.biomes[region.biome].settings.fog)} />
      <Ambient kind={cw.biomes[region.biome].settings.ambient} world={shape} />
      {props.weather && <WeatherFx kind={props.weather.kind} intensity={props.weather.intensity} world={shape} />}
      <WindClock />
      <CameraRig ground={cw.heightAt} />
      {chunks.map(([x, z]) => <TerrainChunk key={x + ',' + z} cw={cw} pals={pals} cx={x} cz={z} walkable />)}
      <ClickMarker world={shape} />
      <Vegetation cw={cw} shape={shape} center={center} high={high} />
      <Portal color={props.color} />
      <Waystones cw={cw} discovered={props.discovered} center={center} />
      <WorldResources cw={cw} center={center} weather={props.weatherCfg} />
      <WorldChests cw={cw} />
      <RemoteCompanions world={shape} />
      <WorldCreatures cw={cw} creatures={props.creatures} center={center} night={daylight < 0.35} high={high} />
      <Suspense fallback={null}>
        <CompanionModel files={props.model} world={shape} burstKey={props.burstKey} speech={props.speech} onFail={props.onHome} roam={roam} appendages={props.appendages} speed={props.speed} gear={props.gear} />
      <CombatFx world={shape} />
      </Suspense>
      <WorldLogic cw={cw} discovered={props.discovered} explore={props.explore} goal={goal} onCenter={setCenter} onRegion={(s) => { setRegion(s); props.onRegion(s); }} onDiscover={props.onDiscover} onHome={props.onHome} onAster={props.onAster} />
      <AdaptiveResolution high={high} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={0.5 + night * 0.45} luminanceThreshold={0.8 - night * 0.12} luminanceSmoothing={0.2} />
        <Vignette offset={0.3} darkness={0.32} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
