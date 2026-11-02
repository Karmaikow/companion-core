/**
 * Recurso de coleta com modelo em partes (os .glb do Tripo vêm divididos: tronco, galhos, folhas, pétalas…).
 * O modelo mostra o quanto ainda dá para coletar: cheio = todas as partes; pela metade = metade delas; esgotado = só a
 * base (o tronco, o miolo da planta). Durante a coleta, as partes saem uma a uma, encolhendo no próprio lugar, na
 * medida do tempo da ação — quando o servidor confirma, a abundância nova já bate com o que está na tela.
 *
 * As partes saem de fora para dentro e de cima para baixo (galhos e pétalas primeiro). Texturas acima de 512 px são
 * reduzidas ao carregar (uma flor de meio metro não precisa de 1024 px, e cada uma pesava ~5 MB de memória de vídeo).
 */
import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NODE_KINDS } from '@rules';
import { useEcos } from '../ecos/ecosStore';
import { fitTextures } from './fitTextures';

export interface PartedSpec {
  url: string;
  /** maior medida do modelo, em metros */
  size: number;
  /** cor das runas e cristais (troca o azul do modelo) */
  tint?: string;
  /** multiplica a cor de todo o modelo (variedades: erva lunar azulada, salgueiro antigo musgoso) */
  color?: string;
  /** brilho leve na cor dada (recursos raros) */
  glow?: string;
  /** cópias do modelo em volta, [x, z, escala, giro]: viram partes que saem na coleta (pedrinhas do cascalho) */
  copies?: [number, number, number, number][];
}
/** Recursos que já têm modelo; os outros continuam com o desenho por código. */
export const RESOURCE_MODELS: Partial<Record<string, PartedSpec>> = {
  salgueiro: { url: '/ecos_salgueiro.glb', size: 3.2 },
  erva: { url: '/ecos_erva.glb', size: 0.85 },
  // variedades: o mesmo modelo, com outra cor (e brilho nas raras)
  'erva-lunar': { url: '/ecos_erva.glb', size: 0.95, color: '#b9d2ff', glow: '#9fc4ff' },
  'salgueiro-antigo': { url: '/ecos_salgueiro.glb', size: 4.6, color: '#c7d6a8', glow: '#7fd6a0' },
  // pacote Stylized Nature (Quaternius, CC0): árvore de tronco + copa; pedras com as menores em volta
  carvalho: { url: '/assets/natureza/CommonTree_3.glb', size: 4.4 },
  granito: { url: '/assets/natureza/Rock_Medium_2.glb', size: 1.5, copies: [[0.9, 0.5, 0.38, 1.2], [-0.8, 0.6, 0.3, 2.4], [0.2, -0.9, 0.32, 0.7]] },
  cascalho: { url: '/assets/natureza/Pebble_Round_3.glb', size: 0.55, copies: [[0.45, 0.15, 0.8, 0.9], [-0.35, 0.35, 0.7, 2.1], [0.1, -0.45, 0.75, 3.3], [-0.5, -0.25, 0.6, 1.6], [0.55, -0.4, 0.55, 4.4]] },
  // pedra rúnica: a mesma pedra, com runas e cristais na cor do material
  'pedra-inscrita': { url: '/ecos_runa.glb', size: 1.6, tint: '#b98cff' },
  geodo: { url: '/ecos_runa.glb', size: 1.3, tint: '#5cc6ff' },
  cobre: { url: '/ecos_runa.glb', size: 1.4, tint: '#3fd0a0' },
  'veio-prateado': { url: '/ecos_runa.glb', size: 1.4, tint: '#e6ecf5' },
};

/**
 * Troca o azul das runas e dos cristais pela cor pedida, pixel a pixel (a pedra cinza e o musgo ficam): matiz e
 * luz vêm da cor nova, o desenho e o sombreado ficam os do modelo. Devolve a textura nova e quanto dela mudou.
 */
