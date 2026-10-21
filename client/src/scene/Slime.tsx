/**
 * Slime procedural (criatura sem modelo nem imagem): domo de gelatina brilhante com contorno translúcido, reflexos
 * pintados, borda luminosa (fresnel), núcleo e bolhinhas por dentro e um rosto desenhado em canvas e "colado" na
 * superfície curva (DecalGeometry). O rosto muda com o temperamento e com o que ela está fazendo; o corpo pula,
 * achata e balança como gelatina. Um enfeite no topo indica a essência (folha, chama, cristal, gota, auréola, chifres…).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { CreatureDef } from '@rules';
import type { CreatureAct } from './Creature';

export type SlimeFace = 'calm' | 'shy' | 'stern' | 'angry' | 'happy' | 'hurt' | 'sleep' | 'blink';

const H0 = 0.59; // altura da geometria base (largura ~1,1)
const C = (h: string) => new THREE.Color(h);

/** Domo: metade de cima arredondada, base achatada e um pouco mais larga (gelatina apoiada no chão). */
function slimeGeometry() {
  const g = new THREE.SphereGeometry(0.5, 56, 36);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const k = 1.1 * (1 + 0.06 * (1 + y / 0.5)); x *= k; z *= k; y *= 0.18; } else {
      // perfil de gota de goma: laterais cheias e topo arredondado (superelipse)
      const ny = y / 0.5, nr = Math.sqrt(Math.max(0, 1 - ny * ny)), nr2 = Math.pow(nr, 0.62), k = nr > 1e-4 ? (nr2 / nr) * 1.1 : 1;
      x *= k; z *= k;
    }
    p.setXYZ(i, x, y + 0.09, z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Rostos (canvas → textura colada no corpo)
// ---------------------------------------------------------------------------

const faceCache = new Map<string, THREE.CanvasTexture>();
function faceTexture(face: SlimeFace, ink: string): THREE.CanvasTexture {
  const key = face + ink;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const W = 444, Hh = 300, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d')!;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 17;
  const L = 150, R = 294, Y = 150; // centro dos olhos
  const line = (pts: number[][]) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.stroke(); };
  const blush = () => { g.save(); g.fillStyle = 'rgba(255,110,176,0.85)'; for (const x of [L - 62, R + 62]) { g.beginPath(); g.ellipse(x, Y + 42, 30, 19, 0, 0, Math.PI * 2); g.fill(); } g.restore(); };
  switch (face) {
    case 'calm': for (const x of [L + 22, R - 22]) line([[x, Y - 30], [x, Y + 30]]); break;
    case 'blink': for (const x of [L + 22, R - 22]) line([[x - 16, Y + 6], [x + 16, Y + 6]]); break;
    case 'shy': line([[L - 34, Y - 16], [L + 22, Y + 4]]); line([[R + 34, Y - 16], [R - 22, Y + 4]]); blush(); break;
    case 'stern': g.lineWidth = 20; line([[L - 34, Y - 4], [L + 24, Y + 10]]); line([[R + 34, Y - 4], [R - 24, Y + 10]]); break;
    case 'angry': {
      line([[L - 26, Y - 26], [L + 14, Y + 4], [L + 14, Y + 34]]); line([[R + 26, Y - 26], [R - 14, Y + 4], [R - 14, Y + 34]]);
      // marca de bravo (cruz de veias), no alto à esquerda
      g.save(); g.strokeStyle = '#ff2e6e'; g.lineWidth = 11; const ax = L - 64, ay = Y - 78;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.beginPath(); g.moveTo(ax + dx * 6, ay + dy * 22); g.quadraticCurveTo(ax + dx * 8, ay + dy * 8, ax + dx * 22, ay + dy * 6); g.stroke(); }
      g.restore(); break;
    }
    case 'happy': for (const x of [L + 10, R - 10]) { g.beginPath(); g.arc(x, Y + 14, 26, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); } blush(); break;
    case 'hurt': line([[L - 20, Y - 24], [L + 22, Y], [L - 20, Y + 24]]); line([[R + 20, Y - 24], [R - 22, Y], [R + 20, Y + 24]]); break;
    case 'sleep': for (const x of [L + 10, R - 10]) { g.beginPath(); g.arc(x, Y - 6, 26, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); } blush(); break;
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  faceCache.set(key, t);
  return t;
}

