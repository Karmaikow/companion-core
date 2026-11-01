/**
 * Pacto das Cinco — Ofícios da Criação (primeira entrega). Regras puras, iguais no cliente, no servidor e nos testes.
 *
 * Princípios (regras imutáveis):
 *  - Só a classe Taurina CONCLUI equipamentos (armas, armaduras, ferramentas, vestíveis), e só na Escola da Forja
 *    em Áster (matriculada; ver escolas.ts). A bancada não fica mais no painel do Pacto.
 *  - Nenhum equipamento vem de drop, baú ou recompensa: monstros e atividades dão materiais, conhecimento e
 *    COMPONENTES não equipáveis. Componente nenhum vira arma fora da Forja.
 *  - Cada classe tem um Ofício de Origem com decisões próprias e produtos negociáveis (componentes):
 *      Dracônica · Confluência · Alada · Harmonização · Feral · Manejo Primordial · Taurina · Forja Primordial ·
 *      Feérica · Inscrição Vital.
 *  - Coleta superior por TIPO DE FONTE (não por raridade); Taurinas coletam o básico e podem localizar/anunciar.
 *  - Ofícios produtivos são separados das habilidades de combate (curar no combate continua de todas as classes).
 *  - Afinidades de classe (+10%) valem só no escopo que já tinham (dano e cura de combate): NÃO entram aqui.
 *  - Fogo e Terra são os princípios da Forja. Cada Companion tem UMA essência; a oficina oferece núcleos de Fogo e
 *    de Terra que só Taurinas operam. Uma Taurina de Fogo ou de Terra traz a própria metade (o núcleo dela não
 *    é cobrado). A essência do Companion nunca muda por isso.
 */
import { companionElement, type Element } from './identity.ts';
import type { SpeciesKey, AttrKey } from './species.ts';
import type { ItemType, Rarity } from './equipment.ts';
import { MATERIALS, parseBatchKey, bandRank, atLeast, nodeKindOf, NODE_KINDS, type Band, type PropKey, type ResCategory, type MaterialBatch, type ToolKey } from './ecos.ts';

// ---------------------------------------------------------------------------
// Ofícios de Origem
// ---------------------------------------------------------------------------

export type OfficeKey = 'confluencia' | 'harmonizacao' | 'manejo' | 'forja' | 'inscricao';
export interface OfficeDef { key: OfficeKey; cls: SpeciesKey; name: string; focus: string; superior: string; icon: string }
export const OFFICES: Record<SpeciesKey, OfficeDef> = {
  serpente: { key: 'confluencia', cls: 'serpente', name: 'Confluência', icon: '🌊', focus: 'Purificação, estabilização elemental, agentes de têmpera e componentes de barreira.', superior: 'Fontes aquáticas, sob pressão e substâncias elementais instáveis.' },
  passaro: { key: 'harmonizacao', cls: 'passaro', name: 'Harmonização', icon: '🪶', focus: 'Equilíbrio, distribuição de esforço, circulação de energia, componentes leves e mecanismos de alcance.', superior: 'Altitude, correntes de ar, fibras e recursos suspensos.' },
  felino: { key: 'manejo', cls: 'felino', name: 'Manejo Primordial', icon: '🌿', focus: 'Extração e preservação de recursos naturais superiores, alimentos e preparados de recuperação física.', superior: 'Fontes naturais terrestres: flora, caça e depósitos acessíveis.' },
  touro: { key: 'forja', cls: 'touro', name: 'Forja Primordial', icon: '🔨', focus: 'Fabricação, integração estrutural, reforja e conclusão de todos os equipamentos, na Escola da Forja em Áster.', superior: 'Só coleta básica; localiza e anuncia oportunidades superiores.' },
  mistica: { key: 'inscricao', cls: 'mistica', name: 'Inscrição Vital', icon: '✶', focus: 'Matrizes rúnicas, catalisadores de cura e tratamento de corrupção e maldições.', superior: 'Fontes encantadas, espirituais e inscrições naturais.' },
};
export const officeOf = (cls: SpeciesKey | null | undefined) => (cls ? OFFICES[cls] : null);
/** Ofícios de todas as formas do Companion. */
export const officesOf = (cls: Forms) => formsOf(cls).map((f) => OFFICES[f]);
export const CLASS_LABEL: Record<SpeciesKey, string> = { serpente: 'Dracônica', passaro: 'Alada', felino: 'Feral', touro: 'Taurina', mistica: 'Feérica' };

/** Só Taurinas concluem equipamentos (inclusive ferramentas). */
/** Uma forma ou várias: a regra vale se qualquer forma permite. */
export type Forms = SpeciesKey | readonly SpeciesKey[] | null | undefined;
export const formsOf = (f: Forms): SpeciesKey[] => (Array.isArray(f) ? [...new Set(f as SpeciesKey[])] : f ? [f as SpeciesKey] : []);
export const canCompleteEquipment = (cls: Forms) => formsOf(cls).includes('touro');

// ---------------------------------------------------------------------------
// Linhagem
// ---------------------------------------------------------------------------
/**
 * SEGREDO DE LORE: não expor ao jogador (nem em textos do jogo) até a lenda ser introduzida na lore.
 * Desenho completo só no documento privado do projeto (pacto-das-cinco.md, seção Linhagem).
 * Aqui ficam só a mecânica e códigos neutros, sem texto descritivo.
 */
