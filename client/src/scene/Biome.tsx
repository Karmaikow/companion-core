/**
 * Cenário de um bioma: chão, muralha de pedras, grama procedural, modelos .GLB espalhados, céu com dia e noite.
 * O mesmo código desenha o Refúgio no jogo e a prévia no Estúdio de Biomas (painel do ADM).
 */
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { fitTextures } from './fitTextures';
import { cameraFrustum, cullInstances, instanceSphere } from './instanceCulling';
import * as THREE from 'three';
import { BIOME_ROLES, type ModelLook, type BiomeAsset, type BiomeConfig, type BiomePalette, type BiomeZone } from '@rules';
import { lookUniforms, setLook, withLook } from './look';
import { settings } from '../settings';
import { mulberry32, smooth, angDiff, withWind, windTime, companionFocus, moveRequest, groundDown, groundMove, groundPointer, colliders, CLEAR_R, RIM_R, type WorldShape } from './world';

const C = (h: string) => new THREE.Color(h);

export function Terrain({ world, palette, walkable = false }: { world: WorldShape; palette: BiomePalette; walkable?: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(64, 64, 128, 128).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, world.heightAt(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color(), t = new THREE.Color();
    const gLit = C(palette.grassLight), gDark = C(palette.grassDark), dirt = C(palette.dirt), dirtDark = C(palette.dirtDark), moss = C(palette.grassLight).lerp(C('#ffffff'), 0.15), cliff = C(palette.rockSide);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      c.copy(gDark).lerp(gLit, world.noise(x * 0.2 + 11, z * 0.2));
      if (r > RIM_R + 2) c.lerp(moss, 0.5);
      const d = world.dirtAt(x, z);
      if (d > 0) c.lerp(t.copy(dirtDark).lerp(dirt, world.noise(x * 0.5, z * 0.5)), d);
      c.lerp(cliff, smooth(0.86, 0.6, n.getY(i)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [world, palette]);
  useEffect(() => () => geo.dispose(), [geo]);
  // clique/toque no chão (sem arrastar): pede para o Companion andar até lá
  // clique esquerdo anda (ou ataca, nos Ajustes — aí o direito anda)
  const onPointerDown = walkable ? (e: ThreeEvent<PointerEvent>) => groundDown(e, settings().click === 'atacar' ? 2 : 0) : undefined;
  const onPointerMove = walkable ? (e: ThreeEvent<PointerEvent>) => groundMove(e) : undefined;
  const onContextMenu = walkable ? (e: ThreeEvent<MouseEvent>) => { if (settings().click === 'atacar') e.nativeEvent.preventDefault(); } : undefined;
  return (
    <mesh geometry={geo} receiveShadow onPointerDown={onPointerDown} onPointerMove={onPointerMove} onContextMenu={onContextMenu}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

/** Pedras facetadas da muralha (procedurais, leves) — o modelo de pedra do Tripo entra entre elas. */
function useRockGeos(palette: BiomePalette) {
  return useMemo(() => [0, 1, 2, 3].map((i) => {
    const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    const p = g.attributes.position, r = mulberry32(100 + i), map = new Map<string, number>();
    for (let k = 0; k < p.count; k++) {
      const key = Math.round(p.getX(k) * 1e3) + ',' + Math.round(p.getY(k) * 1e3) + ',' + Math.round(p.getZ(k) * 1e3);
      if (!map.has(key)) map.set(key, 0.78 + r() * 0.4);
      const s = map.get(key)!; let y = p.getY(k) * s; if (y < -0.35) y = -0.35;
      p.setXYZ(k, p.getX(k) * s, y, p.getZ(k) * s);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const top = C(palette.rockTop), side = C(palette.rockSide), bottom = C(palette.rockBottom);
    for (let f = 0; f < p.count; f += 3) {
      const ny = (n.getY(f) + n.getY(f + 1) + n.getY(f + 2)) / 3, cy = ((p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3 + 0.35) / 1.55;
      c.copy(side).lerp(bottom, Math.pow(1 - cy, 1.8) * 0.7);
      if (ny > 0.5) c.lerp(top, smooth(0.5, 0.75, ny));
      c.multiplyScalar(0.93 + r() * 0.14);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }), [palette]);
}

export interface Spot { x: number; z: number; rot: number; s: number }

export function Cliffs({ world, quality, palette }: { world: WorldShape; quality: 'high' | 'low'; palette: BiomePalette }) {
  const geos = useRockGeos(palette);
  const rocks = useMemo(() => {
    const rng = mulberry32(world.seed + 7), out: { g: number; p: [number, number, number]; s: [number, number, number]; r: number }[] = [];
    const N = 34;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.1;
      if (world.open && angDiff(a, world.gap) < 0.34) continue;
      const r = RIM_R + 1.6 + rng() * 1.4, s = 1.3 + rng() * 1.3, sy = s * (1 + rng() * 0.8);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      out.push({ g: i % 4, p: [x, world.heightAt(x, z) + sy * 0.15, z], s: [s, sy, s * (0.85 + rng() * 0.3)], r: rng() * 6.28 });
      if (rng() < 0.45) { const r2 = r - 1.3, s2 = 0.5 + rng() * 0.5, x2 = Math.cos(a + 0.05) * r2, z2 = Math.sin(a + 0.05) * r2; out.push({ g: (i + 1) % 4, p: [x2, world.heightAt(x2, z2) + s2 * 0.2, z2], s: [s2, s2 * 0.9, s2], r: rng() * 6.28 }); }
    }
    return out;
  }, [world]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), []);
  useEffect(() => { colliders.set('cliffs', rocks.map((k) => ({ x: k.p[0], z: k.p[2], r: Math.max(k.s[0], k.s[2]) * 0.85 }))); return () => { colliders.delete('cliffs'); }; }, [rocks]);
  return (
    <group>
      {rocks.map((k, i) => <mesh key={i} geometry={geos[k.g]} material={mat} position={k.p} scale={k.s} rotation={[0, k.r, 0]} castShadow={quality === 'high'} receiveShadow />)}
    </group>
  );
}

/** Pontos de vegetação dentro e em volta da clareira (mesma seed, mesma distribuição). */
function useSpots(world: WorldShape, n: number, rMin: number, rMax: number, salt: number, minGap = 0, avoid?: (x: number, z: number) => boolean): Spot[] {
  return useMemo(() => {
    const rng = mulberry32(world.seed + salt), out: Spot[] = [];
    for (let t = 0; t < n * 30 && out.length < n; t++) {
      const a = rng() * Math.PI * 2, r = rMin + Math.sqrt(rng()) * (rMax - rMin), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (world.dirtAt(x, z) > 0.4 || (avoid && avoid(x, z))) continue;
      if (minGap && out.some((q) => Math.hypot(q.x - x, q.z - z) < minGap)) continue;
      out.push({ x, z, rot: rng() * 6.28, s: rng() });
    }
    return out;
  }, [world, n, rMin, rMax, salt, minGap, avoid]);
}

export function GrassBlades({ world, count, palette, spots: given, capacity }: { world: WorldShape; count: number; palette: BiomePalette; spots?: Spot[]; capacity?: number }) {
  const own = useSpots(world, given ? 0 : count, 1.6, 22, 11);
  const spots = given ?? own;
  const cap = Math.max(1, capacity && capacity >= spots.length ? capacity : given ? spots.length : count);
  const { geo, mat, tex } = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d')!, r = mulberry32(3);
    for (let i = 0; i < 11; i++) {
      const bx = 64 + (r() - 0.5) * 34, tip = (r() - 0.5) * 70, len = 128 * (0.55 + r() * 0.42), bw = 5 + r() * 5;
      const gr = g.createLinearGradient(0, 128, 0, 128 - len);
      gr.addColorStop(0, palette.grassDark); gr.addColorStop(0.55, palette.grassLight); gr.addColorStop(1, '#' + C(palette.grassLight).lerp(C('#fffbd0'), 0.6).getHexString());
      g.fillStyle = gr; g.beginPath(); g.moveTo(bx - bw, 128);
      g.quadraticCurveTo(bx - bw * 0.3, 128 - len * 0.6, bx + tip, 128 - len);
      g.quadraticCurveTo(bx + bw * 0.4, 128 - len * 0.55, bx + bw, 128); g.closePath(); g.fill();
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BufferGeometry(), bp: number[] = [], bu: number[] = [], bn: number[] = [], bi: number[] = [];
    [0, Math.PI / 2].forEach((ang, qi) => {
      const cx = Math.cos(ang) * 0.5, cz = Math.sin(ang) * 0.5, o = qi * 4;
      bp.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); bu.push(0, 0, 1, 0, 1, 1, 0, 1);
      for (let k = 0; k < 4; k++) bn.push(0, 1, 0);
      bi.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
    geo.setIndex(bi);
    // emissiveMap: o verso da lâmina (normal invertida) não fica preto
    const mat = withWind(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.32 }), { height: 1, amp: 1.2 });
    return { geo, mat, tex };
  }, [palette]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); tex.dispose(); }, [geo, mat, tex]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current; if (!im) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    spots.forEach((t, i) => {
      const k = 0.3 + t.s * 0.38;
      im.setMatrixAt(i, m4.compose(v.set(t.x, world.heightAt(t.x, t.z) - 0.03, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.set(k * 1.5, k, k * 1.5)));
      im.setColorAt(i, c.setScalar(0.85 + t.s * 0.3));
    });
    im.count = spots.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [spots, world, cap]);
  return <instancedMesh key={cap} ref={ref} args={[geo, mat, cap]} receiveShadow frustumCulled={false} />;
}

/** Converte atributos quantizados (meshopt) para float antes de "assar" a transformação na geometria. */
function bakeGeometry(src: THREE.BufferGeometry, m: THREE.Matrix4) {
  const g = src.clone();
  for (const name of ['position', 'normal'] as const) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
    g.setAttribute(name, new THREE.BufferAttribute(f, 3));
  }
  g.applyMatrix4(m);
  return g;
}

/**
 * Um .GLB espalhado em várias cópias numa malha instanciada (uma por parte do modelo).
 * `height` é a altura desejada em metros: os modelos do Tripo chegam com ~1 m.
 */
export function GlbInstances({ url, spots, world, height, wind = 0, shadows = false, hideNearCamera = false, solid = 0, layer, capacity, look }: { /** cor/luz/brilho deste bioma */ look?: ModelLook; /** reserva de cópias (o mundo aberto troca os pontos sem recriar a malha) */ capacity?: number; url: string; spots: Spot[]; world: WorldShape; height: [number, number]; wind?: number; shadows?: boolean; hideNearCamera?: boolean; /** fração do pé do modelo que bloqueia (0 = passa por cima/através) */ solid?: number; layer?: string }) {
  const { scene } = useGLTF(url);
  const { parts, foot, trunk, lu, bounds } = useMemo(() => {
    fitTextures(scene, 1024);
    const lu = lookUniforms();
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const norm = new THREE.Matrix4().makeScale(1 / size.y, 1 / size.y, 1 / size.y).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.Material).clone();
      if (wind) withWind(mat, { height: 1, strength: wind, amp: 0.9 });
      withLook(mat, lu);
      out.push({ geo: bakeGeometry(mesh.geometry, norm.clone().multiply(mesh.matrixWorld)), mat });
    });
    // pé de verdade (modelo com 1 m de altura): distância horizontal dos vértices perto do chão até o centro.
    // Pedras e objetos: a base até meia altura; árvores: só o tronco (o que fica abaixo de 15%).
    // centro e raio da base: o centro é a média dos vértices de baixo (o tronco nem sempre fica no meio da caixa)
    const footAt = (band: number) => {
      const xs: number[] = [], zs: number[] = [];
      for (const p of out) { const a = p.geo.getAttribute('position'); for (let i = 0; i < a.count; i += 2) if (a.getY(i) <= band) { xs.push(a.getX(i)); zs.push(a.getZ(i)); } }
      if (!xs.length) return { cx: 0, cz: 0, r: Math.max(size.x, size.z) / size.y / 2 };
      const cx = xs.reduce((t, v) => t + v, 0) / xs.length, cz = zs.reduce((t, v) => t + v, 0) / zs.length;
      const d = xs.map((x, i) => Math.hypot(x - cx, zs[i] - cz)).sort((a, b) => a - b);
      return { cx, cz, r: d[Math.floor(d.length * 0.9)] };
    };
    // esfera que envolve o modelo inteiro (1 m de altura), para o corte por câmera
    const all = new THREE.Box3();
    for (const p of out) { p.geo.computeBoundingBox(); all.union(p.geo.boundingBox!); }
    const bounds = all.isEmpty() ? new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1) : all.getBoundingSphere(new THREE.Sphere());
    return { parts: out, foot: footAt(0.5), trunk: footAt(0.15), lu, bounds };
  }, [scene, wind]);
  useEffect(() => setLook(lu, look), [lu, look]);
  useEffect(() => () => parts.forEach((p) => { p.geo.dispose(); p.mat.dispose(); }), [parts]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const hidden = useRef<boolean[]>([]);
  const cap = Math.max(1, capacity && capacity >= spots.length ? capacity : spots.length);
  const mats = useMemo(() => {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    return spots.map((t) => { const h = height[0] + t.s * (height[1] - height[0]), y = world.heightAt(t.x, t.z) - 0.05; return { m: m4.compose(v.set(t.x, y, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.set(h, h, h)).clone(), x: t.x, z: t.z, h, rot: t.rot, sphere: instanceSphere(bounds, t.x, y, t.z, h, shadows) }; });
  }, [spots, world, height, bounds, shadows]);
  const spheres = useMemo(() => mats.map((k) => k.sphere), [mats]);
  // cópias que estão na tela agora (índices em `mats`), na ordem em que foram para a placa
  const shown = useRef<{ list: number[]; n: number; dirty: boolean }>({ list: [], n: -1, dirty: true });
  useLayoutEffect(() => {
    hidden.current = [];
    // até o primeiro quadro, todas (o corte por câmera entra no próximo useFrame)
    refs.current.forEach((im) => { if (!im) return; mats.forEach((k, i) => im.setMatrixAt(i, k.m)); im.count = mats.length; im.instanceMatrix.needsUpdate = true; });
    shown.current = { list: [], n: -1, dirty: true };
  }, [mats, parts, cap]);
  // obstáculos (só o que é alto o bastante; o que tem menos de ~45 cm dá para passar por cima)
  useEffect(() => {
    if (!solid || !layer) return;
    // solid < 0,3 = árvore (bate no tronco); senão, a base inteira (pedras, marcos, objetos)
    const tree = solid < 0.3, b = tree ? (trunk.r < foot.r ? trunk : foot) : foot;
    colliders.set(layer, mats.filter((k) => k.h >= 0.45).map((k) => {
      // o centro da base gira junto com a cópia
      const c = Math.cos(k.rot), sn = Math.sin(k.rot), ox = (b.cx * c + b.cz * sn) * k.h, oz = (-b.cx * sn + b.cz * c) * k.h;
      return { x: k.x + ox, z: k.z + oz, r: Math.max(0.12, b.r * k.h * (tree ? 1 : 0.92)) };
    }));
    return () => { colliders.delete(layer); };
  }, [mats, foot, trunk, solid, layer]);
  const frustum = useMemo(() => ({ f: new THREE.Frustum(), m: new THREE.Matrix4(), vis: [] as number[] }), []);
  useFrame(({ camera }) => {
    // árvores altas entre a câmera e o Companion (companionFocus), perto da linha de visão, saem da frente
    if (hideNearCamera) {
      const fx = companionFocus.x, fz = companionFocus.z, cx = camera.position.x - fx, cz = camera.position.z - fz, cl = Math.hypot(cx, cz) || 1;
      mats.forEach((k, i) => {
        const rx = k.x - fx, rz = k.z - fz, along = (rx * cx + rz * cz) / cl, lat = Math.abs((-rx * cz + rz * cx) / cl);
        hidden.current[i] = along > 1.5 && along < cl && lat < 2.2 + along * 0.25;
      });
    }
    // só as cópias na tela vão para a placa; reenvia apenas quando a lista muda
    const vis = frustum.vis, sh = shown.current;
    const skip = hideNearCamera ? hidden.current : undefined;
    // em desenvolvimento, `window.__noCull = true` desliga o corte (para comparar o quadro com e sem)
    const n = import.meta.env.DEV && (window as { __noCull?: boolean }).__noCull
      ? mats.reduce((c, _, i) => (skip?.[i] ? c : ((vis[c] = i), c + 1)), 0)
      : cullInstances(spheres, cameraFrustum(camera, frustum.f, frustum.m), vis, skip);
    let changed = sh.dirty || n !== sh.n;
    for (let j = 0; !changed && j < n; j++) changed = vis[j] !== sh.list[j];
    if (!changed) return;
    sh.list = vis.slice(0, n); sh.n = n; sh.dirty = false;
    refs.current.forEach((im) => {
      if (!im) return;
      for (let j = 0; j < n; j++) im.setMatrixAt(j, mats[vis[j]].m);
      im.count = n; im.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <group>
      {parts.map((p, i) => (
        <instancedMesh key={i + ':' + cap} ref={(el) => { refs.current[i] = el; }} args={[p.geo, p.mat, cap]} castShadow={shadows} receiveShadow frustumCulled={false} />
      ))}
    </group>
  );
}

const ZONES: Record<BiomeZone, [number, number]> = {
  inside: [2.4, CLEAR_R + 0.5], edge: [CLEAR_R - 2.5, RIM_R + 3], outside: [RIM_R + 3.5, 26], anywhere: [2.4, 24],
};
const nearAltar = (x: number, z: number) => Math.hypot(x, z) < 2.6;

function AssetLayer({ asset, world, quality, salt }: { asset: BiomeAsset; world: WorldShape; quality: 'high' | 'low'; salt: number }) {
  const high = quality === 'high';
  const [r0, r1] = ZONES[asset.zone];
  const n = Math.round(asset.count * (high ? 1 : 0.5));
  const spots = useSpots(world, n, r0, r1, salt, BIOME_ROLES[asset.role].gap, nearAltar);
  const tall = asset.height[1] > 2;
  // tronco de árvore bloqueia (não a copa); pedras, marcos e objetos bloqueiam pelo pé; grama e plantas não
  const solid = asset.role === 'tree' ? 0.18 : asset.role === 'rock' || asset.role === 'landmark' || asset.role === 'prop' ? 0.42 : 0;
  return <GlbInstances look={asset.look} url={asset.url} spots={spots} world={world} height={asset.height} wind={asset.wind} shadows={high && (asset.role !== 'grass')} hideNearCamera={tall} solid={solid} layer={'asset:' + salt + ':' + asset.id} />;
}

/** Todos os modelos do bioma espalhados pela clareira (cada um carrega sozinho; um arquivo com defeito não derruba os outros). */
export function BiomeVegetation({ biome, world, quality }: { biome: BiomeConfig; world: WorldShape; quality: 'high' | 'low' }) {
  return (
    <group>
      {biome.assets.map((a, i) => (
        <AssetBoundary key={a.id + a.url}>
          <Suspense fallback={null}><AssetLayer asset={a} world={world} quality={quality} salt={21 + i * 7} /></Suspense>
        </AssetBoundary>
      ))}
    </group>
  );
}

export class AssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[Bioma] modelo não carregou', e); }
  render() { return this.state.failed ? null : this.props.children; }
}

const GOLD = new THREE.Color('#ffb36b'), FILL_DAY = new THREE.Color('#9fc8ff'), FILL_NIGHT = new THREE.Color('#5b5fb0'), FILL_GOLD = new THREE.Color('#d9a0ff');

export function Sky({ daylight, palette, follow = false, fogFar }: { daylight: number; palette: BiomePalette; /** mundo aberto: a luz (e a sombra) acompanham o Companion */ follow?: boolean; /** distância da névoa (o mundo aberto esconde a borda dos chunks) */ fogFar?: number }) {
  const { scene } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const day = useMemo(() => ({ bg: C(palette.sky), fog: C(palette.fog), sky: C(palette.sky).lerp(C('#ffffff'), 0.6), ground: C(palette.grassDark).multiplyScalar(0.8), sun: C('#fff0cf') }), [palette]);
  const night = useMemo(() => ({ bg: C(palette.skyNight), fog: C(palette.fogNight), sky: C(palette.skyNight).lerp(C('#ffffff'), 0.5), ground: C('#30484a'), sun: C('#b9c6ff') }), [palette]);
  useEffect(() => {
    const k = daylight;
    const bg = night.bg.clone().lerp(day.bg, k), fog = night.fog.clone().lerp(day.fog, k);
    scene.background = bg; scene.fog = fogFar ? new THREE.Fog(fog, fogFar * 0.45, fogFar) : new THREE.Fog(fog, 30 + k * 8, 62 + k * 18);
    // Mais contraste: menos luz "de todo lado" (hemisfério) e mais sol, então as sombras e o volume aparecem.
    // Perto do nascer/pôr do sol (dia pela metade) o sol fica dourado e o céu de preenchimento, lilás.
    const golden = Math.max(0, 1 - Math.abs(k - 0.5) / 0.32);
    if (hemi.current) { hemi.current.color.copy(night.sky).lerp(day.sky, k); hemi.current.groundColor.copy(night.ground).lerp(day.ground, k); hemi.current.intensity = 0.8 + k * 0.4; }
    if (sun.current) { sun.current.color.copy(night.sun).lerp(day.sun, k).lerp(GOLD, golden * 0.55); sun.current.intensity = 0.8 + k * 1.8; }
    if (fill.current) { fill.current.color.copy(FILL_NIGHT).lerp(FILL_DAY, k).lerp(FILL_GOLD, golden * 0.5); fill.current.intensity = 0.25 + k * 0.3; }
  }, [daylight, scene, day, night, fogFar]);
  useFrame(() => {
    const l = sun.current;
    if (!follow || !l) return;
    l.position.set(companionFocus.x + 11, companionFocus.y + 13, companionFocus.z + 7);
    l.target.position.copy(companionFocus); l.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight ref={hemi} />
      {/* sol mais baixo (sombras mais longas e desenhadas) */}
      <directionalLight ref={sun} position={[11, 13, 7]} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0006} shadow-normalBias={0.035} shadow-radius={3}
        shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-camera-near={1} shadow-camera-far={60} />
      {/* luz de preenchimento do lado oposto (o céu refletido), sem sombra: tira o "chapado" do lado escuro */}
      <directionalLight ref={fill} position={[-8, 6, -10]} />
    </>
  );
}

export function Motes({ world, night, amount }: { world: WorldShape; night: number; amount: number }) {
  const N = 90;
  const ref = useRef<THREE.Points>(null);
  const { geo, seeds } = useMemo(() => {
    const r = mulberry32(world.seed + 5), seeds = Array.from({ length: N }, () => { const a = r() * 6.28, rr = 2 + r() * 8; return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph: r() * 6.28, sp: 0.3 + r() * 0.5 }; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return { geo: g, seeds };
  }, [world]);
  useFrame((s) => {
    const t = s.clock.elapsedTime, p = geo.attributes.position as THREE.BufferAttribute;
    seeds.forEach((q, i) => p.setXYZ(i, q.x + Math.sin(t * q.sp + q.ph) * 1.2, world.heightAt(q.x, q.z) + 0.6 + Math.sin(t * q.sp * 1.7 + q.ph) * 0.5, q.z + Math.cos(t * q.sp * 0.8 + q.ph) * 1.2));
    p.needsUpdate = true;
    if (ref.current) (ref.current.material as THREE.PointsMaterial).opacity = (0.35 + night * 0.6) * amount;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.09 + night * 0.05} color={night > 0.5 ? '#d8ff8a' : '#fff1b8'} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/** Câmera em perspectiva olhando o altar; arrastar gira em volta, a roda/pinça aproxima. */
export function CameraRig({ ground }: { /** mundo aberto: a câmera nunca entra num morro */ ground?: (x: number, z: number) => number } = {}) {
  const { camera, size, gl } = useThree();
  const st = useRef({ az: 0.35, dist: 0, drag: null as null | { x: number }, pinch: 0, d0: 0 });
  const portrait = size.height > size.width;
  useEffect(() => {
    const el = gl.domElement, s = st.current, ptrs = new Map<number, number[]>();
    const down = (e: PointerEvent) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 1) s.drag = { x: e.clientX }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; s.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); s.d0 = s.dist; s.drag = null; } };
    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2 && s.pinch) { const [a, b] = [...ptrs.values()]; s.dist = Math.min(8, Math.max(-6, s.d0 + (s.pinch - Math.hypot(a[0] - b[0], a[1] - b[1])) * 0.03)); return; }
      if (groundPointer.hold) { if (s.drag) s.drag.x = e.clientX; return; } // segurando no chão: o Companion segue, a câmera não gira
      if (s.drag) { s.az -= (e.clientX - s.drag.x) * 0.006; s.drag.x = e.clientX; }
    };
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (!ptrs.size) { s.drag = null; s.pinch = 0; } };
    const wheel = (e: WheelEvent) => { s.dist = Math.min(8, Math.max(-6, s.dist + Math.sign(e.deltaY) * 0.8)); };
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); el.addEventListener('wheel', wheel, { passive: true });
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.removeEventListener('wheel', wheel); };
  }, [gl]);
  const want = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dt) => {
    const k = st.current, t = s.clock.elapsedTime;
    const dist = (portrait ? 21 : 15) + k.dist, polar = 0.92, az = k.az + Math.sin(t * 0.05) * 0.08;
    // suavização pelo tempo (não por quadro): no celular lento a câmera não fica para trás
    look.lerp(companionFocus, 1 - Math.exp(-Math.min(dt, 0.25) * 3));
    want.set(look.x + Math.sin(polar) * Math.sin(az) * dist, look.y + Math.cos(polar) * dist + 0.8, look.z + Math.sin(polar) * Math.cos(az) * dist);
    if (ground) {
      // sobe a câmera se um morro ficar entre ela e o Companion (amostra o caminho até lá)
      let lift = 0;
      for (let i = 1; i <= 4; i++) { const f = i / 4, x = look.x + (want.x - look.x) * f, z = look.z + (want.z - look.z) * f, y = look.y + (want.y - look.y) * f; lift = Math.max(lift, ground(x, z) + 1.6 - y); }
      want.y += lift;
    }
    camera.position.lerp(want, 1 - Math.exp(-Math.min(dt, 0.25) * 3.6));
    camera.lookAt(look.x, look.y + (portrait ? 0.2 : 0.9), look.z);
  });
  return null;
}

