/**
 * Constelação Viva — atributos distribuíveis do Companion.
 *
 * Separação (nada aqui muda o resto):
 * - Classe (species.ts): identidade, habilidade de forma, ofício, afinidades e aparência. Não muda com a build.
 * - Essência (identity.ts): manifestação elemental. Não muda com a build.
 * - Atributos (este arquivo): estilo de combate escolhido pelo jogador, redistribuível de graça.
 * - Equipamentos (equipment.ts): % leves por cima.
 * - Ofício (pacto.ts) e coleta (ecos.ts): NÃO leem a build (a qualidade vem de ofício, técnica, ferramenta, materiais).
 * - Vínculo (bond.ts): não é distribuível; aqui só define o estágio de progressão (o orçamento de pontos).
 *
 * Tudo é puro e determinístico: o cliente mostra a prévia, o servidor valida e aplica (função `refuge`, ações build.*).
 *
 * Unidades:
 * - HP, SP, Stamina: pontos de recurso.        - Potência física/mágica: % (100 = base; multiplica o dano).
 * - Defesa física / resistência mágica: valor de armadura → redução = v/(v+100), com teto (nunca invulnerável).
 * - Velocidade de ataque: multiplicador de FREQUÊNCIA (1,2 = 20% mais golpes por segundo; o intervalo vira 1/1,2).
 * - Tempo de conjuração: multiplicador de DURAÇÃO (0,8 = o aviso dura 80%). Não é o inverso do item anterior.
 * - Velocidade de movimento: multiplicador sobre o passo da animação.
 * - Precisão: 0..teto; reduz a evasão do alvo e a variação do dano, e aumenta o ganho nas fraquezas.
 * - Recuperação de SP: SP por segundo.
 *
 * Ordem de aplicação de cada resultado: base (estágio) → + pontos (curva) → × (1 + Σ% de equipamento e árvore)
 * → × Ressonância → × efeitos temporários. Cada camada fica registrada em `sources` para a interface explicar.
 */
import type { Element } from './identity.ts';
import { SPECIES, type AttrKey, type SpeciesKey } from './species.ts';
import type { SkillDef } from './combat/skills.ts';

// ---------------------------------------------------------------------------
// Atributos e configuração de balanceamento
// ---------------------------------------------------------------------------

export type StatKey = 'vitalidade' | 'forca' | 'magia' | 'agilidade' | 'destreza' | 'espirito';
export const STAT_KEYS: StatKey[] = ['vitalidade', 'forca', 'magia', 'agilidade', 'destreza', 'espirito'];

export const STATS: Record<StatKey, { label: string; short: string; icon: string; does: string; doesNot: string }> = {
  vitalidade: { label: 'Vitalidade', short: 'VIT', icon: '❤', does: 'HP máximo e defesa física', doesNot: 'Não aumenta dano nem resistência mágica' },
  forca: { label: 'Força', short: 'FOR', icon: '✊', does: 'Potência física e pressão sobre a guarda', doesNot: 'Não dá velocidade nem HP' },
  magia: { label: 'Magia', short: 'MAG', icon: '✦', does: 'Potência mágica, curas e barreiras mágicas', doesNot: 'Não dá SP nem velocidade' },
  agilidade: { label: 'Agilidade', short: 'AGI', icon: '➶', does: 'Velocidade de ataque e de conjuração; um pouco de movimento', doesNot: 'Não aumenta a potência de cada golpe' },
  destreza: { label: 'Destreza', short: 'DES', icon: '◎', does: 'Precisão, consistência e fraquezas do alvo', doesNot: 'Não substitui Força nem Magia' },
  espirito: { label: 'Espírito', short: 'ESP', icon: '☾', does: 'SP máximo, resistência mágica e recuperação de SP', doesNot: 'Não aumenta o dano mágico diretamente' },
};

export type AttributeAllocation = Record<StatKey, number>;
export type ResonanceKey = 'fluxo-arcano' | 'canal-profundo' | 'bastiao' | 'impacto' | 'precisao' | 'passo-leve';

/** Curva com retorno decrescente: cresce rápido no começo e se aproxima de `cap` sem passar (k = pontos para metade). */
export const soft = (points: number, cap: number, k: number) => (points <= 0 ? 0 : (cap * points) / (points + k));