export interface Lineage { forms: SpeciesKey[]; essences: Element[] }
export const LINEAGE_LIMITS = { forms: 2, essences: 2 };
/** Evolução das formas (infinita): 0 Partículas, 1–3, e 4+ avançadas. */
export const ADVANCED_FORM = 4;
export function lineageOf(primaryForm: SpeciesKey | null, primaryEssence: Element | null, extra?: { forms?: string[]; essences?: string[] } | null): Lineage {
  const forms = [...new Set([primaryForm, ...(extra?.forms ?? [])].filter(Boolean))] as SpeciesKey[];
  const essences = [...new Set([primaryEssence, ...(extra?.essences ?? [])].map((e) => companionElement(e as Element | null)).filter(Boolean))] as Element[];
  return { forms: forms.slice(0, LINEAGE_LIMITS.forms), essences: essences.slice(0, LINEAGE_LIMITS.essences) };
}
/** null = pode; senão um código neutro ('limite' | 'estagio' | 'item'). */
export function canGainForm(l: Lineage, formStage: number, hasKey: boolean): 'limite' | 'estagio' | 'item' | null {
  if (l.forms.length >= LINEAGE_LIMITS.forms) return 'limite';
  if (!(formStage >= ADVANCED_FORM)) return 'estagio';
  if (!hasKey) return 'item';
  return null;
}
export function canGainEssence(l: Lineage, questDone: boolean): 'limite' | 'quest' | null {
  if (l.essences.length >= LINEAGE_LIMITS.essences) return 'limite';
  if (!questDone) return 'quest';
  return null;
}
export const lineageLabel = (l: Lineage) => l.forms.map((f) => CLASS_LABEL[f]).join(' + ') || '—';

// ---------------------------------------------------------------------------
// Coleta superior por tipo de fonte
// ---------------------------------------------------------------------------

export type SourceKind = 'aquatica' | 'pressao' | 'elemental' | 'altitude' | 'corrente' | 'fibra-aerea' | 'flora' | 'caca' | 'deposito' | 'encantada' | 'espiritual' | 'inscricao';
export const SOURCE_LABEL: Record<SourceKind, string> = {
  aquatica: 'fonte aquática', pressao: 'depósito sob pressão', elemental: 'substância elemental instável', altitude: 'altitude', corrente: 'corrente de ar',
  'fibra-aerea': 'fibra aérea', flora: 'flora terrestre', caca: 'caça', deposito: 'depósito acessível', encantada: 'fonte encantada', espiritual: 'flora espiritual', inscricao: 'inscrição natural',
};
export const SOURCE_CLASS: Record<SourceKind, SpeciesKey> = {
  aquatica: 'serpente', pressao: 'serpente', elemental: 'serpente',
  altitude: 'passaro', corrente: 'passaro', 'fibra-aerea': 'passaro',
  flora: 'felino', caca: 'felino', deposito: 'felino',
  encantada: 'mistica', espiritual: 'mistica', inscricao: 'mistica',
};
/** Pode extrair diretamente desta fonte superior? (Taurina nunca; ela marca e anuncia) */
export function canExtractSuperior(cls: Forms, source: SourceKind): boolean {
  return formsOf(cls).some((f) => f !== 'touro' && SOURCE_CLASS[source] === f);
}
/** Mensagem de bloqueio de uma fonte superior para esta classe (null = pode extrair ou é fonte básica). */
export function superiorBlockFor(nodeId: string, cls: Forms): string | null {
  const k = nodeKindOf(nodeId); const src = k ? (NODE_KINDS[k].source as SourceKind | undefined) : undefined;
  if (!src || canExtractSuperior(cls, src)) return null;
  const who = SOURCE_CLASS[src];
  return `Fonte superior (${SOURCE_LABEL[src]}): só ${CLASS_LABEL[who]} extrai daqui.${canCompleteEquipment(cls) ? ' Você pode localizar e anunciar a oportunidade no quadro do Pacto.' : ''}`;
}

// ---------------------------------------------------------------------------
// Componentes (não equipáveis) e chave com procedência
// ---------------------------------------------------------------------------

export interface ComponentDef { id: string; name: string; office: OfficeKey; layer: 'corpo' | 'trama' | 'marca' | 'tempera'; props: PropKey[] | ComponentProp[]; description: string; uses: string[] }
export type ComponentProp = 'potencia' | 'estabilidade' | 'leveza' | 'resistencia' | 'flexibilidade' | 'duracao' | 'recarga';
export const COMPONENTS: Record<string, ComponentDef> = {
  'agente-tempera-agua': { id: 'agente-tempera-agua', name: 'Agente de Têmpera Aquática', office: 'confluencia', layer: 'tempera', props: ['potencia', 'estabilidade'], description: 'Banho purificado que tempera devagar e dá afinidade de água.', uses: ['Têmpera de escudos e lâminas aquáticas', 'Barreiras'] },
  'trama-distribuicao': { id: 'trama-distribuicao', name: 'Trama de Distribuição', office: 'harmonizacao', layer: 'trama', props: ['leveza', 'estabilidade'], description: 'Fios equilibrados que espalham o esforço pela peça.', uses: ['Escudos e armas manejáveis', 'Mecanismos de alcance'] },
  'cerne-preservado': { id: 'cerne-preservado', name: 'Cerne Preservado', office: 'manejo', layer: 'corpo', props: ['resistencia', 'flexibilidade'], description: 'Madeira superior com as fibras intactas.', uses: ['Corpo de escudos, arcos e cabos superiores'] },
  'matriz-barreira': { id: 'matriz-barreira', name: 'Matriz de Barreira Breve', office: 'inscricao', layer: 'marca', props: ['duracao', 'recarga'], description: 'Runa viva que guarda uma barreira curta.', uses: ['Marca de escudos', 'Amuletos de proteção'] },
};
const PROP_NAME: Record<ComponentProp, string> = { potencia: 'potência', estabilidade: 'estabilidade', leveza: 'leveza', resistencia: 'resistência', flexibilidade: 'flexibilidade', duracao: 'duração', recarga: 'recarga rápida' };
export const componentPropLabel = (p: string) => PROP_NAME[p as ComponentProp] ?? p;

/** Chave de lote de componente: `cmp:<id>|prop:faixa,...~<autor8>` (a procedência fica na chave). */
export function componentKey(id: string, bands: Record<string, Band>, maker: string): string {
  const parts = Object.keys(bands).sort().map((k) => `${k}:${bands[k]}`);
  return `cmp:${id}|${parts.join(',')}~${maker.replace(/-/g, '').slice(0, 8)}`;
}
export interface ParsedComponent { component: string; bands: Record<string, Band>; maker: string }
export function parseComponentKey(key: string): ParsedComponent | null {
  const m = /^cmp:([a-z0-9-]+)\|([a-z:,]*)~([0-9a-f]{8})$/.exec(key);
  if (!m || !COMPONENTS[m[1]]) return null;
  const bands: Record<string, Band> = {};
  for (const p of m[2].split(',').filter(Boolean)) { const [k, v] = p.split(':'); if (!['baixa', 'media', 'alta'].includes(v)) return null; bands[k] = v as Band; }
  return { component: m[1], bands, maker: m[3] };
}

