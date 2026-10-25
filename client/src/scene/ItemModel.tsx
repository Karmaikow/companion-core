/**
 * Modelo de um item do Arsenal: o .GLB enviado ou um modelo gerado por código (espada, faca, maça, lança, cajado,
 * varinha, arco, escudo, grimório, orbe, chapéu, tiara, laço, coroa, mochila, aljava).
 * Convenção: a origem é o ponto de pegada (a mão, o alto da cabeça, o meio das costas); armas apontam para +Y
 * (a lâmina sobe a partir da mão); a frente do personagem é +Z.
 * `charge` (0..1) estica a corda do arco e mostra a flecha encaixada. `draw` (a mão que puxa): a corda vai até ela quando
 * a mão está atrás do arco, então a flecha encaixa e a corda estica junto com a animação de tiro.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ELEMENTS, ITEM_TYPES, RARITIES, type ItemDef } from '@rules';
import { lookUniforms, setLook, withLook } from './look';

export function ItemModel({ item, charge, draw }: { item: ItemDef; charge?: { current: number }; draw?: THREE.Object3D | null }) {
  const size = ITEM_TYPES[item.type].size * item.grip.scale;
  return (
    <group position={item.grip.pos} rotation={item.grip.rot}>
      {item.model ? <GlbItem item={item} size={size} /> : <ProcItem item={item} size={size} charge={charge} draw={draw} />}
    </group>
  );
}

function GlbItem({ item, size }: { item: ItemDef; size: number }) {
  const { scene } = useGLTF(item.model!.url);
  const { obj, lu } = useMemo(() => {
    const lu = lookUniforms();
    const obj = scene.clone(true);
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.material = withLook((m.material as THREE.Material).clone(), lu); } });
    const box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = size / Math.max(1e-3, sz.x, sz.y, sz.z);
    obj.scale.setScalar(k);
    obj.position.set(-c.x * k, -box.min.y * k, -c.z * k); // base do modelo na pegada
    return { obj, lu };
  }, [scene, size]);
  useEffect(() => setLook(lu, item.look), [lu, item.look]);
  return <primitive object={obj} />;
}

const M = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });

function ProcItem({ item, size, charge, draw }: { item: ItemDef; size: number; charge?: { current: number }; draw?: THREE.Object3D | null }) {
  const { primary, secondary, metal, gem, variant } = item.proc;
  const gemColor = item.essence ? ELEMENTS[item.essence].glow : RARITIES[item.rarity].color;
  const mats = useMemo(() => ({
    a: M(primary), b: M(secondary), metal: M(metal, { metalness: 0.55, roughness: 0.3 }),
    gem: M(gemColor, { emissive: gemColor, emissiveIntensity: 0.9, roughness: 0.15 }),
  }), [primary, secondary, metal, gemColor]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const s = size;
  const Gem = ({ p, r = 0.035 }: { p: [number, number, number]; r?: number }) => gem ? <mesh position={p} material={mats.gem} scale={[r, r * 1.4, r]}><octahedronGeometry args={[1, 0]} /></mesh> : null;

  switch (item.type) {
    case 'espada': case 'faca': {
      const blade = s * 0.78, w = item.type === 'faca' ? 0.05 : 0.075;
      const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, blade * 0.82); shape.lineTo(0, blade); shape.lineTo(-w / 2, blade * 0.82); shape.closePath();
      return (
        <group>
          <mesh position={[0, -0.02, 0]} material={mats.b} castShadow><cylinderGeometry args={[0.018, 0.02, 0.12, 10]} /></mesh>
          <mesh position={[0, -0.085, 0]} material={mats.metal}><sphereGeometry args={[0.026, 12, 10]} /></mesh>
          <mesh position={[0, 0.045, 0]} material={mats.metal} castShadow><boxGeometry args={[item.type === 'faca' ? 0.1 : 0.17, 0.025, 0.04]} /></mesh>
          <mesh position={[0, 0.058, -0.008]} material={variant === 0 && item.type === 'espada' ? mats.a : mats.metal} castShadow>
            <extrudeGeometry args={[shape, { depth: 0.016, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }]} />
          </mesh>
          <Gem p={[0, 0.045, 0.024]} r={0.02} />
        </group>
      );
    }
    case 'maca': {
      const L = s * 0.7;
      return (
        <group>
          <mesh position={[0, L / 2 - 0.08, 0]} material={mats.b} castShadow><cylinderGeometry args={[0.02, 0.024, L, 10]} /></mesh>
          <mesh position={[0, L - 0.04, 0]} material={mats.a} castShadow><dodecahedronGeometry args={[0.1, 0]} /></mesh>
          {Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.1, L - 0.04 + (i % 2 ? 0.03 : -0.03), Math.sin(a) * 0.1]} rotation={[0, -a, -Math.PI / 2]} material={mats.metal}><coneGeometry args={[0.025, 0.07, 6]} /></mesh>; })}
          <mesh position={[0, L + 0.07, 0]} material={mats.metal}><coneGeometry args={[0.025, 0.07, 6]} /></mesh>
          <Gem p={[0, L - 0.04, 0.1]} />
        </group>
      );
    }
    case 'lanca': {
      const L = s;
      return (
        <group position={[0, -L * 0.35, 0]}>
          <mesh position={[0, L / 2, 0]} material={mats.b} castShadow><cylinderGeometry args={[0.016, 0.018, L, 8]} /></mesh>
          <mesh position={[0, L + 0.08, 0]} material={mats.metal} castShadow scale={[1, 1, 0.45]}><coneGeometry args={[0.045, 0.2, 4]} /></mesh>
          <mesh position={[0, L - 0.02, 0]} material={mats.metal}><torusGeometry args={[0.024, 0.008, 6, 14]} /></mesh>
          <mesh position={[0.03, L - 0.08, 0]} rotation={[0, 0, -0.4]} material={mats.a}><boxGeometry args={[0.02, 0.16, 0.004]} /></mesh>
          <Gem p={[0, L - 0.02, 0.03]} r={0.02} />
        </group>
      );
    }
    case 'cajado': return <Staff L={s} mats={mats} gem={gem} />;
    case 'varinha': return <Wand L={s} mats={mats} />;
    case 'arco': return <Bow size={s} mats={mats} charge={charge} draw={draw} />;
    case 'escudo': return (
      <group rotation={[0, 0, 0]}>
        <mesh material={mats.a} castShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[s / 2, s / 2, 0.04, 28]} /></mesh>
        <mesh material={mats.metal} position={[0, 0, 0.0]}><torusGeometry args={[s / 2, 0.018, 8, 32]} /></mesh>
        <mesh material={mats.b} position={[0, 0, 0.024]} scale={[s * 0.22, s * 0.36, 0.01]}><sphereGeometry args={[1, 16, 12]} /></mesh>
        <Gem p={[0, 0, 0.04]} r={0.04} />
      </group>
    );
    case 'grimorio': return (
      <group>
        <mesh material={mats.a} castShadow><boxGeometry args={[s, s * 1.25, 0.07]} /></mesh>
        <mesh material={mats.b} position={[0.008, 0, 0]}><boxGeometry args={[s * 0.94, s * 1.18, 0.075]} /></mesh>
        <mesh material={mats.metal} position={[-s / 2, 0, 0]}><boxGeometry args={[0.02, s * 1.27, 0.08]} /></mesh>
        <Gem p={[0, 0, 0.045]} r={0.03} />
      </group>
    );
    case 'orbe': return <Orb size={s} mats={mats} />;
    case 'chapeu': return (
      <group>
        <mesh material={mats.a} castShadow><cylinderGeometry args={[s * 0.62, s * 0.62, 0.02, 28]} /></mesh>
        <mesh material={mats.b} position={[0, 0.03, 0]}><cylinderGeometry args={[s * 0.3, s * 0.3, 0.05, 24]} /></mesh>
        <mesh material={mats.a} position={[0, s * 0.42, -0.02]} rotation={[-0.25, 0, 0.1]} castShadow><coneGeometry args={[s * 0.28, s * 0.85, 24]} /></mesh>
      </group>
    );
    case 'tiara': return (
      <group rotation={[-0.25, 0, 0]}>
        <mesh material={mats.metal} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[s / 2, 0.012, 8, 32, Math.PI]} /></mesh>
        <Gem p={[0, 0.02, s / 2]} r={0.035} />
      </group>
    );
    case 'laco': return (
      <group position={[0.08, 0, -0.02]}>
        {[-1, 1].map((k) => <mesh key={k} material={mats.a} position={[k * s * 0.3, 0, 0]} rotation={[0, 0, k * 0.4]} scale={[s * 0.32, s * 0.2, 0.05]} castShadow><sphereGeometry args={[1, 14, 10]} /></mesh>)}
        <mesh material={mats.b} scale={[s * 0.12, s * 0.12, 0.06]}><sphereGeometry args={[1, 12, 10]} /></mesh>
      </group>
    );
    case 'coroa': return (
      <group>
        {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * s / 2, 0, Math.sin(a) * s / 2]} material={i % 2 ? mats.b : mats.metal} scale={0.035}><icosahedronGeometry args={[1, 0]} /></mesh>; })}
        <mesh material={mats.a} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[s / 2, 0.012, 6, 30]} /></mesh>
      </group>
    );
    case 'mochila': return (
      <group position={[0, -0.05, -0.12]}>
        <mesh material={mats.a} castShadow><boxGeometry args={[s * 0.8, s, s * 0.45]} /></mesh>
        <mesh material={mats.b} position={[0, s * 0.3, s * 0.05]} rotation={[0.3, 0, 0]}><boxGeometry args={[s * 0.84, s * 0.35, s * 0.46]} /></mesh>
        <mesh material={mats.metal} position={[0, s * 0.12, -s * 0.24]}><boxGeometry args={[0.04, 0.03, 0.02]} /></mesh>
      </group>
    );
    case 'aljava': return (
      <group position={[0.04, 0, -0.12]} rotation={[0, 0, 0.45]}>
        <mesh material={mats.a} castShadow><cylinderGeometry args={[0.055, 0.045, s * 0.75, 12]} /></mesh>
        {[-0.02, 0.02, 0].map((x, i) => <group key={i} position={[x, s * 0.42, (i - 1) * 0.015]}><mesh material={mats.metal}><cylinderGeometry args={[0.005, 0.005, s * 0.25, 5]} /></mesh><mesh material={mats.b} position={[0, s * 0.12, 0]} scale={[0.02, 0.05, 0.005]}><sphereGeometry args={[1, 8, 6]} /></mesh></group>)}
      </group>
    );
    // capa: um manto preso nos ombros, caindo atrás (peça rígida, levemente curva)
    case 'capa': return (
      <group position={[0, 0.08, -0.13]} rotation={[0.12, 0, 0]}>
        <mesh material={mats.a} position={[0, -s * 0.45, 0]} castShadow><cylinderGeometry args={[s * 0.32, s * 0.42, s * 0.9, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8]} /></mesh>
        <mesh material={mats.metal} position={[0, 0.02, 0.07]}><sphereGeometry args={[0.025, 10, 8]} /></mesh>
        <mesh material={mats.b} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[s * 0.3, 0.012, 6, 20, Math.PI]} /></mesh>
      </group>
    );
    case 'elmo': return (
      <group>
        <mesh material={mats.metal} castShadow><sphereGeometry args={[s / 2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <mesh material={mats.a} position={[0, s * 0.42, 0]} scale={[0.03, s * 0.25, s * 0.35]}><sphereGeometry args={[1, 10, 8]} /></mesh>
        <Gem p={[0, s * 0.18, s * 0.46]} />
      </group>
    );
    // sem osso no corpo (só atributos por enquanto): formas para a prévia e o ícone
    case 'armadura': case 'tunica': return (
      <group>
        <mesh material={mats.a} castShadow scale={[s * 0.42, s * 0.5, s * 0.25]}><sphereGeometry args={[1, 16, 12]} /></mesh>
        {item.type === 'armadura' && [-1, 1].map((k) => <mesh key={k} material={mats.metal} position={[k * s * 0.38, s * 0.32, 0]} scale={[s * 0.16, s * 0.1, s * 0.16]}><sphereGeometry args={[1, 10, 8]} /></mesh>)}
        <mesh material={mats.b} position={[0, -s * 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[s * 0.36, 0.02, 6, 24]} /></mesh>
        <Gem p={[0, s * 0.15, s * 0.25]} />
      </group>
    );
    case 'botas': return (
      <group>
        {[-1, 1].map((k) => <group key={k} position={[k * 0.08, 0, 0]}><mesh material={mats.a} castShadow position={[0, s * 0.25, 0]}><cylinderGeometry args={[0.045, 0.05, s * 0.5, 10]} /></mesh><mesh material={mats.b} position={[0, 0.02, 0.04]} scale={[0.055, 0.035, 0.09]}><sphereGeometry args={[1, 10, 8]} /></mesh></group>)}
      </group>
    );
    case 'bracelete': return <mesh material={mats.metal} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.05, 0.014, 8, 20]} /></mesh>;
    // materiais e diversos: formas simples para a prévia (um .GLB pode substituir)
    case 'madeira': return <group rotation={[0, 0, Math.PI / 2]}><mesh material={mats.a} castShadow><cylinderGeometry args={[0.06, 0.065, s, 10]} /></mesh><mesh material={mats.b} position={[0, s / 2, 0]}><cylinderGeometry args={[0.055, 0.055, 0.005, 10]} /></mesh></group>;
    case 'minerio': case 'pedra': return <mesh material={item.type === 'minerio' ? mats.metal : mats.a} castShadow scale={[s * 0.4, s * 0.3, s * 0.35]}><dodecahedronGeometry args={[1, 0]} /></mesh>;
    case 'fibra': return <mesh material={mats.a} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[s * 0.25, s * 0.08, 8, 20]} /></mesh>;
    case 'erva': return <group>{[0, 1, 2, 3].map((i) => <mesh key={i} material={i % 2 ? mats.a : mats.b} rotation={[0.4, (i * Math.PI) / 2, 0]} position={[0, s * 0.2, 0]} scale={[0.04, s * 0.35, 0.012]}><sphereGeometry args={[1, 8, 6]} /></mesh>)}</group>;
    case 'gema': return <mesh material={mats.gem} scale={[s * 0.25, s * 0.38, s * 0.25]}><octahedronGeometry args={[1, 0]} /></mesh>;
    case 'essencia': return <group><mesh material={mats.gem} scale={s * 0.22}><icosahedronGeometry args={[1, 1]} /></mesh><mesh scale={s * 0.32}><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color={secondary} transparent opacity={0.25} /></mesh></group>;
    case 'parte': return <group rotation={[0, 0, 0.5]}><mesh material={mats.a}><capsuleGeometry args={[0.03, s * 0.6, 4, 8]} /></mesh>{[-1, 1].map((k) => <mesh key={k} material={mats.a} position={[0, k * s * 0.33, 0]} scale={0.05}><sphereGeometry args={[1, 8, 6]} /></mesh>)}</group>;
    case 'comida': return <mesh material={mats.a} castShadow scale={s * 0.35}><sphereGeometry args={[1, 14, 10]} /></mesh>;
    case 'pocao': return <group><mesh material={mats.gem} scale={[s * 0.3, s * 0.32, s * 0.3]}><sphereGeometry args={[1, 14, 10]} /></mesh><mesh material={mats.b} position={[0, s * 0.38, 0]}><cylinderGeometry args={[0.025, 0.03, s * 0.2, 8]} /></mesh></group>;
    case 'chave': return <group rotation={[0, 0, Math.PI / 2]}><mesh material={mats.metal} position={[0, s * 0.3, 0]}><torusGeometry args={[0.04, 0.012, 6, 16]} /></mesh><mesh material={mats.metal}><boxGeometry args={[0.018, s * 0.5, 0.012]} /></mesh><mesh material={mats.metal} position={[0.025, -s * 0.2, 0]}><boxGeometry args={[0.04, 0.02, 0.012]} /></mesh></group>;
    case 'lembranca': return <group rotation={[0, 0, Math.PI / 2]}><mesh material={mats.b}><cylinderGeometry args={[0.035, 0.035, s * 0.7, 12]} /></mesh>{[-1, 1].map((k) => <mesh key={k} material={mats.a} position={[0, k * s * 0.36, 0]}><cylinderGeometry args={[0.045, 0.045, 0.02, 12]} /></mesh>)}</group>;
    case 'outro': return <mesh material={mats.a} castShadow scale={s * 0.3}><boxGeometry args={[1, 1, 1]} /></mesh>;
    default: return null;
  }
}

/** Arco: braços curvos, corda que estica com a carga (ou vai até a mão que puxa) e a flecha encaixada. Fica de pé na mão. */
function Bow({ size, mats, charge, draw }: { size: number; mats: Record<string, THREE.Material>; charge?: { current: number }; draw?: THREE.Object3D | null }) {
  const h = size / 2;
  const limb = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.02, -h, 0), new THREE.Vector3(0.07, -h * 0.55, 0), new THREE.Vector3(0.09, 0, 0), new THREE.Vector3(0.07, h * 0.55, 0), new THREE.Vector3(-0.02, h, 0)]), 40, 0.016, 8, false), [h]);
  const arrow = useRef<THREE.Group>(null);
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); return g; }, []);
  useEffect(() => () => { limb.dispose(); geo.dispose(); }, [limb, geo]);
  // ponto da mão que segura a corda: a base dos dedos do meio (ou do indicador), senão o punho
  const knuckle = useMemo(() => draw ? draw.children.find((c) => (c as THREE.Bone).isBone && /middle/i.test(c.name)) ?? draw.children.find((c) => (c as THREE.Bone).isBone && /index/i.test(c.name)) ?? draw : null, [draw]);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), d: new THREE.Vector3(), X: new THREE.Vector3(1, 0, 0) }), []);
  const outer = useRef<THREE.Group>(null), spin = useRef<THREE.Group>(null), yaw = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), c = charge?.current ?? 0;
    let x = -0.02 - c * 0.22, y = 0, z = 0, byHand = false, r = 0;
    const o = outer.current, sp = spin.current;
    if (knuckle && o && sp) {
      // mão atrás do arco, na altura do meio da corda e até a puxada máxima: o arco vira de frente para ela (a mão do arco
      // fecha em volta do cabo, então quem diz a direção da flecha é a mão que puxa) e a corda vai até os dedos.
      // Passou da puxada máxima (o braço que voa para trás ao soltar): a corda volta e a flecha some, disparada.
      const p = o.worldToLocal(knuckle.getWorldPosition(tmp.p));
      r = Math.hypot(p.x, p.z);
      if (r < size * 0.5 && Math.abs(p.y) < h * 0.55 && (r > 0.12 || p.x < -0.03)) {
        byHand = true;
        if (r > 0.12) yaw.current += (Math.atan2(p.z, -p.x) - yaw.current) * Math.min(1, dt * 20);
      }
    }
    if (!byHand) yaw.current *= Math.max(0, 1 - dt * 3);
    if (sp) sp.rotation.y = yaw.current;
    if (byHand && sp && knuckle) {
      sp.updateMatrixWorld(true);
      const q = sp.worldToLocal(knuckle.getWorldPosition(tmp.p));
      x = Math.min(-0.02, q.x); y = q.y; z = q.z;
    }
    const pos = geo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, -0.02, -h, 0); pos.setXYZ(1, x, y, z); pos.setXYZ(2, -0.02, h, 0); pos.needsUpdate = true;
    if (arrow.current) {
      arrow.current.visible = c > 0.01 || (byHand && r > 0.12);
      arrow.current.position.set(x, y, z);
      // a flecha sai do encaixe na corda e passa pelo apoio do arco
      tmp.d.set(0.09 - x, -y, -z).normalize();
      arrow.current.quaternion.setFromUnitVectors(tmp.X, tmp.d);
    }
  });
  const line = useMemo(() => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f3efe0' })), [geo]);
  return (
    <group ref={outer}>
      <group ref={spin}>
        <mesh geometry={limb} material={mats.a} castShadow />
        <mesh material={mats.b} position={[0.09, 0, 0]}><cylinderGeometry args={[0.022, 0.022, 0.1, 8]} /></mesh>
        <primitive object={line} />
        <group ref={arrow} visible={false}>
          {/* flecha na horizontal, ponta para +X (para frente do arco) */}
          <mesh material={mats.metal} rotation={[0, 0, -Math.PI / 2]} position={[0.24, 0, 0]}><cylinderGeometry args={[0.006, 0.006, 0.48, 6]} /></mesh>
          <mesh material={mats.gem} rotation={[0, 0, -Math.PI / 2]} position={[0.5, 0, 0]}><coneGeometry args={[0.02, 0.06, 6]} /></mesh>
          <mesh material={mats.b} position={[0.03, 0, 0]} scale={[0.04, 0.02, 0.004]}><sphereGeometry args={[1, 8, 6]} /></mesh>
        </group>
      </group>
    </group>
  );
}