export function WindClock() { useFrame((s) => { windTime.value = s.clock.elapsedTime; }); return null; }


/** Anel que marca onde a pessoa clicou para o Companion andar. */
export function ClickMarker({ world }: { world: WorldShape }) {
  const m = useRef<THREE.Mesh>(null);
  const st = useRef({ id: moveRequest.id, t: 1 });
  useFrame((_, dt) => {
    const s = st.current, mesh = m.current;
    if (!mesh) return;
    if (s.id !== moveRequest.id) { s.id = moveRequest.id; s.t = 0; const p = moveRequest.point; mesh.position.set(p.x, world.heightAt(p.x, p.z) + 0.05, p.z); }
    s.t = Math.min(1, s.t + dt * 1.2);
    mesh.visible = s.t < 1;
    mesh.scale.setScalar(1.4 - s.t * 0.6);
    (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - s.t;
  });
  return (
    <mesh ref={m} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.3, 0.4, 32]} />
      <meshBasicMaterial color="#ffe08a" transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Partículas no ar do bioma (vaga-lumes, brasas, neve, folhas, pétalas, esporos), sempre em volta do Companion. */
const AMBIENT: Record<string, { color: string; size: number; add: boolean; vy: number; sway: number; blink: boolean; n: number }> = {
  fireflies: { color: '#e4ff8a', size: 0.11, add: true, vy: 0.05, sway: 0.8, blink: true, n: 120 },
  embers: { color: '#ff8a3a', size: 0.09, add: true, vy: 0.9, sway: 0.5, blink: true, n: 220 },
  snow: { color: '#ffffff', size: 0.1, add: false, vy: -0.9, sway: 0.4, blink: false, n: 420 },
  leaves: { color: '#e8a24a', size: 0.16, add: false, vy: -0.6, sway: 1.2, blink: false, n: 110 },
  petals: { color: '#ffc4dc', size: 0.13, add: false, vy: -0.45, sway: 1.1, blink: false, n: 140 },
  spores: { color: '#9ff0ff', size: 0.08, add: true, vy: 0.25, sway: 0.6, blink: true, n: 200 },
};

export function Ambient({ kind, world }: { kind: string; world: WorldShape }) {
  const def = AMBIENT[kind];
  const ref = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    if (!def) return null;
    const r = mulberry32(kind.length * 97 + 3), W = 34, H = 9;
    const seeds = Array.from({ length: def.n }, () => ({ x: (r() - 0.5) * W, y: r() * H, z: (r() - 0.5) * W, ph: r() * 6.28, sp: 0.6 + r() * 0.8 }));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(def.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(def.n * 3).fill(1), 3));
    return { seeds, g, W, H };
  }, [def, kind]);
  useEffect(() => () => data?.g.dispose(), [data]);
  useFrame((s) => {
    if (!def || !data) return;
    const t = s.clock.elapsedTime, p = data.g.attributes.position as THREE.BufferAttribute, c = data.g.attributes.color as THREE.BufferAttribute;
    const fx = companionFocus.x, fz = companionFocus.z, { W, H } = data;
    data.seeds.forEach((q, i) => {
      // posição relativa ao Companion, dando a volta na caixa (as partículas nunca acabam)
      const wrap = (v: number, size: number) => ((((v + size / 2) % size) + size) % size) - size / 2;
      const x = fx + wrap(q.x + Math.sin(t * 0.4 * q.sp + q.ph) * def.sway - fx, W);
      const z = fz + wrap(q.z + Math.cos(t * 0.33 * q.sp + q.ph) * def.sway - fz, W);
      const y = ((q.y + t * def.vy * q.sp) % H + H) % H;
      p.setXYZ(i, x, world.heightAt(x, z) + 0.2 + y, z);
      const k = def.blink ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 * q.sp + q.ph)) : 1;
      c.setXYZ(i, k, k, k);
    });
    p.needsUpdate = true; c.needsUpdate = true;
  });
  if (!def || !data) return null;
  return (
    <points ref={ref} geometry={data.g} frustumCulled={false}>
      <pointsMaterial size={def.size} color={def.color} vertexColors transparent opacity={0.9} depthWrite={false} blending={def.add ? THREE.AdditiveBlending : THREE.NormalBlending} toneMapped={!def.add} />
    </points>
  );
}