// ---------------------------------------------------------------------------
// Essências artesanais (técnicas extras nos ofícios; nunca transferem exclusividade)
// ---------------------------------------------------------------------------

export const ESSENCE_CRAFT: Record<Element, { label: string; principle: string; lifts: string; hint: string }> = {
  fogo: { label: 'Fusão', principle: 'fusão e união', lifts: 'resistencia', hint: 'une melhor as partes' },
  agua: { label: 'Têmpera gradual', principle: 'purificação e têmpera', lifts: 'estabilidade', hint: 'tempera sem rachar' },
  terra: { label: 'Ancoragem', principle: 'estrutura e ancoragem', lifts: 'resistencia', hint: 'estrutura mais firme' },
  vento: { label: 'Leveza', principle: 'equilíbrio e leveza', lifts: 'leveza', hint: 'tira peso sem perder forma' },
  natureza: { label: 'Integração orgânica', principle: 'cultivo e integração orgânica', lifts: 'flexibilidade', hint: 'fibras vivas, mais elásticas' },
  raio: { label: 'Condução', principle: 'condução e ativação', lifts: 'recarga', hint: 'ativa mais rápido' },
  gelo: { label: 'Conservação', principle: 'conservação e estabilização', lifts: 'estabilidade', hint: 'segura a forma no tempo' },
  luz: { label: 'Clareza rúnica', principle: 'purificação espiritual e proteção', lifts: 'duracao', hint: 'proteção que dura mais' },
  sombra: { label: 'Contenção', principle: 'contenção e isolamento', lifts: 'estabilidade', hint: 'isola o que vaza' },
  veneno: { label: 'Reagentes', principle: 'reagentes, toxinas e antídotos', lifts: 'potencia', hint: 'reação mais forte' },
};

// ---------------------------------------------------------------------------
// Transformações de ofício (ProfessionTransformation)
// ---------------------------------------------------------------------------

export interface InputSlot { label: string; qty: number; /** família: materiais/componentes aceitos, com limites explícitos */ accepts: { materials?: string[]; category?: ResCategory; prop?: PropKey; min?: Band; components?: string[] }[] }
export interface TransformChoice { id: string; label: string; detail: string; sets: Record<string, Band> }
export interface ProfessionTransformation {
  id: string; office: OfficeKey; name: string; output: string; outputQty: number; seconds: number;
  inputs: InputSlot[];
  /** decisão própria do ofício (sempre há troca: ganha numa propriedade, perde noutra) */
  choices: TransformChoice[];
}
export const TRANSFORMATIONS: ProfessionTransformation[] = [
  {
    id: 'purificar-agente', office: 'confluencia', name: 'Purificar e preparar Agente de Têmpera', output: 'agente-tempera-agua', outputQty: 1, seconds: 12,
    inputs: [
      { label: 'Água mágica (Água de Remanso, Seiva Azul ou quartzo)', qty: 1, accepts: [{ materials: ['agua-da-nascente', 'seiva-azul', 'quartzo-azul'] }, { materials: ['quartzo-fragmento'] }] },
      { label: 'Planta estável', qty: 2, accepts: [{ category: 'planta', prop: 'estabilidade', min: 'media' }] },
    ],
    choices: [
      { id: 'remover-minerais', label: 'Remover os minerais', detail: 'Têmpera mais estável, menos intensa.', sets: { estabilidade: 'alta', potencia: 'media' } },
      { id: 'manter-minerais', label: 'Manter os minerais', detail: 'Têmpera mais forte, menos previsível.', sets: { estabilidade: 'media', potencia: 'alta' } },
    ],
  },
  {
    id: 'tecer-trama', office: 'harmonizacao', name: 'Tecer Trama de Distribuição', output: 'trama-distribuicao', outputQty: 1, seconds: 12,
    inputs: [
      { label: 'Fibra flexível (madeira flexível)', qty: 2, accepts: [{ category: 'madeira', prop: 'flexibilidade', min: 'media' }] },
      { label: 'Fio de energia (seiva, fragmentos ou Fibra dos Ventos)', qty: 1, accepts: [{ materials: ['seiva-azul', 'quartzo-fragmento', 'quartzo-azul', 'fibra-aerea'] }] },
    ],
    choices: [
      { id: 'leveza', label: 'Priorizar leveza', detail: 'Peça manejável e rápida; segura menos impacto.', sets: { leveza: 'alta', estabilidade: 'media' } },
      { id: 'estabilidade', label: 'Priorizar estabilidade', detail: 'Distribui melhor golpes fortes; um pouco mais pesada.', sets: { leveza: 'media', estabilidade: 'alta' } },
    ],
  },
  {
    id: 'preservar-cerne', office: 'manejo', name: 'Preservar o cerne', output: 'cerne-preservado', outputQty: 1, seconds: 12,
    inputs: [
      // fonte superior OU alternativa comum em maior quantidade (sem travar o progresso)
      { label: 'Cerne de Salgueiro Antigo (ou 4 madeiras flexíveis altas)', qty: 1, accepts: [{ materials: ['cerne-salgueiro'] }] },
    ],
    choices: [
      { id: 'secagem-lenta', label: 'Secagem lenta', detail: 'Fibras elásticas; um pouco menos rígido.', sets: { flexibilidade: 'alta', resistencia: 'media' } },
      { id: 'selagem', label: 'Selar com resina', detail: 'Mais rígido e durável; menos elástico.', sets: { flexibilidade: 'media', resistencia: 'alta' } },
    ],
  },
  {
    id: 'inscrever-barreira', office: 'inscricao', name: 'Inscrever Matriz de Barreira', output: 'matriz-barreira', outputQty: 1, seconds: 12,
    inputs: [
      { label: 'Suporte cristalino (quartzo ou cristal inscrito)', qty: 1, accepts: [{ materials: ['quartzo-azul', 'cristal-inscrito'] }, { materials: ['quartzo-fragmento'] }] },
      { label: 'Seiva Azul', qty: 1, accepts: [{ materials: ['seiva-azul'] }] },
    ],
    choices: [
      { id: 'barreira-longa', label: 'Barreira longa', detail: 'Dura mais, demora mais para voltar.', sets: { duracao: 'alta', recarga: 'baixa' } },
      { id: 'barreira-rapida', label: 'Barreira rápida', detail: 'Curtinha, volta logo.', sets: { duracao: 'baixa', recarga: 'alta' } },
    ],
  },
];
/** Alternativa da Feral: 4 madeiras de flexibilidade alta no lugar do cerne superior (quantidade explícita). */
export const CERNE_ALTERNATIVE = { materials: ['madeira-salgueiro'], prop: 'flexibilidade' as PropKey, min: 'alta' as Band, qty: 4 };
export const transformationById = (id: string) => TRANSFORMATIONS.find((t) => t.id === id) ?? null;
export const transformationFor = (office: OfficeKey | null | undefined) => TRANSFORMATIONS.filter((t) => t.office === office);