function baseFace(def: CreatureDef): SlimeFace {
  return def.temperament === 'agressivo' ? 'stern' : def.temperament === 'territorial' ? 'stern' : def.temperament === 'medroso' ? 'shy' : 'calm';
}
export function faceFor(def: CreatureDef, act: CreatureAct): SlimeFace {
  if (act === 'attack') return 'angry';
  if (act === 'hurt') return 'hurt';
  if (act === 'sleep') return 'sleep';
  if (act === 'happy') return 'happy';
  return baseFace(def);
}

// ---------------------------------------------------------------------------

/** Borda luminosa (fresnel) no material da gelatina. */
function withRim(m: THREE.MeshPhysicalMaterial, rim: THREE.Color, amount: number) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uRimColor = { value: rim }; s.uniforms.uRim = { value: amount };
    s.fragmentShader = 'uniform vec3 uRimColor; uniform float uRim;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);
      totalEmissiveRadiance += uRimColor * rimF * uRim;`);
  };
  m.customProgramCacheKey = () => 'slime-rim';
  return m;
}

/** Ponto e normal aproximados na superfície do domo, numa direção (do centro). */
function onSurface(dx: number, dy: number, dz: number) {
  const d = new THREE.Vector3(dx, dy, dz).normalize();
    // mesmo perfil da geometria
  const ny = d.y, nr = Math.sqrt(Math.max(0, 1 - ny * ny)), k = nr > 1e-4 ? (Math.pow(nr, 0.62) / nr) * 1.1 : 1;
  const p = new THREE.Vector3(d.x * 0.5 * k, ny * 0.5 + 0.09, d.z * 0.5 * k);
  const n = new THREE.Vector3(d.x / k, d.y, d.z / k).normalize();
  return { p: p.addScaledVector(n, 0.018), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n) };
}

export function SlimeBody({ def, act }: { def: CreatureDef; act: CreatureAct }) {
  const col = useMemo(() => C(def.color), [def.color]);
  const parts = useMemo(() => {
    const geo = slimeGeometry();
    const hsl = { h: 0, s: 0, l: 0 }; col.getHSL(hsl);
    const body = withRim(new THREE.MeshPhysicalMaterial({
      color: col.clone().offsetHSL(0, 0.08, 0), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
      sheen: 0.4, sheenColor: col.clone().lerp(C('#ffffff'), 0.5), emissive: col.clone().multiplyScalar(0.18), transparent: true, opacity: 0.93,
    }), col.clone().lerp(C('#ffffff'), 0.45), 0.9);
    const shell = new THREE.MeshBasicMaterial({ color: col.clone().lerp(C('#e8e8f0'), 0.62), transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false });
    const core = new THREE.MeshBasicMaterial({ color: col.clone().lerp(C('#ffffff'), 0.35), transparent: true, opacity: 0.35, depthWrite: false });
    const shine = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false });
    // rosto colado na superfície curva
    const tmp = new THREE.Mesh(geo); tmp.updateMatrixWorld(true);
    const faceGeo = new DecalGeometry(tmp, new THREE.Vector3(0, 0.3, 0.5), new THREE.Euler(0, 0, 0), new THREE.Vector3(0.86, 0.58, 0.7));
    const ink = '#' + C(def.color).lerp(C('#14101f'), 0.86).getHexString();
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(baseFace(def), ink), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const hi1 = onSurface(0.36, 0.8, 0.48), hi2 = onSurface(0.62, 0.62, 0.48), hi3 = onSurface(-0.62, 0.5, 0.6);
    return { geo, body, shell, core, shine, faceGeo, faceMat, ink, hi: [hi1, hi2, hi3] };
  }, [col, def]);
  useEffect(() => () => { parts.geo.dispose(); parts.faceGeo.dispose(); parts.body.dispose(); parts.shell.dispose(); parts.core.dispose(); parts.shine.dispose(); parts.faceMat.dispose(); }, [parts]);

  const root = useRef<THREE.Group>(null);
  const jelly = useRef<THREE.Group>(null);
  const bubbles = useRef<THREE.Group>(null);
  const st = useRef({ sy: 1, vy: 0, lean: 0, face: '' as string, blink: 2 + Math.random() * 3, ph: Math.random() * 10, land: 0 });
  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), t = s.clock.elapsedTime + st.current.ph, k = st.current, j = jelly.current, r = root.current;
    if (!j || !r) return;
    const moving = act === 'walk' || act === 'run';
    // alvo de achatamento: pulinhos ao andar, respiração parada, esticar ao atacar
    let target = 1 + Math.sin(t * 2.1) * 0.03, hop = 0;
    if (moving) { const f = act === 'run' ? 3.2 : 2.2, c = (t * f) % 1; hop = Math.sin(c * Math.PI) * (act === 'run' ? 0.32 : 0.22); target = c < 0.12 || c > 0.9 ? 0.72 : 1.12; }
    if (act === 'attack') { const c = (t * 1.6) % 1; target = c < 0.35 ? 0.7 : c < 0.55 ? 1.35 : 1; }
    if (act === 'sleep') target = 0.86 + Math.sin(t * 1.2) * 0.04;
    if (act === 'hurt') target = 0.85 + Math.sin(t * 30) * 0.06;
    // mola: a gelatina passa do ponto e volta
    k.vy += (target - k.sy) * 180 * dt; k.vy *= Math.exp(-9 * dt); k.sy += k.vy * dt;
    const sy = Math.max(0.55, k.sy), sx = 1 / Math.sqrt(sy);
    j.scale.set(sx, sy, sx);
    j.position.y = hop * def.size;
    k.lean += ((moving ? 0.12 : act === 'attack' ? 0.22 * Math.max(0, Math.sin(t * 10)) : 0) - k.lean) * Math.min(1, dt * 8);
    j.rotation.x = k.lean;
    r.position.x = act === 'hurt' ? Math.sin(t * 40) * 0.03 : 0;
    // rosto: piscar de vez em quando
    let face: SlimeFace = faceFor(def, act);
    k.blink -= dt;
    if (k.blink < 0) { if (face === 'calm') face = 'blink'; if (k.blink < -0.12) k.blink = 2.5 + Math.random() * 3.5; }
    if (k.face !== face) { k.face = face; parts.faceMat.map = faceTexture(face, parts.ink); parts.faceMat.needsUpdate = true; }
    // bolhinhas subindo por dentro
    bubbles.current?.children.forEach((b, i) => { const c = (t * 0.25 + i * 0.37) % 1; b.position.set(Math.sin(i * 2.3 + t * 0.6) * 0.18, 0.1 + c * 0.36, Math.cos(i * 1.7) * 0.14); b.scale.setScalar((0.025 + (i % 3) * 0.012) * Math.sin(c * Math.PI)); });
  });

  const scale = def.size / H0;
  return (
    <group scale={scale}>
      <group ref={root}>
        <group ref={jelly}>
          <mesh geometry={parts.geo} material={parts.body} castShadow renderOrder={2} />
          <mesh geometry={parts.geo} material={parts.shell} scale={1.06} renderOrder={1} />
          <mesh position={[0, 0.27, 0]} scale={[0.26, 0.2, 0.26]} material={parts.core} renderOrder={1}><sphereGeometry args={[1, 20, 14]} /></mesh>
          <group ref={bubbles}>{[0, 1, 2, 3, 4].map((i) => <mesh key={i} material={parts.core}><sphereGeometry args={[1, 10, 8]} /></mesh>)}</group>
          <mesh geometry={parts.faceGeo} material={parts.faceMat} renderOrder={3} />
          {/* reflexos pintados (o grande, o pontinho e um de leve do outro lado) */}
          <group position={parts.hi[0].p} quaternion={parts.hi[0].q}><mesh material={parts.shine} scale={[0.12, 0.07, 1]} rotation={[0, 0, 0.55]} renderOrder={4}><circleGeometry args={[1, 24]} /></mesh></group>
          <group position={parts.hi[1].p} quaternion={parts.hi[1].q}><mesh material={parts.shine} scale={[0.04, 0.034, 1]} renderOrder={4}><circleGeometry args={[1, 16]} /></mesh></group>
          <group position={parts.hi[2].p} quaternion={parts.hi[2].q}><mesh scale={[0.08, 0.03, 1]} rotation={[0, 0, -0.6]} renderOrder={4}><circleGeometry args={[1, 16]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} /></mesh></group>
          <EssenceTop def={def} />
        </group>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><circleGeometry args={[0.56, 28]} /><meshBasicMaterial color="#000" transparent opacity={0.2} depthWrite={false} /></mesh>
    </group>
  );
}

/** Enfeite no topo pela essência. */
function EssenceTop({ def }: { def: CreatureDef }) {
  const flame = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (flame.current) { const t = s.clock.elapsedTime; flame.current.scale.set(0.07 * (1 + Math.sin(t * 13) * 0.1), 0.16 * (1 + Math.sin(t * 9) * 0.15), 0.07); } });
  const top = 0.6;
  switch (def.essence) {
    case 'natureza': return (
      <group position={[0.02, top - 0.03, 0]}>
        <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.012, 0.018, 0.1, 6]} /><meshLambertMaterial color="#5a8a3a" /></mesh>
        <mesh position={[0.07, 0.1, 0]} rotation={[0, 0, -0.6]} scale={[0.09, 0.035, 0.05]}><sphereGeometry args={[1, 14, 10]} /><meshLambertMaterial color="#7be36b" /></mesh>
        <mesh position={[-0.06, 0.09, 0]} rotation={[0, 0, 0.7]} scale={[0.07, 0.03, 0.045]}><sphereGeometry args={[1, 14, 10]} /><meshLambertMaterial color="#9ff08a" /></mesh>
      </group>
    );
    case 'fogo': return <mesh ref={flame} position={[0, top + 0.06, 0]}><coneGeometry args={[1, 1, 12]} /><meshBasicMaterial color="#ffb347" toneMapped={false} /></mesh>;
    case 'gelo': return <mesh position={[0, top + 0.05, 0]} scale={[0.06, 0.12, 0.06]}><octahedronGeometry args={[1, 0]} /><meshPhysicalMaterial color="#d8f4ff" roughness={0.05} clearcoat={1} emissive="#9fdcff" emissiveIntensity={0.4} /></mesh>;
    case 'agua': return <mesh position={[0, top + 0.03, 0]} scale={[0.05, 0.07, 0.05]}><sphereGeometry args={[1, 16, 12]} /><meshPhysicalMaterial color="#6fd0ff" roughness={0.05} clearcoat={1} transparent opacity={0.85} /></mesh>;
    case 'luz': return <mesh position={[0, top + 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.14, 0.015, 8, 32]} /><meshBasicMaterial color="#fff1a8" toneMapped={false} /></mesh>;
    case 'sombra': return (
      <group position={[0, top - 0.06, 0.05]}>
        {[-1, 1].map((sx) => <mesh key={sx} position={[sx * 0.13, 0.04, 0]} rotation={[0, 0, -sx * 0.5]}><coneGeometry args={[0.035, 0.12, 10]} /><meshLambertMaterial color="#3a2a5a" /></mesh>)}
      </group>
    );
    case 'raio': return <mesh position={[0, top + 0.05, 0]} rotation={[0, 0, 0.4]} scale={[0.03, 0.11, 0.03]}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#ffe14d" toneMapped={false} /></mesh>;
    case 'terra': return <mesh position={[0.05, top - 0.01, 0]} scale={[0.08, 0.05, 0.07]}><dodecahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#b08a5a" flatShading /></mesh>;
    case 'vento': return <mesh position={[0, top + 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.07, 0.012, 8, 24, Math.PI * 1.5]} /><meshBasicMaterial color="#c8fff0" /></mesh>;
    default: return null;
  }
}