export interface BalanceConfig {
  /** orçamento: pontos no estágio 1 e por estágio a mais (o estágio é o nível de vínculo, igual para todas as classes) */
  basePoints: number; pointsPerStage: number;
  hp: { base: number; perStage: number; perVit: number };
  sp: { base: number; perStage: number; perEsp: number };
  stamina: { base: number; regen: number; regenDelay: number };
  power: { cap: number; k: number };                // % extra de Força/Magia (soft)
  armor: { base: number; perPoint: number; maxReduction: number }; // defesa física (Vitalidade) e resistência mágica (Espírito)
  attackSpeed: { cap: number; k: number };          // frequência extra máx. (0,5 = +50%)
  castTime: { cap: number; k: number };             // redução máx. da duração (0,35 = −35%)
  move: { cap: number; k: number };                 // parcela da agilidade no movimento (0,08 = +8%)
  precision: { cap: number; k: number };            // 0..cap
  spRegen: { base: number; cap: number; k: number }; // SP/s e bônus máximo em % (1 = +100%)
  /** variação do dano sem Destreza (±) e ganho extra nas fraquezas com precisão máxima */
  variance: number; weakBonus: number;
  /** força da Ressonância: s = m/(m+k), m = o menor dos dois atributos ligados */
  resonanceK: number;
  /** afinidade da classe: redução no custo de SP das habilidades da essência afim; Linhagem sobe para `lineageAffinity` */
  classAffinity: number; lineageAffinity: number;
  /** reduções de custo somadas nunca passam disto */
  maxCostReduction: number;
  /** guarda existente (E): corte de dano e gasto de stamina por segundo; esquiva = pulo (stamina) */
  guard: { cut: number; drain: number; move: number }; dodgeCost: number;
  /** segundos sem combate para a troca de build ser aplicada (servidor) */
  combatCooldown: number;
}

export const DEFAULT_BALANCE: BalanceConfig = {
  basePoints: 10, pointsPerStage: 3,
  hp: { base: 100, perStage: 5, perVit: 10 },
  sp: { base: 60, perStage: 3, perEsp: 5 },
  stamina: { base: 100, regen: 28, regenDelay: 0.7 },
  power: { cap: 160, k: 60 },
  armor: { base: 20, perPoint: 5, maxReduction: 0.7 },
  attackSpeed: { cap: 0.5, k: 50 },
  castTime: { cap: 0.35, k: 50 },
  move: { cap: 0.08, k: 40 },
  precision: { cap: 0.6, k: 40 },
  spRegen: { base: 3, cap: 1, k: 50 },
  variance: 0.15, weakBonus: 0.25,
  resonanceK: 15,
  classAffinity: 0.1, lineageAffinity: 0.2,
  maxCostReduction: 0.4,
  guard: { cut: 0.75, drain: 14, move: 0.4 }, dodgeCost: 15,
  combatCooldown: 8,
};

/** Junta a configuração do servidor (`game_config.values.constellation`) com os padrões, limitando valores absurdos. */
export function resolveBalance(raw: unknown): BalanceConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = structuredClone(DEFAULT_BALANCE) as unknown as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : undefined; };
  for (const [k, v] of Object.entries(r)) {
    const cur = out[k];
    if (typeof cur === 'number') { const x = num(v, 0, 10000); if (x !== undefined) out[k] = x; }
    else if (cur && typeof cur === 'object' && v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) { if (typeof (cur as Record<string, unknown>)[kk] === 'number') { const x = num(vv, 0, 10000); if (x !== undefined) (cur as Record<string, number>)[kk] = x; } }
  }
  const b = out as unknown as BalanceConfig;
  b.armor.maxReduction = Math.min(0.9, b.armor.maxReduction);
  b.maxCostReduction = Math.min(0.8, b.maxCostReduction);
  b.basePoints = Math.round(b.basePoints); b.pointsPerStage = Math.round(b.pointsPerStage);
  return b;
}

// ---------------------------------------------------------------------------
// Orçamento e validação
// ---------------------------------------------------------------------------

/** Estágio de progressão: hoje é o nível de vínculo (o mesmo para todas as classes). */
export const progressionStage = (bondLevel: number) => Math.max(1, Math.floor(bondLevel) || 1);

/** Pontos distribuíveis no estágio. Companions no mesmo estágio têm o mesmo orçamento. */
export function budget(stage: number, cfg: BalanceConfig = DEFAULT_BALANCE): number {
  return cfg.basePoints + cfg.pointsPerStage * (progressionStage(stage) - 1);
}

export const emptyAllocation = (): AttributeAllocation => ({ vitalidade: 0, forca: 0, magia: 0, agilidade: 0, destreza: 0, espirito: 0 });
export const usedPoints = (a: AttributeAllocation) => STAT_KEYS.reduce((t, k) => t + a[k], 0);

/** Lê uma distribuição vinda de fora (cliente, banco). Devolve null se algum valor for inválido. */
export function parseAllocation(input: unknown): AttributeAllocation | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const out = emptyAllocation();
  for (const k of Object.keys(o)) if (!STAT_KEYS.includes(k as StatKey)) return null;
  for (const k of STAT_KEYS) {
    const v = o[k] ?? 0;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9999) return null;
    out[k] = v;
  }
  return out;
}

export type AllocationCheck = { ok: true; used: number; free: number } | { ok: false; reason: string };
export function checkAllocation(a: AttributeAllocation | null, stage: number, cfg: BalanceConfig = DEFAULT_BALANCE): AllocationCheck {
  if (!a) return { ok: false, reason: 'Valores inválidos: use números inteiros a partir de zero.' };
  const total = budget(stage, cfg), used = usedPoints(a);
  if (used > total) return { ok: false, reason: `Pontos demais: ${used} de ${total}.` };
  return { ok: true, used, free: total - used };
}

