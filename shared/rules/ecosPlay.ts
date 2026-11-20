/**
 * Ecos da Terra — o que dá sentido à coleta: indícios e a cadeia de descoberta (DiscoveryChain), o ponto de manejo
 * (ManagedSite), receitas que valorizam propriedades, a obra comunitária (CommunityProject) e a decisão do Companion
 * (GatheringIntent → sugestões por pontuação de utilidade, só com o que ele sabe).
 * A IA generativa só escreve falas; recompensas e inventário saem destas regras (e o servidor confere).
 */
import {
  MATERIALS, NODE_KINDS, VALE_NODES, NASCENTE, bandRank, atLeast, expectedOutcome, abundanceNow, nodeName,
  type Band, type PropKey, type ResCategory, type ToolKey, type Zone, type ResourceNode, type Approach, type NodeState,
  type MaterialBatch, type EcosConfig,
} from './ecos.ts';

// ---------------------------------------------------------------------------
// Indícios e a cadeia "A Seiva Azul" (3 etapas)
// ---------------------------------------------------------------------------

/** Estado de um indício: o que se viu (confirmado), o que se supõe (hipótese) ou o que se descobriu (concluído). */
export type ClueStatus = 'observacao' | 'hipotese' | 'descoberta';
export interface EnvironmentalClue {
  id: string;
  status: ClueStatus;
  text: string;
  /** para onde aponta (sempre um conteúdo que existe: nó, etapa ou lugar) */
  points: { node?: string; step?: string; place?: { x: number; z: number; label: string } };
}

export type ChainChoice = 'extrair' | 'preservar';
export interface ChainStep {
  id: 'seiva' | 'cascalho' | 'nascente';
  title: string;
  /** o que dispara a etapa: observar/coletar num nó, ou chegar num lugar */
  trigger: { node?: string; approach?: string; inspect?: boolean; reach?: { x: number; z: number; r: number } };
  /** indício que aparece quando a etapa anterior termina (ou, na primeira, quando a pessoa chega perto) */
  lead: EnvironmentalClue;
  /** o que se confirma ao cumprir a etapa */
  evidence: EnvironmentalClue;
  /** recompensa de conhecimento */
  knowledge?: string;
}
export interface DiscoveryChain {
  id: string;
  title: string;
  /** condição de surgimento: chegar perto deste nó */
  appearsNear: { node: string; r: number };
  steps: ChainStep[];
  choices: Record<ChainChoice, { label: string; detail: string; tradeoff: string }>;
}

export const SEIVA_AZUL: DiscoveryChain = {
  id: 'seiva-azul',
  title: 'A Seiva Azul',
  appearsNear: { node: 'salgueiro-nascente', r: 10 },
  steps: [
    {
      id: 'seiva', title: 'Uma árvore que brilha', trigger: { node: 'salgueiro-nascente', inspect: true },
      lead: { id: 'seiva-lead', status: 'observacao', text: 'A casca do Salgueiro da Nascente brilha azul onde escorre a seiva.', points: { node: 'salgueiro-nascente' } },
      evidence: { id: 'seiva-hip', status: 'hipotese', text: 'A magia sobe pelas raízes. A água vem de cima — talvez do próprio riacho.', points: { node: 'cascalho-alto', step: 'cascalho' } },
      knowledge: 'Seiva azul aparece em árvores que bebem água mágica.',
    },
    {
      id: 'cascalho', title: 'Pistas na correnteza', trigger: { node: 'cascalho-alto', approach: 'peneirar' },
      lead: { id: 'cascalho-lead', status: 'hipotese', text: 'Peneirar o Cascalho de Cima pode mostrar o que o riacho traz da nascente.', points: { node: 'cascalho-alto' } },
      evidence: { id: 'cascalho-obs', status: 'observacao', text: 'Entre os seixos, lascas com inclusões azuis. Fragmentos no riacho vêm de mais acima: há algo a montante.', points: { step: 'nascente', place: { x: NASCENTE.x, z: NASCENTE.z, label: 'a montante do riacho' } } },
      knowledge: 'Leitura de inclusões: fragmentos no leito indicam a fonte rio acima.',
    },
    {
      id: 'nascente', title: 'A Nascente', trigger: { reach: { x: NASCENTE.x, z: NASCENTE.z, r: 3.6 } },
      lead: { id: 'nascente-lead', status: 'hipotese', text: 'Seguindo o riacho para o norte, deve haver uma fonte.', points: { place: { x: NASCENTE.x, z: NASCENTE.z, label: 'Nascente (provável)' } } },
      evidence: { id: 'nascente-desc', status: 'descoberta', text: 'Uma nascente mágica: a água dela faz plantas medicinais crescerem mais fortes.', points: { place: { x: NASCENTE.x, z: NASCENTE.z, label: 'Nascente Azul' } } },
    },
  ],
  choices: {
    extrair: { label: 'Extrair os cristais e a lágrima', detail: 'Agora: 2 Quartzo Azul íntegro + 2 Seiva Azul + 1 Lágrima da Nascente Azul.', tradeoff: 'A fonte adormece; nada de jardim aqui.' },
    preservar: { label: 'Preservar e cultivar', detail: 'Cria o Jardim da Nascente: raízes de erva excelentes, aos poucos, para sempre.', tradeoff: 'Nenhum cristal agora.' },
  },
};
export const CHAINS: Record<string, DiscoveryChain> = { [SEIVA_AZUL.id]: SEIVA_AZUL };

