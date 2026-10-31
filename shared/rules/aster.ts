/**
 * Áster, a Cidade-Farol — dois mapas fixos (todo mundo vê o mesmo), fora do Companion World:
 *
 * - **Arredores**: a cidade no centro (vista de fora: muralha + Cristal Ápice) e os anéis de defesa em volta —
 *   Labirinto Prismático (colado na muralha), Trincheiras Rúnicas (meio) e Campos Cinzentos (fora, com crateras e
 *   cristais mortos). Quatro portões (norte, leste, sul, oeste) levam para dentro da cidade; quatro estradas saem
 *   deles e dividem os arredores em quatro setores. A Estrada para Áster chega do Companion World pelo sul.
 * - **Cidade**: o interior, montado à mão no Estúdio da Cidade (O Administrador) com os modelos do ADM. O layout
 *   (peças .GLB + marcadores de lojas, forja, escolas, portões…) fica na tabela `city_layouts`; cada peça diz se
 *   aparece na cidade normal, na destruída ou nas duas.
 *
 * Funções puras e determinísticas: o cliente desenha, os testes conferem e o servidor do cerco (fase 5) usa o mesmo.
 */

// ---------------------------------------------------------------------------
// Portões
// ---------------------------------------------------------------------------

export type GateId = 'norte' | 'leste' | 'sul' | 'oeste';
export const GATE_IDS: GateId[] = ['norte', 'leste', 'sul', 'oeste'];
/** direção de cada portão (x para o leste, z para o sul — o norte é -z, como no mapa) */
export const GATES: Record<GateId, { label: string; dx: number; dz: number }> = {
  norte: { label: 'Portão Norte', dx: 0, dz: -1 },
  leste: { label: 'Portão Leste', dx: 1, dz: 0 },
  sul: { label: 'Portão Sul', dx: 0, dz: 1 },
  oeste: { label: 'Portão Oeste', dx: -1, dz: 0 },
};

// ---------------------------------------------------------------------------
// Arredores
// ---------------------------------------------------------------------------

export const OUT_WALL_R = 70;    // muralha da cidade vista de fora (m)
/** fosso de água em volta da muralha, por fora (raio de onde começa a onde termina) */
export const MOAT_OUT: readonly [number, number] = [OUT_WALL_R + 1.5, OUT_WALL_R + 12];
/** fosso por dentro: do portal de dentro até a muralha (o Companion chega até o começo da ponte) */
export const MOAT_IN: readonly [number, number] = [61, OUT_WALL_R - 1.5];
export const MOAT_DEPTH = 2.4;
export const WATER_Y = -0.8;     // nível da água nos fossos
/** meia largura do piso de cada ponte (m): por onde o Companion anda sobre o fosso */
export const BRIDGE_HW = 3;
/** quanto para fora do portão se chega vindo da cidade (já do outro lado da ponte) */
export const OUT_GATE_ARRIVE = MOAT_OUT[1] - OUT_WALL_R + 3;
export const LABYRINTH_R = 108;  // fim do Labirinto Prismático
export const TRENCH_R = 150;     // fim das Trincheiras Rúnicas
export const FIELDS_R = 246;     // fim dos Campos Cinzentos
export const OUT_R = 262;        // além disso, morros fecham o mapa
export const GATE_GAP = 6;       // meia largura da abertura de cada portão na muralha (m)
export const ROAD_W = 4.5;       // meia largura das estradas que saem dos portões
/** onde a Estrada para Áster chega (vindo do Companion World) e o portal de volta */
export const OUT_ARRIVAL = { x: 0, z: 236 } as const;
export const TRENCH_RINGS = [118, 136];

export type OutskirtsRing = 'cidade' | 'labirinto' | 'trincheiras' | 'campos' | 'borda';
export const RING_LABEL: Record<OutskirtsRing, string> = {
  cidade: 'Muralhas de Áster', labirinto: 'Labirinto Prismático', trincheiras: 'Trincheiras Rúnicas', campos: 'Campos Cinzentos', borda: 'Confins de Áster',
};

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (...n: number[]) => { let h = 0x2545f491; for (const v of n) { h = (h + Math.imul(v | 0, 374761393)) | 0; h = Math.imul(h ^ (h >>> 15), 668265263); } h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const vnoise = (x: number, y: number, salt: number) => {
  const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi; xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, salt), b = hash(xi + 1, yi, salt), c = hash(xi, yi + 1, salt), d = hash(xi + 1, yi + 1, salt);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};