// ---------------------------------------------------------------------------
// Ressonâncias
// ---------------------------------------------------------------------------

export interface ResonanceDefinition {
  key: ResonanceKey;
  name: string;
  stats: [StatKey, StatKey] | [StatKey, StatKey, StatKey]; // Precisão: Destreza + (Força ou Magia, o maior)
  benefit: string;
  cost: string;
  /** o que a Ressonância modifica (para não valer onde não faz sentido) */
  affects: string;
  available: boolean;     // funcional nesta entrega
  why?: string;           // por que ainda não
  /** efeitos máximos (com força 1); a força real é gradual */
  max: Record<string, number>;
}

export const RESONANCES: Record<ResonanceKey, ResonanceDefinition> = {
  'fluxo-arcano': { key: 'fluxo-arcano', name: 'Fluxo Arcano', stats: ['magia', 'agilidade'], benefit: 'Conjura mais rápido', cost: 'Cada lançamento tem menos potência',
    affects: 'Só habilidades mágicas com preparação (aviso > 0)', available: true, max: { cast: 0.25, power: 0.15 } },
  'canal-profundo': { key: 'canal-profundo', name: 'Canal Profundo', stats: ['magia', 'espirito'], benefit: 'Gasta menos SP', cost: 'A preparação demora mais',
    affects: 'Só habilidades mágicas que custam SP', available: true, max: { cost: 0.2, cast: 0.3 } },
  bastiao: { key: 'bastiao', name: 'Bastião', stats: ['vitalidade', 'espirito'], benefit: 'Mais proteção contra magia enquanto defende (E)', cost: 'Anda mais devagar defendendo',
    affects: 'Só enquanto segura a defesa', available: true, max: { guardMagic: 0.3, guardMove: 0.25 } },
  impacto: { key: 'impacto', name: 'Impacto', stats: ['forca', 'vitalidade'], benefit: 'Golpes carregados pressionam mais a guarda', cost: 'Recuperação mais longa depois deles',
    affects: 'Golpes carregados físicos', available: false, why: 'Os inimigos ainda não têm guarda para pressionar.', max: { pressure: 0.3, recovery: 0.25 } },
  precisao: { key: 'precisao', name: 'Precisão', stats: ['destreza', 'forca', 'magia'], benefit: 'Aproveita mais as fraquezas', cost: 'Menos dano fora delas',
    affects: 'Todos os acertos; a escala segue a modalidade da habilidade', available: false, why: 'Chega na próxima entrega, junto das fraquezas nas criaturas.', max: { weak: 0.3, outside: 0.12 } },
  'passo-leve': { key: 'passo-leve', name: 'Passo Leve', stats: ['agilidade', 'destreza'], benefit: 'Esquivas mais econômicas', cost: 'Menos proteção durante o deslocamento',
    affects: 'Só a esquiva', available: false, why: 'A esquiva própria ainda não existe (hoje é o pulo).', max: { dodgeCost: 0.35, exposed: 0.15 } },
};
export const RESONANCE_KEYS = Object.keys(RESONANCES) as ResonanceKey[];

/** Força gradual da Ressonância (0..1) pelo menor dos atributos ligados (Precisão: Destreza e o maior entre Força e Magia). */
export function resonanceStrength(key: ResonanceKey | null, a: AttributeAllocation, cfg: BalanceConfig = DEFAULT_BALANCE): number {
  if (!key) return 0;
  const def = RESONANCES[key];
  const m = key === 'precisao' ? Math.min(a.destreza, Math.max(a.forca, a.magia)) : Math.min(...def.stats.map((s) => a[s]));
  return m <= 0 ? 0 : m / (m + cfg.resonanceK);
}

export function parseResonance(v: unknown): ResonanceKey | null | undefined {
  if (v === null || v === '' || v === undefined) return null;
  return typeof v === 'string' && RESONANCES[v as ResonanceKey]?.available ? (v as ResonanceKey) : undefined;
}

// ---------------------------------------------------------------------------
// Resultados calculados
// ---------------------------------------------------------------------------

export type Modality = 'fisica' | 'magica';
export interface Source { label: string; value: number }
export interface DerivedStats {
  hpMax: number; spMax: number; stMax: number;
  physPower: number; magPower: number;          // %
  physDefense: number; magResist: number;       // armadura
  physReduction: number; magReduction: number;  // 0..teto
  attackSpeed: number;                          // × frequência
  castTime: number;                             // × duração
  moveSpeed: number;                            // × passo (já com a classe)
  precision: number;                            // 0..teto
  spRegen: number;                              // SP/s
  stRegen: number;
  guard: { cut: number; magicCut: number; drain: number; move: number };
  dodgeCost: number;
  resonance: { key: ResonanceKey | null; strength: number };
  sources: Partial<Record<keyof DerivedStats, Source[]>>;
}