const tinted = new Map<string, { tex: THREE.Texture; share: number }>();
function tintTexture(t: THREE.Texture, hex: string): { tex: THREE.Texture; share: number } {
  const key = t.uuid + hex;
  const hit = tinted.get(key);
  if (hit) return hit;
  const img = t.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height), d = data.data;
  const to = new THREE.Color(hex), hsl = { h: 0, s: 0, l: 0 }; to.getHSL(hsl);
  const px = new THREE.Color(), p = { h: 0, s: 0, l: 0 };
  let changed = 0;
  for (let i = 0; i < d.length; i += 4) {
    px.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255).getHSL(p);
    // azul/ciano saturado: é runa ou cristal
    if (p.h < 0.47 || p.h > 0.72 || p.s < 0.3 || p.l < 0.12) continue;
    // cor nova com a luz do pixel (prata: quase sem saturação)
    px.setHSL(hsl.h, Math.min(1, hsl.s * (0.6 + p.s * 0.6)), Math.min(0.95, p.l * (0.55 + hsl.l)));
    d[i] = px.r * 255; d[i + 1] = px.g * 255; d[i + 2] = px.b * 255;
    changed++;
  }
  ctx.putImageData(data, 0, 0);
  const tex = t.clone(); tex.source = new THREE.Source(c); tex.needsUpdate = true;
  const out = { tex, share: changed / (d.length / 4) };
  tinted.set(key, out);
  return out;
}
/** Até onde o modelo detalhado aparece; mais longe, o desenho simples (bem mais leve). */
export const PARTED_NEAR = 22;

interface Part { mesh: THREE.Mesh; center: THREE.Vector3; rank: number }
interface Prepared { template: THREE.Group; core: number; order: number[] }
const prepared = new Map<string, Prepared>();

/** Modelo normalizado (tamanho, pé no chão, centrado) e a ordem em que as partes saem. Uma vez por arquivo. */
function prepare(scene: THREE.Object3D, spec: PartedSpec): Prepared {
  const key = spec.url + '|' + spec.size + '|' + (spec.tint ?? '') + '|' + (spec.color ?? '') + '|' + (spec.copies?.length ?? 0);
  const hit = prepared.get(key);
  if (hit) return hit;
  const root = new THREE.Group();
  const obj = fitTextures(scene, 512).clone(true);
  const box = new THREE.Box3().setFromObject(obj), ext = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const s = spec.size / Math.max(ext.x, ext.y, ext.z, 1e-3);
  obj.scale.setScalar(s);
  obj.position.set(-mid.x * s, -box.min.y * s, -mid.z * s);
  root.add(obj);
  // cópias menores em volta (cada uma vira uma parte que sai na coleta)
  for (const [x, z, k, rot] of spec.copies ?? []) {
    const c = obj.clone(true);
    c.scale.setScalar(s * k); c.rotation.y = rot;
    c.position.set(x * spec.size - mid.x * s * k, -box.min.y * s * k, z * spec.size - mid.z * s * k);
    root.add(c);
  }
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  // runas e cristais na cor deste recurso; as partes que são quase só cristal ganham um brilho leve
  if (spec.tint) for (const m of meshes) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!mat.map) continue;
    const { tex, share } = tintTexture(mat.map, spec.tint);
    if (share === 0) continue;
    const next = mat.clone(); next.map = tex;
    if (share > 0.35) { next.emissive = new THREE.Color(spec.tint); next.emissiveMap = tex; next.emissiveIntensity = 0.35; }
    m.material = next;
  }
  // variedade: outra cor no modelo todo (e um brilho leve nas raras)
  if (spec.color || spec.glow) for (const m of meshes) {
    const next = (m.material as THREE.MeshStandardMaterial).clone();
    if (spec.color) next.color.multiply(new THREE.Color(spec.color));
    if (spec.glow) { next.emissive = new THREE.Color(spec.glow); next.emissiveIntensity = 0.18; }
    m.material = next;
  }
  const H = spec.size;
  const info = meshes.map((m, i) => {
    const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    // sombra só das partes grandes (as gotinhas e pétalas soltas não precisam)
    m.castShadow = Math.max(sz.x, sz.y, sz.z) > H * 0.15; m.receiveShadow = true;
    return { i, vol: sz.x * sz.y * sz.z, grounded: b.min.y < H * 0.1, score: c.y / H + Math.hypot(c.x, c.z) / H };
  });
  // a base fica: a maior parte que encosta no chão (tronco, miolo)
  const ground = info.filter((p) => p.grounded);
  const core = (ground.length ? ground : info).reduce((a, b) => (b.vol > a.vol ? b : a)).i;
  // o resto sai de fora para dentro, de cima para baixo: order[0] é a última a sair
  const order = info.filter((p) => p.i !== core).sort((a, b) => a.score - b.score).map((p) => p.i);
  const out = { template: root, core, order };
  prepared.set(key, out);
  return out;
}