/** Qualquer chave de lote (material de coleta ou componente) cabe neste espaço? */
export function inputFits(slot: InputSlot, key: string): boolean {
  const c = parseComponentKey(key);
  const m = c ? null : parseBatchKey(key);
  return slot.accepts.some((a) => {
    if (c) return !!a.components?.includes(c.component);
    if (!m) return false;
    const def = MATERIALS[m.material];
    if (a.materials && !a.materials.includes(m.material)) return false;
    if (a.category && def.category !== a.category) return false;
    if (a.prop && a.min && !atLeast(m.bands[a.prop], a.min)) return false;
    return !!(a.materials || a.category);
  });
}

export interface Pick { slot: number; key: string; qty: number }
/** Confere entradas de uma transformação (posse, encaixe, quantidade) e calcula o produto. */
export function checkTransformation(t: ProfessionTransformation, picks: Pick[], bag: { key: string; qty: number }[], choiceId: string, essence: Element | null, useEssence: boolean, maker: string):
  { ok: true; consume: { key: string; qty: number }[]; output: { key: string; qty: number }; bands: Record<string, Band> } | { ok: false; reason: string } {
  const choice = t.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'Escolha uma das decisões do ofício.' };
  const got = t.inputs.map(() => 0);
  const consume = new Map<string, number>();
  let altCerne = false;
  for (const p of picks) {
    const slot = t.inputs[p.slot];
    if (!slot || !Number.isInteger(p.qty) || p.qty <= 0) return { ok: false, reason: 'Escolha inválida.' };
    let fits = inputFits(slot, p.key);
    // alternativa explícita do cerne
    if (!fits && t.id === 'preservar-cerne') { const m = parseBatchKey(p.key); if (m && CERNE_ALTERNATIVE.materials.includes(m.material) && atLeast(m.bands[CERNE_ALTERNATIVE.prop], CERNE_ALTERNATIVE.min)) { fits = true; altCerne = true; } }
    if (!fits) return { ok: false, reason: `Esse material não serve para "${slot.label}".` };
    got[p.slot] += p.qty;
    consume.set(p.key, (consume.get(p.key) ?? 0) + p.qty);
  }
  for (const [key, q] of consume) if ((bag.find((b) => b.key === key)?.qty ?? 0) < q) return { ok: false, reason: 'Material insuficiente.' };
  for (let i = 0; i < t.inputs.length; i++) {
    const need = altCerne && i === 0 ? CERNE_ALTERNATIVE.qty : t.inputs[i].qty;
    if (got[i] !== need) return { ok: false, reason: `"${t.inputs[i].label}": precisa de ${need}.` };
  }
  const bands: Record<string, Band> = { ...choice.sets };
  if (useEssence && essence) {
    const lift = ESSENCE_CRAFT[essence].lifts;
    if (lift in bands) bands[lift] = bands[lift] === 'baixa' ? 'media' : 'alta'; // sobe uma faixa, com teto
  }
  return { ok: true, consume: [...consume].map(([key, qty]) => ({ key, qty })), output: { key: componentKey(t.output, bands, maker), qty: t.outputQty }, bands };
}
/** A técnica da essência só vale se mexe numa propriedade do produto. */
export const essenceApplies = (t: ProfessionTransformation, essence: Element | null) => !!essence && t.choices.some((c) => ESSENCE_CRAFT[essence].lifts in c.sets);

// ---------------------------------------------------------------------------
// Forja: projetos (ForgeBlueprint), plano (ForgePlan) e previsão determinística
// ---------------------------------------------------------------------------

export type Layer = 'corpo' | 'trama' | 'marca' | 'tempera';
export type Intent = 'protecao' | 'precisao' | 'impacto' | 'conducao' | 'mobilidade' | 'trabalho';
export const INTENT_LABEL: Record<Intent, string> = { protecao: 'Proteção', precisao: 'Precisão', impacto: 'Impacto', conducao: 'Condução mágica', mobilidade: 'Mobilidade', trabalho: 'Trabalho (ferramenta)' };