/** Mapeamento dos bônus antigos (% da árvore e dos equipamentos, chaves vida/energia/poder/defesa/agilidade/sintonia). */
export const LEGACY_MAP: Record<AttrKey, { to: (keyof DerivedStats)[]; note: string }> = {
  vida: { to: ['hpMax'], note: 'Vida → % de HP máximo' },
  energia: { to: ['spMax'], note: 'Energia → % de SP máximo' },
  poder: { to: ['physPower', 'magPower'], note: 'Poder → % das duas potências (a habilidade usa a da sua modalidade)' },
  defesa: { to: ['physDefense'], note: 'Defesa → % de defesa física' },
  agilidade: { to: ['attackSpeed'], note: 'Agilidade → % de velocidade de ataque (frequência)' },
  sintonia: { to: ['magResist', 'spRegen'], note: 'Sintonia → % de resistência mágica e de recuperação de SP' },
};

export interface DeriveInput {
  alloc: AttributeAllocation;
  stage: number;
  species: SpeciesKey | null;
  resonance?: ResonanceKey | null;
  /** % antigos vindos da árvore e do equipamento */
  tree?: Partial<Record<AttrKey, number>>;
  equipment?: Partial<Record<AttrKey, number>>;
  cfg?: BalanceConfig;
}

const r1 = (x: number) => Math.round(x * 10) / 10, r2 = (x: number) => Math.round(x * 100) / 100, r3 = (x: number) => Math.round(x * 1000) / 1000;

export function deriveStats(inp: DeriveInput): DerivedStats {
  const cfg = inp.cfg ?? DEFAULT_BALANCE, a = inp.alloc, stage = progressionStage(inp.stage);
  const sources: DerivedStats['sources'] = {};
  const pct = (key: keyof DerivedStats) => {
    let p = 0;
    for (const [layer, label] of [[inp.tree, 'árvore'], [inp.equipment, 'equipamento']] as const) for (const [k, v] of Object.entries(layer ?? {})) {
      if (!v || !LEGACY_MAP[k as AttrKey]?.to.includes(key)) continue;
      p += v as number; (sources[key] ??= []).push({ label: `${label} (${k})`, value: v as number });
    }
    return p / 100;
  };
  const note = (key: keyof DerivedStats, label: string, value: number) => { if (value) (sources[key] ??= []).push({ label, value: r2(value) }); };

  // HP
  const hpBase = cfg.hp.base + cfg.hp.perStage * (stage - 1), hpPts = cfg.hp.perVit * a.vitalidade;
  note('hpMax', 'base do estágio', hpBase); note('hpMax', 'Vitalidade', hpPts);
  const hpMax = Math.round((hpBase + hpPts) * (1 + pct('hpMax')));
  // SP
  const spBase = cfg.sp.base + cfg.sp.perStage * (stage - 1), spPts = cfg.sp.perEsp * a.espirito;
  note('spMax', 'base do estágio', spBase); note('spMax', 'Espírito', spPts);
  const spMax = Math.round((spBase + spPts) * (1 + pct('spMax')));
  // Stamina: base própria (não vem de atributo)
  const stMax = cfg.stamina.base; note('stMax', 'base própria', stMax);
  // potências
  const pf = soft(a.forca, cfg.power.cap, cfg.power.k), pm = soft(a.magia, cfg.power.cap, cfg.power.k);
  note('physPower', 'base', 100); note('physPower', 'Força', pf); note('magPower', 'base', 100); note('magPower', 'Magia', pm);
  const physPower = r1((100 + pf) * (1 + pct('physPower')));
  const magPowerRaw = (100 + pm) * (1 + pct('magPower'));
  // defesas (redução com teto)
  const pd = (cfg.armor.base + cfg.armor.perPoint * a.vitalidade) * (1 + pct('physDefense'));
  const md = (cfg.armor.base + cfg.armor.perPoint * a.espirito) * (1 + pct('magResist'));
  note('physDefense', 'base', cfg.armor.base); note('physDefense', 'Vitalidade', cfg.armor.perPoint * a.vitalidade);
  note('magResist', 'base', cfg.armor.base); note('magResist', 'Espírito', cfg.armor.perPoint * a.espirito);
  const red = (v: number) => Math.min(cfg.armor.maxReduction, v / (v + 100));
  // velocidades
  const as = soft(a.agilidade, cfg.attackSpeed.cap, cfg.attackSpeed.k);
  note('attackSpeed', 'base', 1); note('attackSpeed', 'Agilidade', as);
  const attackSpeed = r3(Math.min(1 + cfg.attackSpeed.cap * 1.2, (1 + as) * (1 + pct('attackSpeed'))));
  const ct = soft(a.agilidade, cfg.castTime.cap, cfg.castTime.k);
  note('castTime', 'base', 1); note('castTime', 'Agilidade', -ct);
  let castTime = 1 - ct;
  const cls = inp.species ? SPECIES[inp.species].speed : 1, mv = soft(a.agilidade, cfg.move.cap, cfg.move.k);
  note('moveSpeed', 'classe', cls); note('moveSpeed', 'Agilidade', mv);
  // precisão e SP
  const precision = r3(soft(a.destreza, cfg.precision.cap, cfg.precision.k)); note('precision', 'Destreza', precision);
  const rg = soft(a.espirito, cfg.spRegen.cap, cfg.spRegen.k);
  note('spRegen', 'base', cfg.spRegen.base); note('spRegen', 'Espírito', cfg.spRegen.base * rg);
  const spRegen = r2(cfg.spRegen.base * (1 + rg) * (1 + pct('spRegen')));
  // Ressonância
  const rkey = inp.resonance && RESONANCES[inp.resonance]?.available ? inp.resonance : null;
  const s = resonanceStrength(rkey, a, cfg);
  let magPower = magPowerRaw, guardMagic = 0, guardMove = cfg.guard.move;
  if (rkey === 'fluxo-arcano') { castTime *= 1 - RESONANCES[rkey].max.cast * s; note('castTime', 'Fluxo Arcano', -RESONANCES[rkey].max.cast * s); }
  if (rkey === 'bastiao') { guardMagic = RESONANCES[rkey].max.guardMagic * s; guardMove *= 1 - RESONANCES[rkey].max.guardMove * s; }
  // Fluxo Arcano reduz a potência POR LANÇAMENTO das magias com preparação (aplicado em skillEffect, não aqui)
  return {
    hpMax, spMax, stMax,
    physPower, magPower: r1(magPower),
    physDefense: r1(pd), magResist: r1(md), physReduction: r3(red(pd)), magReduction: r3(red(md)),
    attackSpeed, castTime: r3(Math.max(0.4, castTime)), moveSpeed: r3(cls * (1 + mv)),
    precision, spRegen, stRegen: cfg.stamina.regen,
    guard: { cut: cfg.guard.cut, magicCut: r3(Math.min(0.95, cfg.guard.cut + (1 - cfg.guard.cut) * guardMagic)), drain: cfg.guard.drain, move: r3(guardMove) },
    dodgeCost: cfg.dodgeCost,
    resonance: { key: rkey, strength: r3(s) },
    sources,
  };
}