export interface ChainState { step: number; /** 0..3 (3 = todas as etapas feitas; falta a escolha) */ choice?: ChainChoice | null; completedAt?: string | null }

/** A etapa que falta (ou null). */
export const nextStep = (c: DiscoveryChain, st: ChainState | null | undefined) => c.steps[st?.step ?? 0] ?? null;

/** Confere se uma ação cumpre a próxima etapa (servidor e cliente usam a mesma regra). */
export function stepSatisfied(c: DiscoveryChain, st: ChainState | null | undefined, act: { node?: string; approach?: string; inspect?: boolean; x?: number; z?: number }): boolean {
  const s = nextStep(c, st);
  if (!s || st?.completedAt) return false;
  const t = s.trigger;
  if (t.reach) return act.x !== undefined && act.z !== undefined && Math.hypot(act.x - t.reach.x, act.z - t.reach.z) <= t.reach.r;
  if (t.node && act.node !== t.node) return false;
  if (t.inspect) return !!act.inspect || !!act.approach; // observar ou coletar na árvore
  if (t.approach) return act.approach === t.approach;
  return true;
}

/** Indícios visíveis agora (só o que já se viu ou se deduziu — nunca o que está escondido). */
export function cluesFor(c: DiscoveryChain, st: ChainState | null | undefined, near: (nodeId: string, r: number) => boolean): EnvironmentalClue[] {
  const step = st?.step ?? 0;
  const out: EnvironmentalClue[] = [];
  if (st?.completedAt) return c.steps.map((s) => s.evidence);
  for (let i = 0; i < step; i++) out.push(c.steps[i].evidence);
  const s = c.steps[step];
  if (s && (step > 0 || near(c.appearsNear.node, c.appearsNear.r))) out.push(s.lead);
  return out;
}

/** Recompensa da escolha final (lotes fixos: sem sorteio, sem IA). */
export function chainReward(choice: ChainChoice): MaterialBatch[] {
  if (choice === 'extrair') return [
    { key: 'quartzo-azul|integridade:alta', material: 'quartzo-azul', bands: { integridade: 'alta' }, qty: 2 },
    { key: 'seiva-azul', material: 'seiva-azul', bands: {}, qty: 2 },
    { key: 'lagrima-da-nascente', material: 'lagrima-da-nascente', bands: {}, qty: 1 },
  ];
  return [];
}

// ---------------------------------------------------------------------------
// Ponto de manejo: Jardim da Nascente (pessoal)
// ---------------------------------------------------------------------------