export interface BlueprintSlot { layer: Layer; label: string; qty: number; accepts: InputSlot['accepts']; optional?: boolean }
export interface MarkDef { id: 'barreira-breve' | 'afinidade-agua'; label: string }
export interface ForgeBlueprint {
  id: string; name: string; tier: 'basico' | 'avancado' | 'superior';
  kind: 'equipamento' | 'ferramenta' | 'consumivel';
  itemType?: ItemType; tool?: ToolKey;
  intents: Intent[];
  slots: BlueprintSlot[];
  seconds: number;
  durability: number;
  /** classes cujo ofício aparece nos componentes exigidos (para mostrar a cooperação) */
  offices: OfficeKey[];
  description: string;
}
/** onde a Forja pede cobre: o refinado da Casa dos Ecos e a prata (variedade da Escola da Forja) também servem */
const METAL = ['minerio-cobre', 'lingote-de-cobre', 'minerio-prata'];
const wood = (min?: Band, prop: PropKey = 'resistencia') => ({ category: 'madeira' as ResCategory, prop, min });
export const BLUEPRINTS: ForgeBlueprint[] = [
  { id: 'faca-de-colheita', name: 'Faca de Colheita', tier: 'basico', kind: 'ferramenta', tool: 'faca', intents: ['trabalho'], seconds: 15, durability: 40, offices: ['forja'], description: 'Corta flores, seiva e raízes sem estragar a planta.',
    slots: [{ layer: 'corpo', label: 'Cabo (qualquer madeira)', qty: 1, accepts: [wood()] }, { layer: 'corpo', label: 'Lâmina (cobre)', qty: 1, accepts: [{ materials: METAL }] }] },
  { id: 'machado-simples', name: 'Machado Simples', tier: 'basico', kind: 'ferramenta', tool: 'machado', intents: ['trabalho'], seconds: 20, durability: 50, offices: ['forja'], description: 'Para cortar árvores inteiras.',
    slots: [{ layer: 'corpo', label: 'Cabo resistente', qty: 1, accepts: [wood('media')] }, { layer: 'corpo', label: 'Cabeça (cobre ou granito)', qty: 2, accepts: [{ materials: ['minerio-cobre', 'pedra-granito'] }] }] },
  { id: 'picareta-simples', name: 'Picareta Simples', tier: 'basico', kind: 'ferramenta', tool: 'picareta', intents: ['trabalho'], seconds: 20, durability: 50, offices: ['forja'], description: 'Quebra rocha e escava veios.',
    slots: [{ layer: 'corpo', label: 'Cabo resistente', qty: 1, accepts: [wood('media')] }, { layer: 'corpo', label: 'Ponta de cobre', qty: 2, accepts: [{ materials: METAL }] }] },
  { id: 'cinzel-de-cobre', name: 'Cinzel de Cobre', tier: 'basico', kind: 'ferramenta', tool: 'cinzel', intents: ['trabalho'], seconds: 20, durability: 30, offices: ['forja'], description: 'Solta gemas inteiras sem rachar.',
    slots: [{ layer: 'corpo', label: 'Cobre puro', qty: 2, accepts: [{ materials: METAL, prop: 'pureza', min: 'media' }] }, { layer: 'corpo', label: 'Cabo resistente', qty: 1, accepts: [wood('media')] }] },
  { id: 'arco-de-salgueiro', name: 'Arco de Salgueiro', tier: 'basico', kind: 'equipamento', itemType: 'arco', intents: ['precisao', 'mobilidade'], seconds: 25, durability: 60, offices: ['forja'], description: 'Dobra sem quebrar. Madeira comum e flexível é a ideal.',
    slots: [{ layer: 'corpo', label: 'Madeira flexível', qty: 3, accepts: [wood('media', 'flexibilidade')] }, { layer: 'marca', label: 'Seiva Azul (afinidade de água)', qty: 1, accepts: [{ materials: ['seiva-azul'] }], optional: true }] },
  { id: 'escudo-de-tabuas', name: 'Escudo de Tábuas', tier: 'basico', kind: 'equipamento', itemType: 'escudo', intents: ['protecao'], seconds: 25, durability: 70, offices: ['forja'], description: 'Simples, pesado e honesto.',
    slots: [{ layer: 'corpo', label: 'Tábuas resistentes', qty: 3, accepts: [wood('media')] }, { layer: 'corpo', label: 'Rebites de cobre', qty: 1, accepts: [{ materials: METAL }] }] },
  { id: 'kit-de-reparo', name: 'Kit de Reparo', tier: 'basico', kind: 'consumivel', intents: ['trabalho'], seconds: 10, durability: 0, offices: ['forja'], description: 'Qualquer pessoa usa: devolve durabilidade a um equipamento (sem passar do máximo).',
    slots: [{ layer: 'corpo', label: 'Madeira', qty: 1, accepts: [wood()] }, { layer: 'corpo', label: 'Cobre', qty: 1, accepts: [{ materials: METAL }] }] },
  { id: 'guardiao-da-nascente', name: 'Guardião da Nascente', tier: 'avancado', kind: 'equipamento', itemType: 'escudo', intents: ['protecao', 'conducao'], seconds: 40, durability: 120, offices: ['manejo', 'confluencia', 'harmonizacao', 'inscricao', 'forja'], description: 'Escudo aquático: depois de uma defesa válida, ergue uma barreira breve.',
    slots: [
      { layer: 'corpo', label: 'Cerne Preservado (Feral)', qty: 1, accepts: [{ components: ['cerne-preservado'] }] },
      { layer: 'corpo', label: 'Cobre de pureza média ou alta', qty: 2, accepts: [{ materials: METAL, prop: 'pureza', min: 'media' }] },
      { layer: 'trama', label: 'Trama de Distribuição (Alada)', qty: 1, accepts: [{ components: ['trama-distribuicao'] }] },
      { layer: 'marca', label: 'Matriz de Barreira Breve (Feérica)', qty: 1, accepts: [{ components: ['matriz-barreira'] }] },
      { layer: 'tempera', label: 'Agente de Têmpera Aquática (Dracônica)', qty: 1, accepts: [{ components: ['agente-tempera-agua'] }] },
    ] },
];
export const blueprintById = (id: string) => BLUEPRINTS.find((b) => b.id === id) ?? null;

/** Decisões da condução e da têmpera (escolhas entre propriedades, sem bônus infinito). */
export type Conduct = 'resistencia' | 'leveza';
export type Temper = 'estavel' | 'reativa';
export const CONDUCT_LABEL: Record<Conduct, string> = { resistencia: 'Mais resistência (mais pesado)', leveza: 'Menos peso (protege um pouco menos)' };
export const TEMPER_LABEL: Record<Temper, string> = { estavel: 'Têmpera estável (dura mais)', reativa: 'Têmpera reativa (Marca mais forte, gasta mais)' };

