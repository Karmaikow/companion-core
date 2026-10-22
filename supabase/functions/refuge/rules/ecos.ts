/**
 * Ecos da Terra — coleta com escolhas, leitura do ambiente e mundo que muda (primeira entrega).
 *
 * Este arquivo tem as regras puras (iguais no cliente, no servidor e nos testes):
 *  - ResourceDefinition (MATERIALS): materiais por categoria, com poucas propriedades legíveis;
 *  - MaterialBatch: o que entra na mochila, agrupado por FAIXAS de propriedade (baixa/média/alta), não por valor exato;
 *  - ResourceNode (VALE_NODES) e GatheringAction (approaches): o que dá para coletar no Vale dos Ecos e de que jeito;
 *  - RegionalEcology: abundância de cada nó recalculada sob demanda (sem simulação por quadro);
 *  - rolagem determinística: a mesma requisição (requestId) sempre rende o mesmo lote, então repetir um pedido não
 *    muda o resultado (idempotência no servidor).
 * Cadeia de descoberta, receitas, obra comunitária e decisão do Companion estão em ecosPlay.ts.
 */
import { clampText } from './text.ts';

// ---------------------------------------------------------------------------
// Categorias, propriedades e faixas
// ---------------------------------------------------------------------------

export type ResCategory = 'pedra' | 'minerio' | 'madeira' | 'planta' | 'caca' | 'gema' | 'magico';
export type Band = 'baixa' | 'media' | 'alta';
export type PropKey =
  | 'composicao' | 'resistencia' | 'pureza' | 'flexibilidade' | 'afinidade' | 'parte' | 'potencia' | 'estabilidade'
  | 'material' | 'conservacao' | 'aplicacao' | 'integridade' | 'efeito' | 'estabilizacao';

export const CATEGORIES: Record<ResCategory, { label: string; icon: string; props: PropKey[] }> = {
  pedra: { label: 'Pedra', icon: '🪨', props: ['composicao', 'resistencia'] },
  minerio: { label: 'Minério', icon: '⛏️', props: ['composicao', 'pureza'] },
  madeira: { label: 'Madeira', icon: '🪵', props: ['flexibilidade', 'resistencia', 'afinidade'] },
  planta: { label: 'Planta medicinal', icon: '🌿', props: ['parte', 'potencia', 'estabilidade'] },
  caca: { label: 'Caça', icon: '🦌', props: ['material', 'conservacao', 'aplicacao'] },
  gema: { label: 'Gema', icon: '💎', props: ['integridade', 'afinidade'] },
  magico: { label: 'Material mágico', icon: '✨', props: ['efeito', 'estabilizacao'] },
};

export const PROP_LABEL: Record<PropKey, string> = {
  composicao: 'Composição', resistencia: 'Resistência', pureza: 'Pureza', flexibilidade: 'Flexibilidade', afinidade: 'Afinidade',
  parte: 'Parte colhida', potencia: 'Potência', estabilidade: 'Estabilidade', material: 'Material', conservacao: 'Conservação',
  aplicacao: 'Aplicação', integridade: 'Integridade', efeito: 'Efeito', estabilizacao: 'Estabilização',
};
export const BAND_LABEL: Record<Band, string> = { baixa: 'baixa', media: 'média', alta: 'alta' };
const BAND_RANK: Record<Band, number> = { baixa: 0, media: 1, alta: 2 };
export const bandRank = (b: Band | undefined) => (b ? BAND_RANK[b] : -1);
export const atLeast = (b: Band | undefined, min: Band) => bandRank(b) >= BAND_RANK[min];

/** Valor 0–100 → faixa. As faixas evitam centenas de pilhas quase iguais. */
export function bandOf(v: number): Band { return v < 35 ? 'baixa' : v < 70 ? 'media' : 'alta'; }

/** ResourceDefinition: o material, sua categoria, raridade (rara de achar) e propriedades. */
export interface MaterialDef {
  id: string;
  name: string;
  category: ResCategory;
  /** 1 comum · 2 incomum · 3 rara (raridade ≠ qualidade ≠ adequação à receita) */
  rarity: 1 | 2 | 3;
  /** para que serve (materiais comuns também têm uso por toda a progressão) */
  uses: string[];
  /** propriedades numéricas: faixa de 0–100 sorteada a cada coleta (vira faixa baixa/média/alta) */
  ranges: Partial<Record<PropKey, [number, number]>>;
  /** propriedades descritivas fixas (composição, afinidade, parte, efeito, estabilização) */
  fixed: Partial<Record<PropKey, string>>;
}