const fbm = (x: number, y: number, salt = 0) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { v += a * vnoise(x * f, y * f, salt + i); f *= 2.03; a *= 0.5; } return v / 0.9375; };

/** Setor pelo portão mais perto (o ângulo decide). */
export function sectorAt(x: number, z: number): GateId {
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'leste' : 'oeste') : (z > 0 ? 'sul' : 'norte');
}
export function ringAt(x: number, z: number): OutskirtsRing {
  const r = Math.hypot(x, z);
  return r < OUT_WALL_R ? 'cidade' : r < LABYRINTH_R ? 'labirinto' : r < TRENCH_R ? 'trincheiras' : r < FIELDS_R ? 'campos' : 'borda';
}
/** Nome do lugar para o brasão: "Trincheiras Rúnicas · Setor Norte". */
export function outskirtsPlaceName(x: number, z: number): string {
  const ring = ringAt(x, z);
  if (ring === 'cidade') return RING_LABEL.cidade;
  return `${RING_LABEL[ring]} · Setor ${GATES[sectorAt(x, z)].label.replace('Portão ', '')}`;
}

/** Distância até a estrada mais perto: as quatro saem dos portões em linha reta (os eixos, fora da muralha). */
export function roadDistance(x: number, z: number): number {
  if (Math.hypot(x, z) < OUT_WALL_R - 2) return Infinity;
  return Math.min(Math.abs(x), Math.abs(z));
}

export interface Crater { x: number; z: number; r: number }
/** Crateras de guerras passadas, só nos Campos Cinzentos e fora das estradas. Fixas. */
export const CRATERS: Crater[] = (() => {
  const out: Crater[] = [];
  for (let k = 0; out.length < 70 && k < 600; k++) {
    const a = hash(k, 11) * Math.PI * 2, rr = TRENCH_R + 10 + hash(k, 12) * (FIELDS_R - TRENCH_R - 22), r = 3 + hash(k, 13) * 6;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (roadDistance(x, z) < ROAD_W + r + 3) continue;
    if (Math.hypot(x - OUT_ARRIVAL.x, z - OUT_ARRIVAL.z) < 18) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r + 4)) continue;
    out.push({ x, z, r });
  }
  return out;
})();

export interface DeadCrystal { x: number; z: number; h: number; tilt: number; rot: number }
/** Cristais mortos espalhados pelos Campos (e alguns nas trincheiras). */
export const DEAD_CRYSTALS: DeadCrystal[] = (() => {
  const out: DeadCrystal[] = [];
  for (let k = 0; out.length < 110 && k < 900; k++) {
    const a = hash(k, 21) * Math.PI * 2, rr = LABYRINTH_R + 20 + hash(k, 22) * (FIELDS_R - LABYRINTH_R - 26);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (roadDistance(x, z) < ROAD_W + 2.5 || TRENCH_RINGS.some((t) => Math.abs(rr - t) < 4)) continue;
    if (CRATERS.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1)) continue;
    if (Math.hypot(x - OUT_ARRIVAL.x, z - OUT_ARRIVAL.z) < 12) continue;
    out.push({ x, z, h: 1 + hash(k, 23) * 3.2, tilt: (hash(k, 24) - 0.5) * 0.6, rot: hash(k, 25) * Math.PI * 2 });
  }
  return out;
})();

export interface LabyrinthWall { x: number; z: number; len: number; rot: number }
/**
 * Paredes do Labirinto Prismático (provisórias, até o ADM montar as dele): arcos de pedra clara em três anéis, com
 * aberturas desencontradas — o caminho até a muralha sempre existe, mas não em linha reta (fora as estradas).
 */