export interface ForgePlan { blueprint: string; picks: Pick[]; conduct: Conduct; temper: Temper; name?: string }
export interface ForgeOutcome {
  stats: Partial<Record<AttrKey, number>>;
  weight: 'leve' | 'medio' | 'pesado';
  durability: number;
  affinity: Element | null;
  mark: MarkConfig | null;
  rarity: Rarity;
  layers: { corpo: string[]; trama: string[]; marca: string[]; tempera: string[] };
  consume: { key: string; qty: number }[];
  contributors: { office: OfficeKey; maker: string; component: string }[];
}

/** Barreira Breve (Marca do Guardião): valores configuráveis, sem ciclo infinito (a recarga começa na ativação). */
export interface MarkConfig { id: 'barreira-breve' | 'afinidade-agua'; label: string; duration: number; absorb: number; cooldown: number; spCost: number; trigger: string }
export const DEFAULT_BARRIER = { duration: 3, absorb: 30, cooldown: 18, spCost: 6 };

const BAND_VAL: Record<Band, number> = { baixa: 0, media: 1, alta: 2 };
function bandsOfKey(key: string): Record<string, Band> {
  const c = parseComponentKey(key); if (c) return c.bands;
  const m = parseBatchKey(key); return (m?.bands ?? {}) as Record<string, Band>;
}
function materialOfKey(key: string): string { return parseComponentKey(key)?.component ?? parseBatchKey(key)?.material ?? key; }

/** Confere o plano e calcula a peça (determinístico: a previsão é o resultado). */
export function forgePreview(plan: ForgePlan, bag: { key: string; qty: number }[], opts: { barrier?: typeof DEFAULT_BARRIER } = {}): ({ ok: true } & ForgeOutcome) | { ok: false; reason: string; missing?: string[] } {
  const bp = blueprintById(plan.blueprint);
  if (!bp) return { ok: false, reason: 'Projeto inexistente.' };
  const got = bp.slots.map(() => 0);
  const consume = new Map<string, number>();
  for (const p of plan.picks) {
    const slot = bp.slots[p.slot];
    if (!slot || !Number.isInteger(p.qty) || p.qty <= 0) return { ok: false, reason: 'Escolha inválida.' };
    if (!inputFits({ label: slot.label, qty: slot.qty, accepts: slot.accepts }, p.key)) return { ok: false, reason: `Não serve para "${slot.label}".` };
    got[p.slot] += p.qty;
    consume.set(p.key, (consume.get(p.key) ?? 0) + p.qty);
  }
  const missing: string[] = [];
  bp.slots.forEach((s, i) => { if (got[i] !== s.qty && !(s.optional && got[i] === 0)) missing.push(`${s.label} (${got[i]}/${s.qty})`); });
  if (missing.length) return { ok: false, reason: 'Faltam materiais no plano.', missing };
  for (const [key, q] of consume) if ((bag.find((b) => b.key === key)?.qty ?? 0) < q) return { ok: false, reason: 'Material insuficiente.' };

  // propriedades médias por camada
  const avg = (layer: Layer, prop: string) => {
    let s = 0, n = 0;
    plan.picks.forEach((p) => { if (bp.slots[p.slot].layer !== layer) return; const b = bandsOfKey(p.key)[prop]; if (b) { s += BAND_VAL[b] * p.qty; n += p.qty; } });
    return n ? s / n : -1;
  };
  const resist = Math.max(avg('corpo', 'resistencia'), avg('corpo', 'pureza'), 0);
  const flex = Math.max(avg('corpo', 'flexibilidade'), avg('corpo', 'flexibilidade'));
  const lev = avg('trama', 'leveza'), est = avg('trama', 'estabilidade');
  const heavyMats = plan.picks.filter((p) => ['minerio-cobre', 'pedra-granito', 'madeira-carvalho'].includes(materialOfKey(p.key))).reduce((a, p) => a + p.qty, 0);
  let weightScore = heavyMats * 0.6 - (lev > 0 ? lev : 0) * 1.2 + (plan.conduct === 'resistencia' ? 0.8 : -0.8);
  const weight = weightScore > 2 ? 'pesado' : weightScore > 0.5 ? 'medio' : 'leve';
  const stats: Partial<Record<AttrKey, number>> = {};
  const t = bp.itemType;
  const k = plan.conduct === 'resistencia' ? 1.15 : 0.9;
  if (t === 'escudo') { stats.defesa = Math.round((4 + resist * 2 + (est > 0 ? est : 0)) * k); if (weight === 'pesado') stats.agilidade = -2; if (weight === 'leve') stats.agilidade = 1; }
  if (t === 'arco') { stats.agilidade = Math.round(2 + Math.max(0, flex) * 1.5); stats.poder = Math.round((1 + resist) * k); }
  if (bp.tier === 'avancado' && lev > 0) stats.sintonia = Math.round(lev);
  let durability = Math.round(bp.durability * (0.75 + resist * 0.15) * (plan.temper === 'estavel' ? 1.1 : 0.95));
  if (bp.kind === 'consumivel') durability = 0;
  // Marca
  let mark: MarkConfig | null = null;
  const mat = plan.picks.find((p) => bp.slots[p.slot].layer === 'marca');
  const affinity: Element | null = plan.picks.some((p) => ['seiva-azul', 'agente-tempera-agua', 'matriz-barreira'].includes(materialOfKey(p.key))) ? 'agua' : null;
  if (mat && materialOfKey(mat.key) === 'matriz-barreira') {
    const b = bandsOfKey(mat.key), base = opts.barrier ?? DEFAULT_BARRIER;
    const dur = base.duration * (b.duracao === 'alta' ? 1.4 : b.duracao === 'baixa' ? 0.75 : 1);
    const cd = base.cooldown * (b.recarga === 'alta' ? 0.7 : b.recarga === 'baixa' ? 1.3 : 1);
    const temperAgent = plan.picks.find((p) => bp.slots[p.slot].layer === 'tempera');
    const pot = temperAgent ? bandsOfKey(temperAgent.key).potencia : undefined;
    const absorb = base.absorb * (plan.temper === 'reativa' ? 1.25 : 1) * (pot === 'alta' ? 1.15 : 1);
    mark = { id: 'barreira-breve', label: 'Barreira Breve', duration: Math.round(dur * 10) / 10, absorb: Math.round(absorb), cooldown: Math.max(base.duration + 2, Math.round(cd)), spCost: base.spCost + (plan.temper === 'reativa' ? 2 : 0), trigger: 'Depois de uma defesa válida (bloqueio com E ao receber um golpe), se não estiver em recarga.' };
  } else if (mat && materialOfKey(mat.key) === 'seiva-azul') {
    mark = { id: 'afinidade-agua', label: 'Afinidade de Água', duration: 0, absorb: 0, cooldown: 0, spCost: 0, trigger: 'Sempre: a arma conta como de água.' };
  }
  const tiers = { basico: 'comum', avancado: 'rara', superior: 'lendaria' } as const;
  const layers = { corpo: [] as string[], trama: [] as string[], marca: [] as string[], tempera: [] as string[] };
  plan.picks.forEach((p) => { const name = COMPONENTS[materialOfKey(p.key)]?.name ?? MATERIALS[materialOfKey(p.key)]?.name ?? p.key; layers[bp.slots[p.slot].layer].push(`${p.qty}× ${name}`); });
  const contributors = plan.picks.map((p) => parseComponentKey(p.key)).filter((c): c is ParsedComponent => !!c).map((c) => ({ office: COMPONENTS[c.component].office, maker: c.maker, component: c.component }));
  return { ok: true, stats, weight, durability, affinity, mark, rarity: tiers[bp.tier], layers, consume: [...consume].map(([key, qty]) => ({ key, qty })), contributors };
}