// ---------------------------------------------------------------------------
// Modalidade das habilidades, custo de SP e dano
// ---------------------------------------------------------------------------

export interface DamageSplit { fisica: number; magica: number }

/** Modalidade de uma habilidade: o campo explícito da Forja vence; sem ele, regra pela forma. Híbridas dividem 50/50. */
export function skillModality(sk: Pick<SkillDef, 'slug' | 'slot' | 'shape' | 'essence'> & { modality?: 'fisica' | 'magica' | 'hibrida' }): DamageSplit {
  const m = sk.modality ?? inferModality(sk);
  return m === 'fisica' ? { fisica: 1, magica: 0 } : m === 'magica' ? { fisica: 0, magica: 1 } : { fisica: 0.5, magica: 0.5 };
}
export function inferModality(sk: Pick<SkillDef, 'slug' | 'slot' | 'shape' | 'essence'>): 'fisica' | 'magica' | 'hibrida' {
  if (sk.slot === 'supreme') return 'hibrida';
  if (sk.slug === 'guarda') return 'magica';                       // escudo feérico
  if (sk.slot === 'basic') return sk.shape === 'projectile' ? 'magica' : 'fisica';
  if (sk.slot === 'form') return 'fisica';                         // chicote, rasante, bote, investida
  return sk.shape === 'melee' || sk.shape === 'dash' || sk.shape === 'leap' ? 'fisica' : 'magica';
}

/** Ataque básico: armas mágicas (cajado, varinha, orbe…) usam Magia; o resto, Força. */
export const weaponModality = (ranged: string | undefined): Modality => (ranged === 'magic' ? 'magica' : 'fisica');

/**
 * Custo de SP: afinidade da classe (−10%, ou −20% com Linhagem) para a essência afim, Canal Profundo para magias.
 * Reduções se somam e têm teto (maxCostReduction); arredonda para o inteiro mais próximo; nunca abaixo de 1 se a
 * habilidade custava algo. Afinidade não mexe em dano, defesa, velocidade nem produção.
 */
export function skillCost(sk: Pick<SkillDef, 'energy' | 'essence' | 'slug' | 'slot' | 'shape'>, ctx: { species: SpeciesKey | null; lineage?: boolean; alloc: AttributeAllocation; resonance: ResonanceKey | null; cfg?: BalanceConfig }) {
  const cfg = ctx.cfg ?? DEFAULT_BALANCE;
  if (sk.energy <= 0) return { cost: 0, parts: [] as Source[] };
  const parts: Source[] = [];
  let cut = 0;
  if (ctx.species && sk.essence && SPECIES[ctx.species].affinities.includes(sk.essence)) { const v = ctx.lineage ? cfg.lineageAffinity : cfg.classAffinity; cut += v; parts.push({ label: 'afinidade da classe', value: -v }); }
  if (ctx.resonance === 'canal-profundo' && skillModality(sk).magica > 0) { const v = RESONANCES['canal-profundo'].max.cost * resonanceStrength('canal-profundo', ctx.alloc, cfg); cut += v; parts.push({ label: 'Canal Profundo', value: -r3(v) }); }
  cut = Math.min(cfg.maxCostReduction, cut);
  return { cost: Math.max(1, Math.round(sk.energy * (1 - cut))), parts };
}