const M = (d: MaterialDef) => d;
export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries([
  M({ id: 'madeira-salgueiro', name: 'Madeira de Salgueiro', category: 'madeira', rarity: 1, uses: ['Arcos e varas (dobra sem quebrar)', 'Cestos e cordas trançadas'], ranges: { flexibilidade: [62, 92], resistencia: [28, 52] }, fixed: { afinidade: 'água' } }),
  M({ id: 'madeira-carvalho', name: 'Madeira de Carvalho', category: 'madeira', rarity: 1, uses: ['Tábuas, cabos e estruturas (aguenta peso)', 'Cabos de ferramentas'], ranges: { flexibilidade: [12, 38], resistencia: [66, 94] }, fixed: { afinidade: 'terra' } }),
  M({ id: 'erva-orvalho-folha', name: 'Folhas de Erva-de-orvalho', category: 'planta', rarity: 1, uses: ['Unguentos que duram (estáveis)', 'Chás de recuperação'], ranges: { potencia: [30, 58], estabilidade: [70, 95] }, fixed: { parte: 'folhas' } }),
  M({ id: 'erva-orvalho-flor', name: 'Flores de Erva-de-orvalho', category: 'planta', rarity: 2, uses: ['Remédios fortes de uso rápido', 'Corantes'], ranges: { potencia: [72, 96], estabilidade: [10, 34] }, fixed: { parte: 'flores' } }),
  M({ id: 'erva-orvalho-raiz', name: 'Raiz de Erva-de-orvalho', category: 'planta', rarity: 2, uses: ['Remédios fortes e estáveis', 'Base de poções'], ranges: { potencia: [60, 88], estabilidade: [55, 85] }, fixed: { parte: 'raízes' } }),
  M({ id: 'pedra-granito', name: 'Bloco de Granito', category: 'pedra', rarity: 1, uses: ['Fundações e pontes', 'Muros do Refúgio'], ranges: { resistencia: [62, 95] }, fixed: { composicao: 'granito' } }),
  M({ id: 'pedra-seixo', name: 'Seixo Rolado', category: 'pedra', rarity: 1, uses: ['Caminhos e pisos', 'Pedra de afiar'], ranges: { resistencia: [30, 60] }, fixed: { composicao: 'quartzito' } }),
  M({ id: 'minerio-cobre', name: 'Cobre Nativo', category: 'minerio', rarity: 1, uses: ['Ferramentas finas (cinzel)', 'Lanternas e dobradiças'], ranges: { pureza: [25, 92] }, fixed: { composicao: 'cobre' } }),
  M({ id: 'seiva-azul', name: 'Seiva Azul', category: 'magico', rarity: 2, uses: ['Dá afinidade de água a arcos e varas', 'Lanternas que brilham sem fogo'], ranges: {}, fixed: { efeito: 'brilho e afinidade de água', estabilizacao: 'guardar fechada e longe do sol' } }),
  M({ id: 'quartzo-azul', name: 'Quartzo Azul', category: 'gema', rarity: 3, uses: ['Focos mágicos (inteiro)', 'Pó de encantamento (fragmentos)'], ranges: { integridade: [70, 98] }, fixed: { afinidade: 'água' } }),
  M({ id: 'quartzo-fragmento', name: 'Fragmentos de Quartzo', category: 'gema', rarity: 2, uses: ['Pó de encantamento', 'Lanternas'], ranges: { integridade: [8, 32] }, fixed: { afinidade: 'água' } }),
].map((m) => [m.id, m]));

// ---------------------------------------------------------------------------
// Lote (MaterialBatch) e mochila
// ---------------------------------------------------------------------------

/** Um lote na mochila: o material + as faixas das propriedades numéricas. A chave junta lotes compatíveis. */
export interface MaterialBatch { key: string; material: string; bands: Partial<Record<PropKey, Band>>; qty: number }