export interface ManagedSiteDef { id: string; name: string; capacity: number; regenPerHour: number; careBoost: number; careHours: number; harvestMax: number; produces: MaterialBatch; access: string }
export const JARDIM: ManagedSiteDef = {
  id: 'jardim-nascente', name: 'Jardim da Nascente', capacity: 10, regenPerHour: 1.5, careBoost: 1.5, careHours: 24, harvestMax: 5,
  produces: { key: 'erva-orvalho-raiz|estabilidade:alta,potencia:alta', material: 'erva-orvalho-raiz', bands: { potencia: 'alta', estabilidade: 'alta' }, qty: 1 },
  access: 'Pessoal: só você (e seu Companion) colhe. Sem cuidar ele continua produzindo, só para no limite — nunca se perde.',
};
export interface SiteState { stored: number; at: number; caredAt?: number | null }
/** Produção acumulada agora (preguiçoso). Cuidar é opcional: acelera por um tempo; a ausência só faz parar no limite. */
export function siteStoredNow(def: ManagedSiteDef, st: SiteState, now: number): number {
  let stored = st.stored, t = st.at;
  const boostEnd = st.caredAt ? st.caredAt + def.careHours * 3_600_000 : 0;
  if (boostEnd > t) { const until = Math.min(now, boostEnd); stored += ((until - t) / 3_600_000) * def.regenPerHour * def.careBoost; t = until; }
  if (now > t) stored += ((now - t) / 3_600_000) * def.regenPerHour;
  return Math.min(def.capacity, stored);
}

// ---------------------------------------------------------------------------
// Receitas (adequação por propriedade)
// ---------------------------------------------------------------------------

export interface RecipeSlot { label: string; category: ResCategory; materials?: string[]; prop?: PropKey; min?: Band; ideal?: Band; qty: number }
export interface RecipeDef {
  id: string; name: string; description: string;
  output: { kind: 'item' | 'tool'; key: string; label: string };
  slots: RecipeSlot[];
}
/**
 * Receitas livres (qualquer classe): só consumíveis. Arco e Cinzel viraram projetos da Forja Taurina (Pacto das
 * Cinco): equipamento e ferramenta só a Taurina conclui.
 */
export const RECIPES: RecipeDef[] = [
  {
    id: 'unguento-orvalho', name: 'Unguento de Orvalho', description: 'Remédio que dura na mochila. Folhas comuns e estáveis são as melhores.',
    output: { kind: 'item', key: 'unguento-de-orvalho', label: 'Unguento de Orvalho' },
    slots: [{ label: 'Planta estável', category: 'planta', prop: 'estabilidade', min: 'media', ideal: 'alta', qty: 2 }],
  },
];
export const recipeById = (id: string) => RECIPES.find((r) => r.id === id) ?? null;

export type Fit = 'ideal' | 'serve' | 'nao-serve';
/** Um lote serve para o espaço da receita? (raridade não entra: só categoria/material e propriedade) */
export function slotFit(slot: RecipeSlot, b: { material: string; bands: Partial<Record<PropKey, Band>> }): Fit {
  const m = MATERIALS[b.material];
  if (!m || m.category !== slot.category) return 'nao-serve';
  if (slot.materials && !slot.materials.includes(b.material)) return 'nao-serve';
  if (!slot.prop) return 'ideal';
  const v = b.bands[slot.prop];
  if (!slot.min || atLeast(v, slot.min)) return slot.ideal && atLeast(v, slot.ideal) ? 'ideal' : 'serve';
  return 'nao-serve';
}
export interface CraftPick { slot: number; key: string; qty: number }
/** Confere uma escolha de lotes para a receita. Devolve a qualidade do resultado ou o motivo do erro. */
export function checkCraft(r: RecipeDef, picks: CraftPick[], bag: MaterialBatch[]): { ok: true; quality: 'comum' | 'boa' | 'excelente'; consume: { key: string; qty: number }[] } | { ok: false; reason: string } {
  const need = r.slots.map((s) => s.qty), got = r.slots.map(() => 0);
  let ideal = 0, total = 0;
  const consume = new Map<string, number>();
  for (const p of picks) {
    const slot = r.slots[p.slot];
    if (!slot || !Number.isInteger(p.qty) || p.qty <= 0) return { ok: false, reason: 'Escolha inválida.' };
    const b = bag.find((x) => x.key === p.key);
    if (!b) return { ok: false, reason: 'Esse material não está na mochila.' };
    const fit = slotFit(slot, b);
    if (fit === 'nao-serve') return { ok: false, reason: `${MATERIALS[b.material].name} não serve para "${slot.label}".` };
    got[p.slot] += p.qty; total += p.qty; if (fit === 'ideal') ideal += p.qty;
    consume.set(p.key, (consume.get(p.key) ?? 0) + p.qty);
  }
  for (const [key, q] of consume) if ((bag.find((x) => x.key === key)?.qty ?? 0) < q) return { ok: false, reason: 'Material insuficiente na mochila.' };
  for (let i = 0; i < need.length; i++) if (got[i] !== need[i]) return { ok: false, reason: `"${r.slots[i].label}": precisa de ${need[i]}.` };
  const ratio = total ? ideal / total : 0;
  return { ok: true, quality: ratio >= 0.99 ? 'excelente' : ratio >= 0.5 ? 'boa' : 'comum', consume: [...consume].map(([key, qty]) => ({ key, qty })) };
}
/** Sugere os lotes para uma receita (o melhor encaixe primeiro; preserva lotes ideais quando "serve" já basta? não: usa os ideais). */
export function autoPick(r: RecipeDef, bag: MaterialBatch[]): CraftPick[] | null {
  const left = new Map(bag.map((b) => [b.key, b.qty]));
  const picks: CraftPick[] = [];
  for (let i = 0; i < r.slots.length; i++) {
    const s = r.slots[i];
    let want = s.qty;
    const cands = bag.filter((b) => slotFit(s, b) !== 'nao-serve').sort((a, b) => (slotFit(s, b) === 'ideal' ? 1 : 0) - (slotFit(s, a) === 'ideal' ? 1 : 0));
    for (const b of cands) {
      if (!want) break;
      const q = Math.min(want, left.get(b.key) ?? 0);
      if (q > 0) { picks.push({ slot: i, key: b.key, qty: q }); left.set(b.key, (left.get(b.key) ?? 0) - q); want -= q; }
    }
    if (want) return null;
  }
  return picks;
}