class Fallback extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Model({ spec, nodeId, kind, amount }: { spec: PartedSpec; nodeId: string; kind: string; amount: number }) {
  const { scene } = useGLTF(spec.url);
  const { model, parts } = useMemo(() => {
    const p = prepare(scene, spec);
    const model = p.template.clone(true);
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    // centro de cada parte no espaço dela (para encolher no próprio lugar)
    const parts: Part[] = p.order.map((idx, rank) => {
      const m = meshes[idx];
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      return { mesh: m, center: m.geometry.boundingBox!.getCenter(new THREE.Vector3()), rank };
    });
    return { model, parts };
  }, [scene, spec]);
  const amountRef = useRef(amount); amountRef.current = amount;
  // testes no navegador (só no dev): window.__parted.get(nodeId) → partes e a abundância que o modelo está usando
  if (import.meta.env.DEV) ((window as unknown as { __parted?: Map<string, unknown> }).__parted ??= new Map()).set(nodeId, { parts, model, amountRef });
  const cap = NODE_KINDS[kind]?.capacity ?? 1;
  useFrame(() => {
    // quanto resta agora; durante a coleta deste recurso, desconta o custo na medida do tempo
    let left = amountRef.current;
    const run = useEcos.getState().run;
    if (run && run.node === nodeId && !run.inspect && (run.phase === 'coletando' || run.phase === 'confirmando') && run.started > 0) {
      const cost = NODE_KINDS[kind]?.approaches.find((a) => a.id === run.approach)?.cost ?? 0;
      const k = Math.min(1, Math.max(0, (Date.now() - run.started) / (run.seconds * 1000)));
      left -= cost * k;
    }
    const frac = Math.max(0, Math.min(1, left / cap)), n = parts.length;
    // modelo de uma peça só (uma pedra): encolhe conforme acaba
    if (!n) { const k = 0.55 + 0.45 * frac; if (model.scale.x !== k) model.scale.setScalar(k); return; }
    for (const p of parts) {
      // cada parte ocupa uma fatia: presente = 1, saindo = entre 0 e 1, fora = 0
      const s = Math.max(0, Math.min(1, frac * n - p.rank));
      const m = p.mesh;
      m.visible = s > 0.02;
      if (m.visible && m.scale.x !== s) { m.scale.setScalar(s); m.position.copy(p.center).multiplyScalar(1 - s); }
    }
  });
  return <primitive object={model} dispose={null} />;
}

/** Recurso em partes (com o desenho simples enquanto carrega ou se o arquivo falhar). */
export function PartedResource({ spec, nodeId, kind, amount, fallback }: { spec: PartedSpec; nodeId: string; kind: string; amount: number; fallback: ReactNode }) {
  return <Fallback fallback={fallback}><Suspense fallback={fallback}><Model spec={spec} nodeId={nodeId} kind={kind} amount={amount} /></Suspense></Fallback>;
}