export function batchKey(material: string, bands: Partial<Record<PropKey, Band>>): string {
  const parts = Object.keys(bands).sort().map((k) => `${k}:${bands[k as PropKey]}`);
  return parts.length ? `${material}|${parts.join(',')}` : material;
}
export function parseBatchKey(key: string): { material: string; bands: Partial<Record<PropKey, Band>> } | null {
  const [material, rest] = key.split('|');
  if (!MATERIALS[material]) return null;
  const bands: Partial<Record<PropKey, Band>> = {};
  for (const p of (rest ?? '').split(',').filter(Boolean)) {
    const [k, v] = p.split(':');
    if (!(k in PROP_LABEL) || !(v in BAND_RANK)) return null;
    bands[k as PropKey] = v as Band;
  }
  return { material, bands };
}
/** Qualidade do lote (separada de raridade e de adequação): quantas faixas altas ele tem. */
export function batchQuality(b: { bands: Partial<Record<PropKey, Band>> }): 'comum' | 'boa' | 'excelente' {
  const v = Object.values(b.bands);
  if (!v.length) return 'boa';
  const s = v.reduce((a, x) => a + BAND_RANK[x!], 0) / v.length;
  return s >= 1.6 ? 'excelente' : s >= 0.8 ? 'boa' : 'comum';
}
export function describeBatch(b: { material: string; bands: Partial<Record<PropKey, Band>> }): string {
  const m = MATERIALS[b.material];
  const props = Object.entries(b.bands).map(([k, v]) => `${PROP_LABEL[k as PropKey].toLowerCase()} ${BAND_LABEL[v as Band]}`);
  for (const [k, v] of Object.entries(m?.fixed ?? {})) props.push(`${PROP_LABEL[k as PropKey].toLowerCase()}: ${v}`);
  return props.join(' · ');
}

// ---------------------------------------------------------------------------
// Vale dos Ecos: bosque, riacho e afloramento (coordenadas do Companion World)
// ---------------------------------------------------------------------------

export const VALE = { x: 0, z: 30, r: 21, name: 'Vale dos Ecos' } as const;
/** Riacho: nasce no norte (montante, mais alto) e desce para o sul (jusante). */
export const STREAM: [number, number][] = [[-5.5, 50], [-3.5, 45], [-1, 39], [0.5, 33], [0, 27], [-2.5, 21], [-2, 14], [-0.5, 9]];
export const NASCENTE = { x: -6, z: 50.5 };
export const BRIDGE = { x: 0.1, z: 27.2, len: 6.2, rot: Math.PI / 2 - 0.04 };

/** Distância de um ponto até o riacho e o parâmetro (0 = nascente, 1 = fim) do ponto mais próximo. */
export function streamDist(x: number, z: number): { d: number; t: number } {
  let best = Infinity, bt = 0, acc = 0;
  const lens = STREAM.slice(1).map((p, i) => Math.hypot(p[0] - STREAM[i][0], p[1] - STREAM[i][1]));
  const total = lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (d < best) { best = d; bt = (acc + u * lens[i]) / total; }
    acc += lens[i];
  }
  return { d: best, t: bt };
}

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Peso do vale (1 dentro, 0 fora) — o relevo do mundo se mistura com o do vale na borda. */
export function valeWeight(x: number, z: number): number { return smooth(VALE.r + 7, VALE.r - 2, Math.hypot(x - VALE.x, z - VALE.z)); }
/** Relevo do vale: desce do norte para o sul, leito do riacho fundo, afloramento elevado a nordeste. */
export function valeHeight(x: number, z: number): number {
  const slope = Math.max(0, z - 10) * 0.05;
  const s = streamDist(x, z);
  const bed = -0.42 * Math.exp(-((s.d / 1.25) ** 2)) - 0.12 * Math.exp(-((s.d / 3) ** 2));
  const rock = 1.3 * Math.exp(-(((x - 9.5) ** 2) + ((z - 42) ** 2)) / 34);
  return slope + bed + rock;
}
/** Água do riacho: altura da lâmina d'água (um pouco abaixo da margem). */
export const waterLevelAt = (x: number, z: number) => Math.max(0, z - 10) * 0.05 - 0.2;
/** Fora do vale a vegetação do mundo continua; dentro, só a do próprio vale (nós de coleta e enfeites). */
export const insideVale = (x: number, z: number, pad = 2) => Math.hypot(x - VALE.x, z - VALE.z) < VALE.r + pad;

// ---------------------------------------------------------------------------
// Nós de coleta (ResourceNode) e abordagens (GatheringAction)
// ---------------------------------------------------------------------------