// ---------------------------------------------------------------------------
// Obra comunitária: Ponte do Riacho (compartilhada por todos)
// ---------------------------------------------------------------------------

export interface ProjectNeed { label: string; category: ResCategory; materials?: string[]; prop?: PropKey; min?: Band; qty: number }
export interface ProjectStage { id: string; title: string; needs: ProjectNeed[]; done: string }
export interface CommunityProjectDef { id: string; name: string; description: string; stages: ProjectStage[]; completion: string }
export const PONTE: CommunityProjectDef = {
  id: 'ponte-riacho', name: 'Ponte do Riacho', description: 'Uma ponte sobre o riacho do Vale dos Ecos, construída por quem passa por aqui.',
  stages: [
    { id: 'fundacao', title: 'Fundação', needs: [{ label: 'Pedra resistente', category: 'pedra', prop: 'resistencia', min: 'media', qty: 20 }], done: 'Pilares de pedra nas duas margens.' },
    { id: 'tabuado', title: 'Tabuado', needs: [{ label: 'Madeira resistente', category: 'madeira', prop: 'resistencia', min: 'media', qty: 14 }, { label: 'Madeira flexível (amarras)', category: 'madeira', prop: 'flexibilidade', min: 'media', qty: 4 }], done: 'Dá para atravessar o riacho.' },
    { id: 'lanternas', title: 'Lanternas', needs: [{ label: 'Cobre', category: 'minerio', materials: ['minerio-cobre'], qty: 6 }, { label: 'Brilho (Seiva Azul ou Quartzo)', category: 'magico', materials: ['seiva-azul'], qty: 2 }], done: 'Lanternas azuis acendem à noite.' },
  ],
  completion: 'A Margem Leste se abre: duas Ervas-de-orvalho novas, e o caminho fica iluminado à noite.',
};
/** "Brilho" aceita seiva ou quartzo (evita travar a obra por falta de uma categoria). */
const NEED_ALTS: Record<string, string[]> = { 'lanternas/1': ['seiva-azul', 'quartzo-azul', 'quartzo-fragmento'] };
export function needFits(p: CommunityProjectDef, stageIdx: number, needIdx: number, b: { material: string; bands: Partial<Record<PropKey, Band>> }): boolean {
  const n = p.stages[stageIdx]?.needs[needIdx];
  if (!n) return false;
  const alts = NEED_ALTS[`${p.stages[stageIdx].id}/${needIdx}`];
  const m = MATERIALS[b.material];
  if (!m) return false;
  if (alts) return alts.includes(b.material);
  if (m.category !== n.category) return false;
  if (n.materials && !n.materials.includes(b.material)) return false;
  return !n.prop || !n.min || atLeast(b.bands[n.prop], n.min);
}
/** Meta ajustável pela população/ritmo do servidor (Admin: ecosProjectScale). */
export const scaledNeed = (n: ProjectNeed, scale: number) => Math.max(1, Math.round(n.qty * Math.max(0.1, scale)));