export const LABYRINTH_WALLS: LabyrinthWall[] = (() => {
  const out: LabyrinthWall[] = [];
  const rings = [OUT_WALL_R + 17, OUT_WALL_R + 25, OUT_WALL_R + 33];
  rings.forEach((r, ri) => {
    const seg = 7, n = Math.floor((2 * Math.PI * r) / seg);
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * (2 * Math.PI / n), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (roadDistance(x, z) < ROAD_W + 2) continue;
      // aberturas: em cada anel, num lugar diferente
      if (hash(ri, Math.floor(i / 3), 31) < 0.28) continue;
      out.push({ x, z, len: seg * 0.92, rot: -a + Math.PI / 2 });
    }
  });
  // paredes radiais curtas, fechando corredores
  for (let k = 0; k < 40; k++) {
    const a = hash(k, 41) * Math.PI * 2, r = OUT_WALL_R + 21 + (k % 2) * 8, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (roadDistance(x, z) < ROAD_W + 3) continue;
    out.push({ x, z, len: 8, rot: -a });
  }
  return out;
})();

/** Relevo dos arredores: platô da cidade, labirinto plano, trincheiras fundas, campos ondulados com crateras, morros na borda. */
export function outskirtsHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const road = 1 - smooth(ROAD_W - 1, ROAD_W + 3, roadDistance(x, z));
  let y = (fbm(x * 0.02, z * 0.02, 5) - 0.5) * 3.2 * smooth(LABYRINTH_R, TRENCH_R + 20, r) + (fbm(x * 0.15, z * 0.15, 6) - 0.5) * 0.35;
  // trincheiras: dois fossos circulares (as estradas passam por pontes de terra)
  for (const t of TRENCH_RINGS) y -= 2.4 * Math.exp(-((r - t) ** 2) / 7) * (1 - road);
  // crateras: fundo e borda levantada
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > c.r * 1.6) continue;
    const u = d / c.r;
    y += u < 1 ? -c.r * 0.22 * (1 - u * u) : 0.35 * Math.exp(-((u - 1.1) ** 2) / 0.04);
  }
  y *= 1 - road * 0.85;
  y *= smooth(OUT_WALL_R - 2, OUT_WALL_R + 6, r);            // plano colado na muralha
  y *= smooth(10, 18, Math.hypot(x - OUT_ARRIVAL.x, z - OUT_ARRIVAL.z)); // plano na chegada
  y += smooth(OUT_R - 22, OUT_R + 6, r) * (12 + fbm(x * 0.05, z * 0.05, 7) * 8); // morros
  y -= MOAT_DEPTH * moatBand(r);                                // fosso da muralha (as pontes passam por cima)
  return y;
}

/** 0..1: fundo do fosso de fora (barrancos de ~1,5 m). */
export function moatBand(r: number): number {
  return smooth(MOAT_OUT[0] - 1.5, MOAT_OUT[0] + 0.5, r) * (1 - smooth(MOAT_OUT[1] - 0.5, MOAT_OUT[1] + 1.5, r));
}

/** Pisos das pontes sobre os fossos (retângulos ao longo de cada portão): por dentro e por fora. */
export interface BridgeDeck { gate: GateId; side: 'fora' | 'dentro'; from: number; to: number; hw: number }
export const BRIDGE_DECKS: BridgeDeck[] = GATE_IDS.flatMap((gate) => [
  // de fora começa dentro do vão do portão (o piso do modelo do portão também vale)
  { gate, side: 'fora' as const, from: OUT_WALL_R - 6, to: MOAT_OUT[1] + 1.5, hw: BRIDGE_HW },
  { gate, side: 'dentro' as const, from: MOAT_IN[0] - 1, to: OUT_WALL_R + 2, hw: BRIDGE_HW },
]);
/** De onde a onde vai o modelo da ponte (o piso de fora começa antes, no vão do portão). */
export const bridgeSpan = (d: BridgeDeck): [number, number] => [d.side === 'fora' ? OUT_WALL_R - 2 : d.from, d.to];
/** Ponto (x, z) a `r` do centro e `t` para o lado no eixo do portão. */
export function gateAxisPoint(g: GateId, r: number, t = 0): { x: number; z: number } {
  const G = GATES[g];
  return { x: G.dx * r - G.dz * t, z: G.dz * r + G.dx * t };
}
/** O ponto está em cima de uma ponte? (para a altura do piso) */
export function onBridge(x: number, z: number, side?: 'fora' | 'dentro'): boolean {
  const r = Math.hypot(x, z);
  return BRIDGE_DECKS.some((d) => (!side || d.side === side) && r >= d.from && r <= d.to && Math.abs(GATES[d.gate].dx ? z : x) <= d.hw && (GATES[d.gate].dx ? x * GATES[d.gate].dx : z * GATES[d.gate].dz) > 0);
}