/** Modo assistido: escolhe os lotes para o plano pela intenção (prioriza propriedade alta; preserva componentes raros só onde são exigidos). */
export function assistPlan(blueprint: string, bag: { key: string; qty: number }[], prefer: Conduct = 'resistencia'): ForgePlan | null {
  const bp = blueprintById(blueprint); if (!bp) return null;
  const left = new Map(bag.map((b) => [b.key, b.qty]));
  const picks: Pick[] = [];
  for (let i = 0; i < bp.slots.length; i++) {
    const s = bp.slots[i];
    let want = s.qty;
    const cands = bag.filter((b) => inputFits({ label: s.label, qty: s.qty, accepts: s.accepts }, b.key)).sort((a, b) => score(b.key) - score(a.key));
    for (const b of cands) { if (!want) break; const q = Math.min(want, left.get(b.key) ?? 0); if (q > 0) { picks.push({ slot: i, key: b.key, qty: q }); left.set(b.key, (left.get(b.key) ?? 0) - q); want -= q; } }
    if (want && !s.optional) return null;
    if (want && s.optional) picks.splice(picks.findIndex((p) => p.slot === i) >>> 0, picks.filter((p) => p.slot === i).length); // opcional incompleto: deixa vazio
  }
  return { blueprint, picks: picks.filter((p) => p.qty > 0), conduct: prefer, temper: 'estavel' };
  function score(key: string) { return Object.values(bandsOfKey(key)).reduce((a, b) => a + BAND_VAL[b], 0); }
}

// ---------------------------------------------------------------------------
// Equipamento (EquipmentInstance), assinatura, reparo, reforja e reciclagem
// ---------------------------------------------------------------------------

export interface ArtisanSignature { artisan: string; artisanName: string; at: string; contributors: { office: OfficeKey; maker: string; component: string; name?: string }[] }
export interface EquipmentInstance {
  id: string; owner: string; blueprint: string; name: string; kind: ForgeBlueprint['kind']; itemType: ItemType | null; tool: ToolKey | null;
  stats: Partial<Record<AttrKey, number>>; weight: ForgeOutcome['weight']; affinity: Element | null; mark: MarkConfig | null; rarity: Rarity;
  durability: number; maxDurability: number; layers: ForgeOutcome['layers']; consumed: { key: string; qty: number }[];
  signature: ArtisanSignature; history: { at: string; what: string }[];
}

export const REPAIR_KIT_AMOUNT = 30;
export function repairWithKit(inst: Pick2<EquipmentInstance, 'durability' | 'maxDurability'>): number { return Math.min(inst.maxDurability, inst.durability + REPAIR_KIT_AMOUNT); }
type Pick2<T, K extends keyof T> = { [P in K]: T[P] };

/**
 * Reciclagem: devolve no máximo 40% dos materiais BÁSICOS consumidos (arredonda para baixo); componentes de ofício
 * (cerne, trama, matriz, agente) se perdem. Assim forjar → reciclar → forjar nunca gera material.
 */
export const RECYCLE_SHARE = 0.4;
export function recycleReturn(consumed: { key: string; qty: number }[], share = RECYCLE_SHARE): { key: string; qty: number }[] {
  return consumed.filter((c) => !parseComponentKey(c.key)).map((c) => ({ key: c.key, qty: Math.floor(c.qty * share) })).filter((c) => c.qty > 0);
}

/** Reforja estrutural (só Taurina): troca a decisão de condução/têmpera; custo limitado = 1 material básico do corpo. */
export const REFORGE_COST_SHARE = 0.34;

// ---------------------------------------------------------------------------
// Lumes (moeda) e quadro de encomendas (WorkOrder + EscrowReservation)
// ---------------------------------------------------------------------------