export interface ProjectState { stage: number; progress: number[]; startedAt: number }
/**
 * Quanto de uma contribuição é aceito: até o que falta e até a cota pessoal da etapa (anti-monopólio). A cota some
 * depois de `capHours` com a etapa aberta, para que um servidor vazio não trave a obra.
 */
export function acceptContribution(p: CommunityProjectDef, st: ProjectState, needIdx: number, offered: number, mineThisStage: number, cfg: { scale: number; capShare: number; capHours: number }, now: number): number {
  const stage = p.stages[st.stage];
  if (!stage || offered <= 0) return 0;
  const n = stage.needs[needIdx]; if (!n) return 0;
  const goal = scaledNeed(n, cfg.scale), missing = Math.max(0, goal - (st.progress[needIdx] ?? 0));
  const totalGoal = stage.needs.reduce((a, x) => a + scaledNeed(x, cfg.scale), 0);
  const capOpen = now - st.startedAt >= cfg.capHours * 3_600_000;
  const capLeft = capOpen ? Infinity : Math.max(0, Math.ceil(totalGoal * cfg.capShare) - mineThisStage);
  return Math.max(0, Math.min(offered, missing, capLeft));
}
export const stageComplete = (p: CommunityProjectDef, st: ProjectState, scale: number) => {
  const s = p.stages[st.stage];
  return !!s && s.needs.every((n, i) => (st.progress[i] ?? 0) >= scaledNeed(n, scale));
};

// ---------------------------------------------------------------------------
// Companion: intenção → sugestão explicada (pontuação de utilidade; só com o que ele sabe)
// ---------------------------------------------------------------------------

export type IntentMode = 'abastecer' | 'selecionar' | 'explorar';
export interface GatheringIntent {
  mode: IntentMode;
  /** o que buscar (categoria/material e, para "selecionar", a propriedade mínima) */
  target: { category?: ResCategory; material?: string; prop?: PropKey; min?: Band; qty: number; label: string } | null;
  /** risco aceitável (0 nenhum · 1 leve · 2 qualquer) */
  risk: 0 | 1 | 2;
  /** espaço que fica livre na mochila (não enche tudo) */
  reserve: number;
  /** ferramentas que ele pode usar (vazio = todas as que tem) */
  tools: ToolKey[];
  prefer: Zone | null;
  /** evita abordagens que esgotam o nó (cortar árvore, arrancar raiz…) */
  gentle: boolean;
}
export const DEFAULT_INTENT: GatheringIntent = { mode: 'abastecer', target: null, risk: 1, reserve: 5, tools: [], prefer: null, gentle: false };

export interface KnownNode { node: ResourceNode; st: NodeState | null; dist: number }
export interface SuggestCtx {
  known: KnownNode[];
  bagFree: number;
  tools: ToolKey[];
  /** materiais já coletados (as propriedades são conhecidas) */
  knownMaterials: string[];
  /** etapa pendente da cadeia (nó que vale investigar), se houver indício */
  clueNode?: string | null;
  now: number;
  weather?: string;
  cfg?: EcosConfig;
}
export interface Suggestion { node: ResourceNode; approach: Approach; score: number; reason: string; blocked?: string }

const meetsTarget = (t: GatheringIntent['target'], material: string) => {
  if (!t) return true;
  const m = MATERIALS[material];
  if (t.material && t.material !== material) return false;
  if (t.category && m.category !== t.category) return false;
  return true;
};