/** 0..1: quanto o chão é terra/lama (estradas, trincheiras, crateras). */
export function outskirtsDirt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const road = 1 - smooth(ROAD_W - 1.2, ROAD_W + 0.8, roadDistance(x, z) + (vnoise(x * 0.4, z * 0.4, 8) - 0.5));
  const trench = Math.max(...TRENCH_RINGS.map((t) => 1 - smooth(3, 6, Math.abs(r - t))));
  let crater = 0;
  for (const c of CRATERS) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r * 1.3) crater = Math.max(crater, 1 - smooth(c.r * 0.7, c.r * 1.3, d)); }
  return Math.max(road, trench * 0.9, crater * 0.8, moatBand(r));
}

/** Ponto de cada portão na muralha vista de fora (onde o Companion entra na cidade). */
export function outskirtsGatePoint(g: GateId, out = 3): { x: number; z: number } {
  const G = GATES[g];
  return { x: G.dx * (OUT_WALL_R + out), z: G.dz * (OUT_WALL_R + out) };
}

// ---------------------------------------------------------------------------
// Cidade (interior)
// ---------------------------------------------------------------------------

export const CITY_R = 64;       // raio andável dentro da muralha
export const CITY_GATE_R = 60;  // onde ficam os portões por dentro

export type CityState = 'normal' | 'destruida';
export type CityShow = 'ambos' | 'normal' | 'destruida';
export const CITY_SHOW: Record<CityShow, string> = { ambos: 'Nas duas', normal: 'Só normal', destruida: 'Só destruída' };

export interface CityPiece {
  id: string;
  name: string;
  url: string;
  x: number; y: number; z: number;
  rot: number;       // giro em Y (rad)
  scale: number;
  show: CityShow;
  /** raio de colisão no chão (m); 0 = dá para atravessar */
  solid: number;
  /** peça da muralha montada pelo Estúdio (aparece também na vista de fora) */
  wall?: WallPart;
}

export type WallPart = 'trecho' | 'torre' | 'portao' | 'ponte';
const WALL_PARTS: WallPart[] = ['trecho', 'torre', 'portao', 'ponte'];

/** Escolhas da muralha por trechos (o Estúdio remonta as peças a partir delas). */
export interface CityWall {
  segment: string | null;
  tower: string | null;
  gate: string | null;
  /** versões quebradas (só na cidade destruída, trocando algumas peças inteiras) */
  segmentBroken: string | null;
  towerBroken: string | null;
  towerEvery: number;   // uma torre a cada N trechos (0 = sem torres entre os trechos)
  scale: number;
  y: number;
  /** vira as peças 180° (se a face de fora do modelo ficou para dentro) */
  flip: boolean;
  /** ponte sobre os fossos, nos 4 portões, por dentro e por fora (escala sozinha para atravessar o fosso) */
  bridge: string | null;
  bridgeScale: number;  // multiplica a escala automática
  bridgeY: number;      // altura da base do modelo (m)
  bridgeDeck: number;   // altura do piso por onde o Companion anda (m)
}

export const DEFAULT_CITY_WALL: CityWall = {
  segment: null, tower: null, gate: null, segmentBroken: null, towerBroken: null, towerEvery: 3, scale: 1, y: 0, flip: false,
  bridge: null, bridgeScale: 1, bridgeY: -1, bridgeDeck: 0.4,
};

/** Medidas de um modelo como veio no .GLB (caixa em volta dele, escala 1). */
export interface ModelBox { min: [number, number, number]; max: [number, number, number] }

/**
 * Monta a muralha em volta da cidade (raio OUT_WALL_R), com o portão nos 4 pontos cardeais e os trechos
 * repartidos por igual entre eles (sobrepondo um pouco em vez de deixar fresta). O comprimento de cada modelo é o
 * seu lado mais longo no chão; o centro da caixa vai para a linha da muralha e a base encosta no chão, então o
 * pivô do modelo não importa.
 */