/** Parâmetros (Admin → game_config.values.pacto). Valores de economia marcados como "a balancear". */
export interface PactoConfig {
  /** bolsa única ao primeiro acesso (origem declarada, finita) */
  starterLumes: number;
  /** Lumes por etapa concluída da obra (para cada contribuinte) e por descoberta concluída */
  projectStageLumes: number; discoveryLumes: number;
  /** custo de cada núcleo (Fogo/Terra) da oficina pública, por forja; Taurina de Fogo/Terra não paga o dela */
  coreFee: number;
  /** taxa do quadro de encomendas (fração do pagamento que some da economia) */
  orderFee: number;
  /** compensação ao artesão quando o cliente cancela uma encomenda já iniciada (fração do pagamento) */
  cancelCompensation: number;
  /** capacidade da oficina pública: forjas simultâneas no servidor e por artesão */
  workshopSlots: number; perArtisan: number;
  /** valores da Barreira Breve */
  barrier: typeof DEFAULT_BARRIER;
  /** horas sem atividade do artesão para o cliente poder cancelar sem compensação */
  artisanIdleHours: number;
}
export const DEFAULT_PACTO: PactoConfig = { starterLumes: 100, projectStageLumes: 30, discoveryLumes: 50, coreFee: 3, orderFee: 0.05, cancelCompensation: 0.1, workshopSlots: 12, perArtisan: 2, barrier: DEFAULT_BARRIER, artisanIdleHours: 48 };
export function resolvePacto(v: unknown): PactoConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (k: keyof PactoConfig, lo: number, hi: number) => { const x = Number(o[k]); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : (DEFAULT_PACTO[k] as number); };
  const b = (o.barrier && typeof o.barrier === 'object' ? o.barrier : {}) as Record<string, unknown>;
  const bn = (k: keyof typeof DEFAULT_BARRIER, lo: number, hi: number) => { const x = Number(b[k]); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : DEFAULT_BARRIER[k]; };
  return {
    starterLumes: Math.round(n('starterLumes', 0, 10000)), projectStageLumes: Math.round(n('projectStageLumes', 0, 1000)), discoveryLumes: Math.round(n('discoveryLumes', 0, 1000)),
    coreFee: Math.round(n('coreFee', 0, 100)), orderFee: n('orderFee', 0, 0.5), cancelCompensation: n('cancelCompensation', 0, 0.5),
    workshopSlots: Math.round(n('workshopSlots', 1, 500)), perArtisan: Math.round(n('perArtisan', 1, 10)), artisanIdleHours: n('artisanIdleHours', 1, 720),
    barrier: { duration: bn('duration', 0.5, 10), absorb: bn('absorb', 1, 500), cooldown: Math.max(bn('cooldown', 1, 300), bn('duration', 0.5, 10) + 1), spCost: bn('spCost', 0, 100) },
  };
}

/** Quanto de núcleo a forja cobra: Taurina de Fogo traz o Fogo; de Terra, a Terra. */
export function coreCost(essence: Element | readonly Element[] | null, cfg: PactoConfig): { fogo: number; terra: number; total: number } {
  const es = Array.isArray(essence) ? essence : essence ? [essence] : [];
  const fogo = es.includes('fogo') ? 0 : cfg.coreFee, terra = es.includes('terra') ? 0 : cfg.coreFee;
  return { fogo, terra, total: fogo + terra };
}

export type OrderStatus = 'aberta' | 'aceita' | 'em_forja' | 'entregue' | 'cancelada' | 'expirada';
export interface OrderRequirements { minStats: Partial<Record<AttrKey, number>>; maxWeight: ForgeOutcome['weight'] | null; mark: MarkConfig['id'] | null }
export interface WorkOrder {
  id: string; client: string; artisan: string | null; blueprint: string;
  requirements: OrderRequirements;
  /** materiais depositados (reservados) e se o artesão pode trocar por outros da mesma família */
  deposit: { key: string; qty: number }[]; substitutions: boolean;
  payment: number; deadline: string; status: OrderStatus; history: { at: string; what: string; by: string }[];
}
const WEIGHT_RANK = { leve: 0, medio: 1, pesado: 2 } as const;
/** A peça cumpre o contrato? (nunca aceita item inferior) */
export function meetsRequirements(r: OrderRequirements, out: Pick2<ForgeOutcome, 'stats' | 'weight' | 'mark'>): string[] {
  const fails: string[] = [];
  for (const [k, v] of Object.entries(r.minStats)) if ((out.stats[k as AttrKey] ?? 0) < (v as number)) fails.push(`${k} mínimo ${v}`);
  if (r.maxWeight && WEIGHT_RANK[out.weight] > WEIGHT_RANK[r.maxWeight]) fails.push(`peso no máximo ${r.maxWeight}`);
  if (r.mark && out.mark?.id !== r.mark) fails.push('Marca exigida');
  return fails;
}
/**
 * Cancelamento: quem recebe o quê. Antes de aceitar: tudo volta ao cliente. Aceita (não iniciada): tudo volta.
 * Em forja: materiais ainda não consumidos voltam ao cliente; o artesão recebe a compensação; o resto do pagamento
 * volta. Artesão sumido (sem atividade) ou prazo vencido: tudo volta, sem compensação. Entregue: não cancela.
 */
export function cancelSettlement(status: OrderStatus, payment: number, cfg: PactoConfig, artisanAbsent: boolean): { toClient: number; toArtisan: number; materialsBack: boolean } | null {
  if (status === 'entregue' || status === 'cancelada' || status === 'expirada') return null;
  if (status === 'em_forja' && !artisanAbsent) { const comp = Math.floor(payment * cfg.cancelCompensation); return { toClient: payment - comp, toArtisan: comp, materialsBack: true }; }
  return { toClient: payment, toArtisan: 0, materialsBack: true };
}
/** Pagamento ao entregar: a taxa some (sumidouro) e o resto vai ao artesão. */
export const payout = (payment: number, cfg: PactoConfig) => { const fee = Math.ceil(payment * cfg.orderFee); return { artisan: payment - fee, fee }; };

/** Equipamento vira um ItemDef para o sistema de equipar (visual modular por tipo + cor da afinidade). */
export function instanceSlug(id: string) { return 'inst-' + id.replace(/-/g, '').slice(0, 12); }
export const AFFINITY_COLOR: Record<Element, string> = { fogo: '#ff7a3d', agua: '#3fb6ff', terra: '#c8a26b', vento: '#9ff0d8', luz: '#fff1a8', sombra: '#a07cff', gelo: '#bfe9ff', raio: '#ffe14d', natureza: '#7be36b', veneno: '#b45cff' };
export const bandWord = (b: Band) => (bandRank(b) === 2 ? 'alta' : bandRank(b) === 1 ? 'média' : 'baixa');