export type Zone = 'bosque' | 'riacho' | 'afloramento' | 'margem-leste';
export type ToolKey = 'faca' | 'machado' | 'picareta' | 'cinzel';
export const TOOLS: Record<ToolKey, { label: string; icon: string }> = {
  faca: { label: 'Faca de colheita', icon: '🔪' }, machado: { label: 'Machado', icon: '🪓' }, picareta: { label: 'Picareta', icon: '⛏️' }, cinzel: { label: 'Cinzel de Cobre', icon: '🛠️' },
};
/** Kit inicial do explorador (o cinzel se fabrica). */
export const STARTER_TOOLS: ToolKey[] = ['faca', 'machado', 'picareta'];

export interface YieldSpec { material: string; qty: [number, number]; /** mínimo garantido */ guaranteed: number; chance?: number }
export interface Approach {
  id: string;
  label: string;
  /** segundos de ação (o servidor confere o tempo) */
  seconds: number;
  /** quanto consome da abundância do nó */
  cost: number;
  tool: ToolKey | null;
  yields: YieldSpec[];
  /** risco conhecido ('nenhum' | texto curto) e nível para a intenção do Companion */
  risk: string;
  riskLevel: 0 | 1 | 2;
  /** efeito no ambiente (o que acontece com o nó) */
  effect: string;
  /** frase curta: por que escolher esta */
  pitch: string;
}
export interface ResourceNodeKind {
  kind: string;
  name: string;
  category: ResCategory;
  zone: Zone;
  /** abundância máxima (unidades) e recuperação por hora */
  capacity: number;
  regenPerHour: number;
  approaches: Approach[];
  /** o que se vê de longe (indício) */
  sign: string;
}