export function buildWall(w: CityWall, boxes: Partial<Record<'segment' | 'tower' | 'gate' | 'bridge', ModelBox>>): CityPiece[] {
  const out: CityPiece[] = [];
  if (!w.segment || !boxes.segment) return out;
  const s = w.scale;
  const fit = (b: ModelBox, sc = s) => {
    const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2];
    return { len: Math.max(sx, sz) * sc, raw: Math.max(sx, sz), alongZ: sz > sx * 1.2, cx: (b.min[0] + b.max[0]) / 2, cz: (b.min[2] + b.max[2]) / 2, minY: b.min[1] };
  };
  /** `radial`: o comprimento do modelo vai na direção do centro (pontes) em vez de ao longo da muralha */
  const place = (id: string, name: string, url: string, part: WallPart, a: number, b: ModelBox | undefined, show: CityShow, o: { R?: number; sc?: number; y?: number; radial?: boolean } = {}): CityPiece => {
    const sc = o.sc ?? s, R = o.R ?? OUT_WALL_R;
    const f = b ? fit(b, sc) : { alongZ: false, cx: 0, cz: 0, minY: 0 };
    const rot = Math.PI / 2 - a + (f.alongZ ? Math.PI / 2 : 0) + (o.radial ? Math.PI / 2 : 0) + (w.flip && !o.radial ? Math.PI : 0);
    const c = Math.cos(rot), sn = Math.sin(rot);
    const ox = (f.cx * c + f.cz * sn) * sc, oz = (-f.cx * sn + f.cz * c) * sc;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    return { id, name, url, x: r3(Math.cos(a) * R - ox), y: r3((o.y ?? w.y) - f.minY * sc), z: r3(Math.sin(a) * R - oz), rot: r3(rot), scale: r3(sc), show, solid: 0, wall: part };
  };
  const R = OUT_WALL_R;
  // pontes: cada uma atravessa o seu fosso de ponta a ponta (a escala sai do comprimento do modelo)
  if (w.bridge && boxes.bridge) {
    const raw = fit(boxes.bridge, 1).raw || 1;
    for (const d of BRIDGE_DECKS) {
      const [from, to] = bridgeSpan(d);
      const sc = ((to - from) / raw) * w.bridgeScale, a = (Math.atan2(GATES[d.gate].dz, GATES[d.gate].dx) + Math.PI * 2) % (Math.PI * 2);
      out.push(place(`muro-ponte-${d.side}-${d.gate}`, `Ponte · ${GATES[d.gate].label} (${d.side})`, w.bridge, 'ponte', a, boxes.bridge, 'ambos', { R: (from + to) / 2, sc, y: w.bridgeY, radial: true }));
    }
  }
  const seg = fit(boxes.segment);
  const half = w.gate && boxes.gate ? fit(boxes.gate).len / 2 : GATE_GAP;
  const gates = GATE_IDS.map((g) => ({ g, a: (Math.atan2(GATES[g].dz, GATES[g].dx) + Math.PI * 2) % (Math.PI * 2) })).sort((p, q) => p.a - q.a);
  let segN = 0, towerN = 0;
  const tower = (id: string, a: number) => {
    if (!w.tower) return;
    const broken = !!w.towerBroken && towerN++ % 3 === 1;
    out.push(place(id, `Muralha · torre`, w.tower, 'torre', a, boxes.tower, broken ? 'normal' : 'ambos'));
    if (broken) out.push(place(id + '-q', `Muralha · torre caída`, w.towerBroken!, 'torre', a, boxes.tower, 'destruida'));
  };
  gates.forEach(({ g, a }, k) => {
    if (w.gate) out.push(place('muro-portao-' + g, `Muralha · ${GATES[g].label}`, w.gate, 'portao', a, boxes.gate, 'ambos'));
    const start = a + half / R, end = (k === gates.length - 1 ? gates[0].a + Math.PI * 2 : gates[k + 1].a) - half / R;
    const n = Math.max(1, Math.ceil(((end - start) * R) / Math.max(0.5, seg.len)));
    const step = (end - start) / n;
    for (let i = 0; i < n; i++) {
      const id = `muro-${g}-${i}`, ang = start + (i + 0.5) * step;
      const broken = !!w.segmentBroken && segN++ % 4 === 1;
      out.push(place(id, `Muralha · trecho`, w.segment!, 'trecho', ang, boxes.segment, broken ? 'normal' : 'ambos'));
      if (broken) out.push(place(id + '-q', `Muralha · trecho quebrado`, w.segmentBroken!, 'trecho', ang, boxes.segment, 'destruida'));
    }
    if (!w.gate) { tower(`muro-torre-${g}-a`, start); tower(`muro-torre-${g}-b`, end); }
    if (w.towerEvery > 0) for (let i = w.towerEvery; i < n; i += w.towerEvery) tower(`muro-torre-${g}-${i}`, start + i * step);
  });
  return out;
}