/** Ranqueia o que fazer agora. Ignora nós que ele não conhece. Explica o motivo em uma frase. */
export function suggestGather(intent: GatheringIntent, ctx: SuggestCtx): Suggestion[] {
  const out: Suggestion[] = [];
  const tools = intent.tools.length ? intent.tools.filter((t) => ctx.tools.includes(t)) : ctx.tools;
  for (const kn of ctx.known) {
    const kind = NODE_KINDS[kn.node.kind];
    const have = abundanceNow(kn.node, kn.st, ctx.now, ctx.weather);
    for (const ap of kind.approaches) {
      const outs = expectedOutcome(kn.node, ap);
      const maxQty = ap.yields.reduce((a, y) => a + y.qty[1], 0);
      let blocked: string | undefined;
      if (ap.tool && !tools.includes(ap.tool)) blocked = `precisa de ${ap.tool}`;
      else if (ap.riskLevel > intent.risk) blocked = 'arriscado demais para o combinado';
      else if (have < ap.cost) blocked = 'esgotado por enquanto';
      else if (ctx.bagFree - intent.reserve < maxQty) blocked = 'mochila quase cheia';
      // valor esperado do que serve ao objetivo
      let value = 0, fitsProp = 1, matchesAny = false, unknown = false;
      for (const o of outs) {
        if (!meetsTarget(intent.target, o.material)) continue;
        matchesAny = true;
        const avg = ((o.qty[0] + o.qty[1]) / 2) * (o.chance ?? 1);
        let p = 1;
        const t = intent.target;
        if (t?.prop && t.min) {
          const bands = o.bands[t.prop];
          if (bands && bands.length) p = bands.filter((b) => bandRank(b) >= bandRank(t.min)).length / bands.length;
          else if (MATERIALS[o.material].ranges[t.prop] === undefined) p = 0;
        }
        fitsProp = Math.min(fitsProp, p);
        value += avg * p;
        if (!ctx.knownMaterials.includes(o.material)) unknown = true;
      }
      const travel = kn.dist / 3.5;
      const rate = value / (ap.seconds + travel);
      const harsh = ap.cost >= 4;
      let score = 0;
      if (intent.mode === 'abastecer') score = matchesAny ? rate * 10 : 0;
      else if (intent.mode === 'selecionar') score = matchesAny ? rate * 6 + fitsProp * 4 : 0;
      else score = (unknown ? 3 : 0) + (ctx.clueNode === kn.node.id ? 6 : 0) + rate * 2 + (matchesAny ? 1 : 0);
      if (intent.gentle && harsh) score *= 0.25;
      else if (harsh && intent.mode !== 'abastecer') score *= 0.7;
      if (intent.prefer && kind.zone === intent.prefer) score *= 1.3;
      if (score <= 0 && !blocked) continue;
      out.push({ node: kn.node, approach: ap, score: blocked ? -1 : score, reason: explain(intent, kn, ap, { fitsProp, unknown, clue: ctx.clueNode === kn.node.id, harsh }), blocked });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function explain(intent: GatheringIntent, kn: KnownNode, ap: Approach, f: { fitsProp: number; unknown: boolean; clue: boolean; harsh: boolean }): string {
  const where = `${ap.label.toLowerCase()} no ${nodeName(kn.node)} (${Math.round(kn.dist)} m)`;
  const t = intent.target;
  if (intent.mode === 'explorar') {
    if (f.clue) return `Vale investigar: ${where} — combina com o indício que achamos.`;
    if (f.unknown) return `Ainda não conhecemos esse material: ${where}.`;
    return `Perto e rápido: ${where}.`;
  }
  const propTxt = t?.prop && t.min ? `${t.prop === 'flexibilidade' ? 'flexibilidade' : t.prop} ${t.min === 'alta' ? 'alta' : 'boa'}` : '';
  if (intent.mode === 'selecionar' && propTxt) {
    const conf = f.unknown ? 'deve ter' : f.fitsProp >= 0.99 ? 'garante' : f.fitsProp >= 0.5 ? 'costuma ter' : 'às vezes tem';
    return `${cap(where)}: ${conf} ${propTxt}${f.harsh ? '' : ', sem estragar o lugar'}.`;
  }
  return `${cap(where)}: ${f.harsh ? 'rende bastante de uma vez' : 'rápido e preserva o lugar'}${t ? ` para ${t.label.toLowerCase()}` : ''}.`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** O Companion só conhece o que viu: nós a até `radius` m dele ou de quem joga, mais os que já visitou. */
export const PERCEPTION_R = 14;
export function perceivedNodes(pos: { x: number; z: number }[], seen: string[], bridgeDone: boolean, radius = PERCEPTION_R): ResourceNode[] {
  return VALE_NODES.filter((n) => (!n.needs || (n.needs === 'ponte' && bridgeDone)) && (seen.includes(n.id) || pos.some((p) => Math.hypot(p.x - n.x, p.z - n.z) <= radius)));
}