/** Efeito de uma habilidade lançada agora: custo, preparação e potência por componente. Congelado no lançamento. */
export function skillEffect(sk: SkillDef & { modality?: 'fisica' | 'magica' | 'hibrida' }, d: DerivedStats, ctx: { species: SpeciesKey | null; lineage?: boolean; alloc: AttributeAllocation; cfg?: BalanceConfig }) {
  const cfg = ctx.cfg ?? DEFAULT_BALANCE;
  const split = skillModality(sk);
  const magical = split.magica > 0;
  const res = d.resonance.key, s = d.resonance.strength;
  let windup = sk.windup, powerMul = 1;
  // conjuração: só magias com preparação; golpes instantâneos não mudam
  if (magical && sk.windup > 0) {
    windup = sk.windup * d.castTime;
    if (res === 'fluxo-arcano') powerMul *= 1 - RESONANCES['fluxo-arcano'].max.power * s;
    if (res === 'canal-profundo') windup *= 1 + RESONANCES['canal-profundo'].max.cast * s;
  }
  const { cost } = skillCost(sk, { ...ctx, resonance: res, cfg });
  const phys = (sk.power * split.fisica * d.physPower) / 100, mag = (sk.power * split.magica * d.magPower) / 100;
  const heal = (sk.heal * d.magPower) / 100;                        // cura usa a escala mágica
  return { cost, windup: r2(windup), damage: { fisica: phys * powerMul, magica: mag * powerMul }, heal: Math.round(heal * powerMul), split };
}

export interface HitInfo { split: DamageSplit; essence: Element | null; precision: number }
export interface Defender { essence: Element | null; physDefense: number; magResist?: number | null; evasion?: number }

/**
 * Resolve um acerto: cada componente passa pela SUA defesa (física → defesa física, mágica → resistência mágica);
 * nunca as duas no mesmo componente. Afinidade elemental multiplica; na fraqueza, a precisão rende um bônus.
 * `roll` em [0,1) (PRNG da luta) dá a variação, que a precisão estreita. Criaturas sem resistência mágica própria
 * usam a defesa (pendência de balanceamento, ver docs/CONSTELACAO_VIVA.md).
 */
export function resolveHit(damage: number, info: HitInfo, def: Defender, affinityMul: number, roll = 0.5, cfg: BalanceConfig = DEFAULT_BALANCE) {
  const mit = (x: number, v: number) => (x <= 0 ? 0 : (x * 100) / (100 + Math.max(0, v)));
  const total = info.split.fisica + info.split.magica || 1;
  const phys = mit((damage * info.split.fisica) / total, def.physDefense);
  const mag = mit((damage * info.split.magica) / total, def.magResist ?? def.physDefense);
  const spread = cfg.variance * (1 - Math.min(1, info.precision / Math.max(0.01, cfg.precision.cap)));
  const vary = 1 + (Math.min(0.999, Math.max(0, roll)) * 2 - 1) * spread;
  const weak = affinityMul > 1 ? 1 + cfg.weakBonus * (info.precision / Math.max(0.01, cfg.precision.cap)) : 1;
  return Math.max(1, Math.round((phys + mag) * affinityMul * weak * vary));
}

/** Dano recebido pelo Companion: o componente físico usa a defesa física; o mágico, a resistência (e o Bastião na guarda). */
export function incomingDamage(damage: number, modality: Modality, d: DerivedStats, guarding: boolean) {
  const red = modality === 'fisica' ? d.physReduction : d.magReduction;
  const guardCut = guarding ? (modality === 'magica' ? d.guard.magicCut : d.guard.cut) : 0;
  return Math.max(1, Math.round(damage * (1 - red) * (1 - guardCut)));
}

// ---------------------------------------------------------------------------
// Troca de build sem abuso
// ---------------------------------------------------------------------------

/**
 * Recurso depois da troca: mantém a proporção, mas nunca aumenta o valor absoluto.
 * novo = min(atual, novoMáx × atual / máxAnterior), arredondado para baixo; zero continua zero.
 */
export function rescaleResource(current: number, prevMax: number, nextMax: number): number {
  if (!(current > 0) || !(prevMax > 0) || !(nextMax > 0)) return 0;
  return Math.max(0, Math.floor(Math.min(current, (nextMax * current) / prevMax) * 1000) / 1000);
}

export interface ResourceState { hp: number; hpMax: number; sp: number; spMax: number; st: number; stMax: number; down: boolean }
/** Aplica os máximos novos: não cura, não recupera SP nem stamina, quem está desmaiado continua desmaiado. */
export function applyBuildToResources(r: ResourceState, d: Pick<DerivedStats, 'hpMax' | 'spMax' | 'stMax'>): ResourceState {
  return {
    hp: r.down ? Math.min(r.hp, d.hpMax) : rescaleResource(r.hp, r.hpMax, d.hpMax), hpMax: d.hpMax,
    sp: rescaleResource(r.sp, r.spMax, d.spMax), spMax: d.spMax,
    st: rescaleResource(r.st, r.stMax, d.stMax), stMax: d.stMax,
    down: r.down,
  };
}