export const NODE_KINDS: Record<string, ResourceNodeKind> = {
  salgueiro: {
    kind: 'salgueiro', name: 'Salgueiro', category: 'madeira', zone: 'bosque', capacity: 8, regenPerHour: 3, sign: 'Galhos longos que se curvam até a água.',
    approaches: [
      { id: 'galhos', label: 'Recolher galhos', seconds: 5, cost: 1, tool: null, yields: [{ material: 'madeira-salgueiro', qty: [1, 2], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'Preserva a árvore.', pitch: 'Pouca madeira, sem estragar nada.' },
      { id: 'resina', label: 'Extrair seiva', seconds: 8, cost: 2, tool: 'faca', yields: [{ material: 'seiva-azul', qty: [1, 1], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'A árvore fica 1 h sem seiva.', pitch: 'Ingrediente mágico; não dá madeira.' },
      { id: 'cortar', label: 'Cortar a árvore', seconds: 12, cost: 6, tool: 'machado', yields: [{ material: 'madeira-salgueiro', qty: [4, 6], guaranteed: 4 }], risk: 'galhos caindo (leve)', riskLevel: 1, effect: 'Maior volume; a árvore leva ~2 h para se recuperar.', pitch: 'Muita madeira de uma vez.' },
    ],
  },
  carvalho: {
    kind: 'carvalho', name: 'Carvalho', category: 'madeira', zone: 'bosque', capacity: 8, regenPerHour: 2, sign: 'Tronco grosso e casca rachada.',
    approaches: [
      { id: 'galhos', label: 'Recolher galhos', seconds: 5, cost: 1, tool: null, yields: [{ material: 'madeira-carvalho', qty: [1, 1], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'Preserva a árvore.', pitch: 'Um pouco de madeira dura, sem cortar.' },
      { id: 'cortar', label: 'Cortar a árvore', seconds: 12, cost: 6, tool: 'machado', yields: [{ material: 'madeira-carvalho', qty: [4, 5], guaranteed: 4 }], risk: 'galhos caindo (leve)', riskLevel: 1, effect: 'Maior volume; recuperação de ~3 h.', pitch: 'Madeira resistente em quantidade.' },
    ],
  },
  erva: {
    kind: 'erva', name: 'Erva-de-orvalho', category: 'planta', zone: 'riacho', capacity: 6, regenPerHour: 4, sign: 'Folhas largas com gotas que não secam.',
    approaches: [
      { id: 'folhas', label: 'Colher folhas', seconds: 4, cost: 1, tool: null, yields: [{ material: 'erva-orvalho-folha', qty: [2, 3], guaranteed: 2 }], risk: 'nenhum', riskLevel: 0, effect: 'A planta rebrota rápido.', pitch: 'Estáveis: bons para unguentos que duram.' },
      { id: 'flores', label: 'Colher flores', seconds: 5, cost: 2, tool: 'faca', yields: [{ material: 'erva-orvalho-flor', qty: [1, 2], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'Sem flores por um tempo.', pitch: 'Potentes, mas estragam logo.' },
      { id: 'raizes', label: 'Arrancar raízes', seconds: 7, cost: 6, tool: 'faca', yields: [{ material: 'erva-orvalho-raiz', qty: [1, 1], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'A planta some até rebrotar (~1,5 h).', pitch: 'Potente e estável; a mais valiosa.' },
    ],
  },
  cascalho: {
    kind: 'cascalho', name: 'Cascalho do Riacho', category: 'pedra', zone: 'riacho', capacity: 10, regenPerHour: 6, sign: 'Pedrinhas lisas que a correnteza traz de cima.',
    approaches: [
      { id: 'peneirar', label: 'Peneirar com calma', seconds: 6, cost: 1, tool: null, yields: [{ material: 'pedra-seixo', qty: [1, 2], guaranteed: 1 }, { material: 'minerio-cobre', qty: [1, 1], guaranteed: 0, chance: 0.25 }], risk: 'nenhum', riskLevel: 0, effect: 'O riacho repõe as pedrinhas.', pitch: 'Seixos e, às vezes, cobre que desceu do morro.' },
      { id: 'juntar', label: 'Juntar em volume', seconds: 5, cost: 3, tool: null, yields: [{ material: 'pedra-seixo', qty: [3, 4], guaranteed: 3 }], risk: 'nenhum', riskLevel: 0, effect: 'Turva a água por um tempo.', pitch: 'Mais seixos, sem procurar nada.' },
    ],
  },
  granito: {
    kind: 'granito', name: 'Granito Exposto', category: 'pedra', zone: 'afloramento', capacity: 12, regenPerHour: 2, sign: 'Rocha cinza com veios brancos.',
    approaches: [
      { id: 'lascas', label: 'Recolher lascas soltas', seconds: 4, cost: 1, tool: null, yields: [{ material: 'pedra-granito', qty: [1, 1], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'Nenhum.', pitch: 'Rápido e sem ferramenta.' },
      { id: 'volume', label: 'Quebrar em volume', seconds: 8, cost: 4, tool: 'picareta', yields: [{ material: 'pedra-granito', qty: [3, 4], guaranteed: 3 }], risk: 'lascas voando (leve)', riskLevel: 1, effect: 'A face fica exposta; rende menos por ~2 h.', pitch: 'Blocos para construir.' },
    ],
  },
  cobre: {
    kind: 'cobre', name: 'Veio de Cobre', category: 'minerio', zone: 'afloramento', capacity: 8, regenPerHour: 1.5, sign: 'Manchas esverdeadas na rocha.',
    approaches: [
      { id: 'garimpar', label: 'Garimpar o entorno', seconds: 6, cost: 1, tool: null, yields: [{ material: 'minerio-cobre', qty: [1, 1], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'Nenhum.', pitch: 'Pouco cobre, sem mexer no veio.' },
      { id: 'escavar', label: 'Escavar o veio', seconds: 10, cost: 4, tool: 'picareta', yields: [{ material: 'minerio-cobre', qty: [2, 3], guaranteed: 2 }], risk: 'pedra solta (leve)', riskLevel: 1, effect: 'O veio fica raso por ~2 h.', pitch: 'Mais cobre e mais puro.' },
    ],
  },
  geodo: {
    kind: 'geodo', name: 'Geodo Rachado', category: 'gema', zone: 'afloramento', capacity: 3, regenPerHour: 0.25, sign: 'Uma pedra oca com brilho azul pela fresta.',
    approaches: [
      { id: 'fragmentos', label: 'Partir em fragmentos', seconds: 6, cost: 1, tool: 'picareta', yields: [{ material: 'quartzo-fragmento', qty: [2, 3], guaranteed: 2 }], risk: 'nenhum', riskLevel: 0, effect: 'Gasta pouco do geodo.', pitch: 'Vários fragmentos para pó e lanternas.' },
      { id: 'inteira', label: 'Soltar a gema inteira', seconds: 14, cost: 3, tool: 'cinzel', yields: [{ material: 'quartzo-azul', qty: [1, 1], guaranteed: 1 }], risk: 'nenhum', riskLevel: 0, effect: 'Esgota o geodo (volta em ~12 h).', pitch: 'Uma gema íntegra para focos mágicos.' },
    ],
  },
};

/** Viés de cada abordagem nas propriedades (escavar o veio dá cobre mais puro; lascas soltas são mais fracas). */
const APPROACH_BIAS: Record<string, Partial<Record<PropKey, number>>> = {
  'cobre/escavar': { pureza: 22 }, 'cobre/garimpar': { pureza: -12 }, 'cascalho/peneirar': { pureza: -18 },
  'granito/lascas': { resistencia: -14 },
};

export interface ResourceNode { id: string; kind: string; x: number; z: number; name?: string; /** só aparece depois de algo (ponte pronta) */ needs?: 'ponte' }
/** Nós do Vale (posições absolutas no mundo). */
export const VALE_NODES: ResourceNode[] = [
  { id: 'salgueiro-nascente', kind: 'salgueiro', x: -8.2, z: 45.5, name: 'Salgueiro da Nascente' },
  { id: 'salgueiro-curva', kind: 'salgueiro', x: -5.6, z: 31.5 },
  { id: 'salgueiro-baixo', kind: 'salgueiro', x: -6.4, z: 19 },
  { id: 'carvalho-velho', kind: 'carvalho', x: -11.5, z: 27.5, name: 'Carvalho Velho' },
  { id: 'carvalho-novo', kind: 'carvalho', x: -12.5, z: 36 },
  { id: 'erva-margem', kind: 'erva', x: -3.6, z: 24.5 },
  { id: 'erva-remanso', kind: 'erva', x: 2.8, z: 36.5 },
  { id: 'erva-pedras', kind: 'erva', x: -4.4, z: 41.5 },
  { id: 'cascalho-baixo', kind: 'cascalho', x: -1.2, z: 17 },
  { id: 'cascalho-alto', kind: 'cascalho', x: -2.6, z: 43.6, name: 'Cascalho de Cima' },
  { id: 'granito-face', kind: 'granito', x: 8.2, z: 38.5 },
  { id: 'granito-topo', kind: 'granito', x: 11.2, z: 43.5 },
  { id: 'cobre-veio', kind: 'cobre', x: 12.4, z: 39 },
  { id: 'geodo-fenda', kind: 'geodo', x: 7.4, z: 45 },
  { id: 'erva-leste-1', kind: 'erva', x: 6.8, z: 25, needs: 'ponte', name: 'Erva da Margem Leste' },
  { id: 'erva-leste-2', kind: 'erva', x: 9.5, z: 29.5, needs: 'ponte', name: 'Erva da Margem Leste' },
];
export const nodeById = (id: string) => VALE_NODES.find((n) => n.id === id) ?? null;
export const nodeName = (n: ResourceNode) => n.name ?? NODE_KINDS[n.kind].name;
export function approachOf(node: ResourceNode, approachId: string): Approach | null {
  return NODE_KINDS[node.kind]?.approaches.find((a) => a.id === approachId) ?? null;
}

// ---------------------------------------------------------------------------
// Ecologia regional (sob demanda: nada é atualizado por quadro)
// ---------------------------------------------------------------------------

export interface NodeState { amount: number; at: number /* ms */ }
/** Multiplicador da recuperação pelo clima da região (chuva ajuda plantas e o riacho). */
export function regenFactor(kind: ResourceNodeKind, weather?: string): number {
  if (weather === 'chuva' || weather === 'tempestade') return kind.category === 'planta' || kind.zone === 'riacho' ? 1.5 : 1;
  if (weather === 'sol') return kind.category === 'planta' ? 0.85 : 1;
  return 1;
}
/** Abundância agora: o que tinha + a recuperação desde então, até a capacidade. Sem estado = cheio. */
export function abundanceNow(node: ResourceNode, st: NodeState | null | undefined, now: number, weather?: string): number {
  const k = NODE_KINDS[node.kind];
  if (!st) return k.capacity;
  const hours = Math.max(0, now - st.at) / 3_600_000;
  return Math.min(k.capacity, st.amount + hours * k.regenPerHour * regenFactor(k, weather));
}
/** Quanto tempo até dar para usar esta abordagem de novo (ms; 0 = já dá). */
export function msUntilAvailable(node: ResourceNode, ap: Approach, st: NodeState | null | undefined, now: number): number {
  const k = NODE_KINDS[node.kind], have = abundanceNow(node, st, now);
  if (have >= ap.cost) return 0;
  return Math.ceil(((ap.cost - have) / k.regenPerHour) * 3_600_000);
}

// ---------------------------------------------------------------------------
// Rolagem determinística (mesmo pedido = mesmo lote)
// ---------------------------------------------------------------------------

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rngFrom(seed: number): () => number {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Lotes de uma coleta. `bonus` (técnicas) melhora um pouco as propriedades, com teto, para não quebrar a economia. */
export function rollGather(node: ResourceNode, ap: Approach, requestId: string, bonus = 0): MaterialBatch[] {
  const r = rngFrom(seedOf(requestId + ':' + node.id + ':' + ap.id));
  const bias = APPROACH_BIAS[`${node.kind}/${ap.id}`] ?? {};
  const out = new Map<string, MaterialBatch>();
  for (const y of ap.yields) {
    const roll = r();
    if (y.chance !== undefined && roll > y.chance) continue;
    const qty = y.qty[0] + Math.floor(r() * (y.qty[1] - y.qty[0] + 1));
    const m = MATERIALS[y.material];
    for (let i = 0; i < Math.max(qty, y.guaranteed); i++) {
      const bands: Partial<Record<PropKey, Band>> = {};
      for (const [k, rg] of Object.entries(m.ranges) as [PropKey, [number, number]][]) {
        const v = rg[0] + r() * (rg[1] - rg[0]) + (bias[k] ?? 0) + Math.min(6, bonus);
        bands[k] = bandOf(Math.max(0, Math.min(100, v)));
      }
      const key = batchKey(m.id, bands);
      const b = out.get(key);
      if (b) b.qty++; else out.set(key, { key, material: m.id, bands, qty: 1 });
    }
  }
  return [...out.values()];
}

/** Faixas possíveis (estimativa honesta) de uma abordagem: o que pode vir, sem garantir propriedade. */
export function expectedOutcome(node: ResourceNode, ap: Approach): { material: string; qty: [number, number]; guaranteed: number; chance?: number; bands: Partial<Record<PropKey, Band[]>> }[] {
  const bias = APPROACH_BIAS[`${node.kind}/${ap.id}`] ?? {};
  return ap.yields.map((y) => {
    const m = MATERIALS[y.material], bands: Partial<Record<PropKey, Band[]>> = {};
    for (const [k, rg] of Object.entries(m.ranges) as [PropKey, [number, number]][]) {
      const lo = bandOf(Math.max(0, rg[0] + (bias[k] ?? 0))), hi = bandOf(Math.min(100, rg[1] + (bias[k] ?? 0)));
      bands[k] = (['baixa', 'media', 'alta'] as Band[]).filter((b) => bandRank(b) >= bandRank(lo) && bandRank(b) <= bandRank(hi));
    }
    return { material: y.material, qty: y.qty, guaranteed: y.guaranteed, chance: y.chance, bands };
  });
}

/** Mochila: capacidade total (unidades). */
export const BAG_CAPACITY = 60;

/** Parâmetros de balanceamento (Admin → game_config.values.ecos). */
export interface EcosConfig {
  /** capacidade da mochila (unidades) */
  bag: number;
  /** escala das metas da obra comunitária (população/ritmo do servidor) */
  projectScale: number;
  /** fatia máxima de uma etapa que uma pessoa pode entregar (anti-monopólio) */
  capShare: number;
  /** depois de quantas horas com a etapa aberta a cota pessoal some (servidor vazio não trava) */
  capHours: number;
  /** tolerância do tempo de ação (0,85 = pode terminar com 85% do tempo) */
  timeSlack: number;
  /** distância máxima até o nó para coletar (m) */
  reach: number;
}
export const DEFAULT_ECOS: EcosConfig = { bag: BAG_CAPACITY, projectScale: 1, capShare: 0.4, capHours: 2, timeSlack: 0.85, reach: 4.5 };
export function resolveEcos(v: unknown): EcosConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (k: keyof EcosConfig, lo: number, hi: number) => { const x = Number(o[k]); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : DEFAULT_ECOS[k]; };
  return { bag: Math.round(n('bag', 10, 500)), projectScale: n('projectScale', 0.1, 20), capShare: n('capShare', 0.1, 1), capHours: n('capHours', 0, 720), timeSlack: n('timeSlack', 0.3, 1), reach: n('reach', 2, 20) };
}
export const bagUsed = (bag: { qty: number }[]) => bag.reduce((a, b) => a + Math.max(0, b.qty), 0);

/** Valida e normaliza um id de pedido (UUID). */
export function cleanRequestId(x: unknown): string | null {
  const s = clampText(x, 40);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s.toLowerCase() : null;
}