export type CityMarkerKind = 'portao' | 'chegada' | 'cristal' | 'loja' | 'forja' | 'bar' | 'guilda' | 'escola' | 'npc';
export const CITY_MARKERS: Record<CityMarkerKind, { label: string; icon: string; color: string }> = {
  portao: { label: 'Portão', icon: '⛩', color: '#9fd8ff' },
  chegada: { label: 'Chegada', icon: '✦', color: '#ffd98a' },
  cristal: { label: 'Cristal Ápice', icon: '◆', color: '#b9a5ff' },
  loja: { label: 'Loja', icon: '🛒', color: '#ffcf7a' },
  forja: { label: 'Forja', icon: '⚒', color: '#ff9a5c' },
  bar: { label: 'Bar', icon: '🍺', color: '#e8b46a' },
  guilda: { label: 'Guilda de Aventureiros', icon: '⚔', color: '#f0e0b0' },
  escola: { label: 'Escola', icon: '📜', color: '#8fe0c0' },
  npc: { label: 'NPC', icon: '☺', color: '#c8d6e8' },
};

export interface CityMarker {
  id: string;
  kind: CityMarkerKind;
  name: string;
  x: number; z: number;
  rot: number;
  show: CityShow;
  gate?: GateId;    // portão: qual saída (leva ao portão de mesmo nome nos arredores)
  school?: string;  // escola: qual (arcane, blood, forge, ink, chrono)
}

export interface CityLayout {
  version: 1;
  name: string;
  pieces: CityPiece[];
  markers: CityMarker[];
  /** a cidade inteira vista de fora (nos arredores): um .GLB grande no lugar da muralha provisória */
  exterior: { url: string | null; scale: number; rot: number; y: number };
  /** `water`: cor da água dos fossos (para combinar com a água dos modelos da muralha) */
  ground: { color: string; plaza: string; water: string };
  wall: CityWall;
}

const gateMarker = (g: GateId): CityMarker => ({ id: 'portao-' + g, kind: 'portao', name: GATES[g].label, x: GATES[g].dx * CITY_GATE_R, z: GATES[g].dz * CITY_GATE_R, rot: 0, show: 'ambos', gate: g });

export const DEFAULT_CITY_LAYOUT: CityLayout = {
  version: 1,
  name: 'Áster',
  pieces: [],
  markers: [
    { id: 'cristal', kind: 'cristal', name: 'Cristal Ápice', x: 0, z: 0, rot: 0, show: 'ambos' },
    ...GATE_IDS.map(gateMarker),
  ],
  exterior: { url: null, scale: 1, rot: 0, y: 0 },
  ground: { color: '#8f8a7e', plaza: '#c9c1ae', water: '#3b87ad' },
  wall: DEFAULT_CITY_WALL,
};

const num = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const ID = /^[a-z0-9][a-z0-9_-]{0,60}$/i;
const SHOWS = Object.keys(CITY_SHOW) as CityShow[];
const MAX_ITEMS = 1500;

/** Só aceita URL https (o bucket público) ou caminho do próprio site. */
export function safeAssetUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}