export interface BuildProfile { id: string; name: string; alloc: AttributeAllocation; resonance: ResonanceKey | null }
export interface BuildState {
  version: number;
  active: { alloc: AttributeAllocation; resonance: ResonanceKey | null };
  profiles: BuildProfile[];
  pending: { alloc: AttributeAllocation; resonance: ResonanceKey | null; at: string; reason: string } | null;
  migrated?: unknown;
}
export interface BuildChangeRequest { request: string; version: number; alloc: unknown; resonance: unknown }

export const MAX_PROFILES = 8;
export const PROFILE_NAME = /^[\p{L}\p{N} '\-_.!?]{1,24}$/u;

/** Motivos que impedem aplicar agora (o servidor confere; o cliente mostra antes). */
export interface ApplyContext { inCombat: boolean; gathering: boolean; crafting: boolean; locked?: boolean }
export function applyBlockers(ctx: ApplyContext): string[] {
  const out: string[] = [];
  if (ctx.inCombat) out.push('Em combate: espere alguns segundos sem lutar.');
  if (ctx.gathering) out.push('Coletando: termine ou cancele a coleta.');
  if (ctx.crafting) out.push('Há um trabalho na oficina em andamento.');
  if (ctx.locked) out.push('Bloqueado numa rodada competitiva.');
  return out;
}

// ---------------------------------------------------------------------------
// Sugestões por classe, migração e perfis de demonstração
// ---------------------------------------------------------------------------

/** Pesos sugeridos (não são bônus): viram uma distribuição inicial editável. */
export const CLASS_SUGGESTION: Record<SpeciesKey, Partial<Record<StatKey, number>>> = {
  serpente: { magia: 4, espirito: 3, vitalidade: 2, agilidade: 1 },
  passaro: { agilidade: 4, espirito: 3, destreza: 2, vitalidade: 1 },
  felino: { agilidade: 4, destreza: 3, forca: 2, vitalidade: 1 },
  touro: { vitalidade: 4, forca: 3, espirito: 2, destreza: 1 },
  mistica: { magia: 4, espirito: 3, agilidade: 2, vitalidade: 1 },
};

/** Distribui um orçamento por pesos (maior resto vai primeiro; empate na ordem de STAT_KEYS). Sempre soma o orçamento. */
export function distribute(points: number, weights: Partial<Record<StatKey, number>>): AttributeAllocation {
  const out = emptyAllocation();
  const keys = STAT_KEYS.filter((k) => (weights[k] ?? 0) > 0);
  const total = keys.reduce((t, k) => t + (weights[k] ?? 0), 0);
  if (!total || points <= 0) return out;
  const rest: [StatKey, number][] = [];
  let given = 0;
  for (const k of keys) { const exact = (points * (weights[k] ?? 0)) / total; out[k] = Math.floor(exact); given += out[k]; rest.push([k, exact - out[k]]); }
  rest.sort((x, y) => y[1] - x[1] || STAT_KEYS.indexOf(x[0]) - STAT_KEYS.indexOf(y[0]));
  for (let i = 0; given < points; i++, given++) out[rest[i % rest.length][0]]++;
  return out;
}

export const suggestedAllocation = (species: SpeciesKey | null, stage: number, cfg: BalanceConfig = DEFAULT_BALANCE) =>
  distribute(budget(stage, cfg), species ? CLASS_SUGGESTION[species] : { vitalidade: 1, forca: 1, magia: 1, agilidade: 1, destreza: 1, espirito: 1 });

/**
 * Migração: os antigos bônus raciais fixos (SPECIES.attrs, ±10% por ponto em vida/energia/poder/defesa/agilidade/
 * sintonia) deixam de valer; viram só a sugestão inicial. Nada é apagado: a tendência antiga fica registrada.
 */
export function migrateBuild(species: SpeciesKey | null, stage: number, cfg: BalanceConfig = DEFAULT_BALANCE): BuildState {
  return {
    version: 1,
    active: { alloc: suggestedAllocation(species, stage, cfg), resonance: null },
    profiles: [],
    pending: null,
    migrated: { from: 'species-attrs-v1', species, legacyTendency: species ? SPECIES[species].attrs : {}, at: 'migração Constelação Viva v1' },
  };
}

/** Três perfis de Dracônico para demonstração (proporções; o orçamento real vem do estágio). Não é balanceamento final. */
export const DEMO_PROFILES: { name: string; weights: Partial<Record<StatKey, number>>; resonance: ResonanceKey | null; note: string }[] = [
  { name: 'Conjurador', weights: { magia: 5, agilidade: 3, espirito: 3, vitalidade: 1 }, resonance: 'fluxo-arcano', note: 'Conjura rápido e bate de longe; frágil contra golpes físicos.' },
  { name: 'Guardião', weights: { vitalidade: 5, espirito: 4, magia: 2, forca: 1 }, resonance: 'bastiao', note: 'Aguenta muito e segura magia na guarda; dano baixo.' },
  { name: 'Combatente físico', weights: { forca: 5, vitalidade: 3, agilidade: 2, destreza: 2 }, resonance: null, note: 'Golpes e habilidade de forma fortes; magias fracas e pouco SP.' },
];
export const demoProfiles = (stage: number, cfg: BalanceConfig = DEFAULT_BALANCE): BuildProfile[] =>
  DEMO_PROFILES.map((p, i) => ({ id: 'demo-' + (i + 1), name: p.name, alloc: distribute(budget(stage, cfg), p.weights), resonance: p.resonance }));

// ---------------------------------------------------------------------------
// Comparação de builds (testes e a explicação do Companion)
// ---------------------------------------------------------------------------

export interface BuildReport {
  sustainedPhys: number; sustainedMag: number; burst: number;
  ehpPhys: number; ehpMag: number; spPerMin: number; mobility: number; healPerCast: number;
}

/** Números para comparar builds: dano por segundo sustentado (golpe + magia), janela curta, sobrevivência efetiva. */
export function buildReport(d: DerivedStats): BuildReport {
  const basicPhys = 24 * (d.physPower / 100) * d.attackSpeed * 1.3;          // golpe desarmado (cadência 1,3)
  const spell = 50 * (d.magPower / 100) * (d.resonance.key === 'fluxo-arcano' ? 1 - RESONANCES['fluxo-arcano'].max.power * d.resonance.strength : 1);
  const spellsPerSec = Math.min(1 / (4 * d.castTime ** 0.25), d.spRegen / 20);  // limitado pela recarga e pelo SP
  const burst = 70 * (d.physPower / 100) + 2 * spell;                             // forma + duas magias
  return {
    sustainedPhys: r1(basicPhys), sustainedMag: r1(spell * spellsPerSec), burst: r1(burst),
    ehpPhys: Math.round(d.hpMax / (1 - d.physReduction)), ehpMag: Math.round(d.hpMax / (1 - d.magReduction)),
    spPerMin: Math.round(d.spRegen * 60), mobility: r2(d.moveSpeed), healPerCast: Math.round(50 * (d.magPower / 100)),
  };
}

/** Frase curta da explicação do Companion, só a partir dos números reais (sem IA). */
export function explainBuild(prev: DerivedStats, next: DerivedStats, he = false): string[] {
  const out: string[] = [];
  const diff = (a: number, b: number) => (a === 0 ? 0 : (b - a) / a);
  const p = buildReport(prev), n = buildReport(next);
  const say = (cond: boolean, s: string) => { if (cond) out.push(s); };
  say(diff(p.ehpPhys, n.ehpPhys) > 0.08, `Vou aguentar mais pancada: HP efetivo físico ${p.ehpPhys} → ${n.ehpPhys}.`);
  say(diff(p.ehpPhys, n.ehpPhys) < -0.08, `Fico mais ${he ? 'frágil' : 'frágil'} contra golpes: HP efetivo físico ${p.ehpPhys} → ${n.ehpPhys}.`);
  say(diff(p.ehpMag, n.ehpMag) > 0.08, `Magia vai me machucar menos: HP efetivo mágico ${p.ehpMag} → ${n.ehpMag}.`);
  say(diff(p.ehpMag, n.ehpMag) < -0.08, `Vou sentir mais a magia: HP efetivo mágico ${p.ehpMag} → ${n.ehpMag}.`);
  say(diff(prev.physPower, next.physPower) > 0.05, `Meus golpes ficam mais fortes (${prev.physPower}% → ${next.physPower}%).`);
  say(diff(prev.physPower, next.physPower) < -0.05, `Meus golpes perdem força (${prev.physPower}% → ${next.physPower}%).`);
  say(diff(prev.magPower, next.magPower) > 0.05, `Minha magia cresce (${prev.magPower}% → ${next.magPower}%).`);
  say(diff(prev.magPower, next.magPower) < -0.05, `Minha magia enfraquece (${prev.magPower}% → ${next.magPower}%).`);
  say(diff(p.spPerMin, n.spPerMin) > 0.08 || next.spMax > prev.spMax * 1.08, `Mais fôlego de SP: ${prev.spMax} SP e ${p.spPerMin}/min → ${next.spMax} SP e ${n.spPerMin}/min.`);
  say(next.castTime < prev.castTime - 0.03, `Conjuro mais rápido (preparação ×${prev.castTime} → ×${next.castTime}).`);
  say(next.attackSpeed > prev.attackSpeed + 0.03, `Ataco com mais frequência (×${prev.attackSpeed} → ×${next.attackSpeed}).`);
  if (!out.length) out.push('Quase nada muda no jeito de eu lutar.');
  return out.slice(0, 4);
}