/** Orbe: flutua e gira um pouco acima da mão. */
function Orb({ size, mats }: { size: number; mats: Record<string, THREE.Material> }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => { if (g.current) { g.current.position.y = 0.18 + Math.sin(s.clock.elapsedTime * 2) * 0.03; g.current.rotation.y = s.clock.elapsedTime; } });
  return (
    <group ref={g}>
      <mesh material={mats.gem}><sphereGeometry args={[size / 2, 20, 16]} /></mesh>
      <mesh material={mats.metal} rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[size * 0.65, 0.006, 6, 28]} /></mesh>
    </group>
  );
}

function Staff({ L, mats, gem }: { L: number; mats: Record<string, THREE.Material>; gem: boolean }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.015, L * 0.35, 0), new THREE.Vector3(-0.015, L * 0.7, 0), new THREE.Vector3(0.02, L * 0.92, 0), new THREE.Vector3(0.09, L * 1.02, 0), new THREE.Vector3(0.06, L * 0.93, 0)]), [L]);
  return (
    <group position={[0, -L * 0.4, 0]}>
      <mesh material={mats.a} castShadow><tubeGeometry args={[curve, 40, 0.02, 8, false]} /></mesh>
      {gem && <mesh position={[0.045, L * 0.96, 0]} material={mats.gem} scale={[0.05, 0.08, 0.05]}><octahedronGeometry args={[1, 0]} /></mesh>}
      {[0, 1, 2].map((i) => <mesh key={i} position={[0.02 + i * 0.02, L * (0.84 - i * 0.05), 0.01]} rotation={[0, 0, -0.8 + i * 0.5]} scale={[0.035, 0.016, 0.01]} material={mats.b}><sphereGeometry args={[1, 10, 8]} /></mesh>)}
    </group>
  );
}

function Wand({ L, mats }: { L: number; mats: Record<string, THREE.Material> }) {
  const star = useMemo(() => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.022 : 0.05, a = (i / 10) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); } sh.closePath(); return sh; }, []);
  return (
    <group position={[0, -0.05, 0]}>
      <mesh position={[0, L / 2, 0]} material={mats.a} castShadow><cylinderGeometry args={[0.008, 0.014, L, 8]} /></mesh>
      <mesh position={[0, 0.03, 0]} material={mats.b}><cylinderGeometry args={[0.016, 0.016, 0.06, 8]} /></mesh>
      <mesh position={[0, L + 0.04, -0.006]} material={mats.gem}><extrudeGeometry args={[star, { depth: 0.012, bevelEnabled: false }]} /></mesh>
    </group>
  );
}