export function sanitizeCityLayout(input: unknown): CityLayout {
  const d = (input ?? {}) as Partial<CityLayout>;
  const ids = new Set<string>();
  const uniq = (id: unknown, fallback: string) => { let s = typeof id === 'string' && ID.test(id) ? id : fallback; while (ids.has(s)) s += '_'; ids.add(s); return s; };
  const pieces: CityPiece[] = [];
  for (const [i, p] of (Array.isArray(d.pieces) ? d.pieces : []).slice(0, MAX_ITEMS).entries()) {
    const url = safeAssetUrl(p?.url);
    if (!url) continue;
    pieces.push({
      id: uniq(p.id, 'peca-' + i), name: str(p.name, 60, 'Peça'), url,
      x: num(p.x, -400, 400, 0), y: num(p.y, -50, 200, 0), z: num(p.z, -400, 400, 0),
      rot: num(p.rot, -Math.PI * 4, Math.PI * 4, 0), scale: num(p.scale, 0.01, 200, 1),
      show: SHOWS.includes(p.show as CityShow) ? (p.show as CityShow) : 'ambos', solid: num(p.solid, 0, 60, 0),
      ...(WALL_PARTS.includes(p.wall as WallPart) ? { wall: p.wall } : {}),
    });
  }
  const markers: CityMarker[] = [];
  for (const [i, m] of (Array.isArray(d.markers) ? d.markers : []).slice(0, MAX_ITEMS).entries()) {
    if (!m || !(m.kind in CITY_MARKERS)) continue;
    const out: CityMarker = {
      id: uniq(m.id, m.kind + '-' + i), kind: m.kind, name: str(m.name, 60, CITY_MARKERS[m.kind].label),
      x: num(m.x, -400, 400, 0), z: num(m.z, -400, 400, 0), rot: num(m.rot, -Math.PI * 4, Math.PI * 4, 0),
      show: SHOWS.includes(m.show as CityShow) ? (m.show as CityShow) : 'ambos',
    };
    if (m.kind === 'portao') out.gate = GATE_IDS.includes(m.gate as GateId) ? m.gate : 'sul';
    if (m.kind === 'escola' && typeof m.school === 'string') out.school = m.school.slice(0, 20);
    markers.push(out);
  }
  // toda cidade precisa das quatro saídas
  for (const g of GATE_IDS) if (!markers.some((m) => m.kind === 'portao' && m.gate === g)) markers.push(gateMarker(g));
  const e = (d.exterior ?? {}) as Partial<CityLayout['exterior']>;
  const gr = (d.ground ?? {}) as Partial<CityLayout['ground']>;
  const w = (d.wall ?? {}) as Partial<CityWall>;
  return {
    version: 1,
    name: str(d.name, 60, 'Áster') || 'Áster',
    pieces, markers,
    exterior: { url: safeAssetUrl(e.url), scale: num(e.scale, 0.01, 500, 1), rot: num(e.rot, -Math.PI * 4, Math.PI * 4, 0), y: num(e.y, -50, 100, 0) },
    ground: { color: color(gr.color, DEFAULT_CITY_LAYOUT.ground.color), plaza: color(gr.plaza, DEFAULT_CITY_LAYOUT.ground.plaza), water: color(gr.water, DEFAULT_CITY_LAYOUT.ground.water) },
    wall: {
      segment: safeAssetUrl(w.segment), tower: safeAssetUrl(w.tower), gate: safeAssetUrl(w.gate),
      segmentBroken: safeAssetUrl(w.segmentBroken), towerBroken: safeAssetUrl(w.towerBroken),
      towerEvery: Math.round(num(w.towerEvery, 0, 20, DEFAULT_CITY_WALL.towerEvery)), scale: num(w.scale, 0.01, 200, 1), y: num(w.y, -50, 100, 0), flip: w.flip === true,
      bridge: safeAssetUrl(w.bridge), bridgeScale: num(w.bridgeScale, 0.1, 10, 1), bridgeY: num(w.bridgeY, -10, 10, DEFAULT_CITY_WALL.bridgeY), bridgeDeck: num(w.bridgeDeck, -2, 5, DEFAULT_CITY_WALL.bridgeDeck),
    },
  };
}

/** O que aparece num estado da cidade. */
export const visibleIn = (show: CityShow, state: CityState) => show === 'ambos' || show === state;

/** Onde o Companion aparece ao entrar pela cidade por um portão (um pouco para dentro, olhando para o centro). */
export function cityArrival(layout: CityLayout, gate: GateId): { x: number; z: number } {
  const m = layout.markers.find((k) => k.kind === 'portao' && k.gate === gate);
  const x = m?.x ?? GATES[gate].dx * CITY_GATE_R, z = m?.z ?? GATES[gate].dz * CITY_GATE_R;
  const r = Math.hypot(x, z) || 1, step = 5;
  return { x: x - (x / r) * step, z: z - (z / r) * step };
}
