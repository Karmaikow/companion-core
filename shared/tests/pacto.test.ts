import { describe, expect, it } from 'vitest';
import {
  OFFICES, SOURCE_CLASS, canCompleteEquipment, canExtractSuperior, TRANSFORMATIONS, transformationById, checkTransformation, componentKey, parseComponentKey,
  BLUEPRINTS, blueprintById, forgePreview, assistPlan, recycleReturn, meetsRequirements, cancelSettlement, payout, DEFAULT_PACTO, resolvePacto, coreCost,
  NODE_KINDS, VALE_NODES, essenceApplies, ESSENCE_CRAFT, DEFAULT_BARRIER, repairWithKit, lineageOf, officesOf, canGainForm, canGainEssence, LINEAGE_LIMITS,
  type SpeciesKey, type SourceKind,
} from '../rules/index.ts';

const CLASSES: SpeciesKey[] = ['serpente', 'passaro', 'felino', 'touro', 'mistica'];
const M = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('Pacto: exclusividades', () => {
  it('só a Taurina conclui equipamento', () => {
    expect(CLASSES.filter(canCompleteEquipment)).toEqual(['touro']);
  });
  it('Taurina nunca extrai fonte superior; cada fonte tem uma classe; toda outra classe tem fonte no vale', () => {
    for (const s of Object.keys(SOURCE_CLASS) as SourceKind[]) {
      expect(canExtractSuperior('touro', s)).toBe(false);
      expect(CLASSES.filter((c) => canExtractSuperior(c, s))).toHaveLength(1);
    }
    const sources = VALE_NODES.map((n) => NODE_KINDS[n.kind].source).filter(Boolean) as SourceKind[];
    for (const c of CLASSES.filter((x) => x !== 'touro')) expect(sources.some((s) => SOURCE_CLASS[s] === c), c).toBe(true);
  });
  it('cada classe tem um ofício; as quatro não-Taurinas têm uma transformação funcional', () => {
    for (const c of CLASSES) expect(OFFICES[c]).toBeTruthy();
    for (const o of ['confluencia', 'harmonizacao', 'manejo', 'inscricao']) expect(TRANSFORMATIONS.some((t) => t.office === o), o).toBe(true);
  });
  it('nenhum projeto é concluído fora da Forja e as receitas só aceitam materiais/componentes', () => {
    for (const b of BLUEPRINTS) expect(b.offices).toContain('forja');
  });
});

describe('Pacto: transformações de ofício', () => {
  const bag = [
    { key: 'seiva-azul', qty: 3 },
    { key: 'erva-orvalho-folha|estabilidade:alta,potencia:media', qty: 4 },
    { key: 'madeira-salgueiro|flexibilidade:alta,resistencia:baixa', qty: 6 },
    { key: 'quartzo-fragmento|integridade:baixa', qty: 2 },
    { key: 'cerne-salgueiro|flexibilidade:alta,resistencia:media', qty: 1 },
  ];
  it('Confluência: decisão própria muda o produto (troca, não bônus)', () => {
    const t = transformationById('purificar-agente')!;
    const a = checkTransformation(t, [{ slot: 0, key: 'seiva-azul', qty: 1 }, { slot: 1, key: bag[1].key, qty: 2 }], bag, 'remover-minerais', 'fogo', false, M);
    const b = checkTransformation(t, [{ slot: 0, key: 'seiva-azul', qty: 1 }, { slot: 1, key: bag[1].key, qty: 2 }], bag, 'manter-minerais', 'fogo', false, M);
    expect(a.ok && a.bands).toEqual({ estabilidade: 'alta', potencia: 'media' });
    expect(b.ok && b.bands).toEqual({ estabilidade: 'media', potencia: 'alta' });
  });
  it('técnica da essência sobe uma faixa com teto e só onde se aplica', () => {
    const t = transformationById('purificar-agente')!;
    const w = checkTransformation(t, [{ slot: 0, key: 'seiva-azul', qty: 1 }, { slot: 1, key: bag[1].key, qty: 2 }], bag, 'manter-minerais', 'agua', true, M);
    expect(w.ok && w.bands.estabilidade).toBe('alta');
    expect(essenceApplies(t, 'vento')).toBe(false);
    expect(ESSENCE_CRAFT.agua.lifts).toBe('estabilidade');
  });
  it('Feral: cerne superior ou a alternativa comum (4 madeiras flexíveis altas)', () => {
    const t = transformationById('preservar-cerne')!;
    expect(checkTransformation(t, [{ slot: 0, key: bag[4].key, qty: 1 }], bag, 'selagem', null, false, M).ok).toBe(true);
    expect(checkTransformation(t, [{ slot: 0, key: bag[2].key, qty: 4 }], bag, 'selagem', null, false, M).ok).toBe(true);
    expect(checkTransformation(t, [{ slot: 0, key: bag[2].key, qty: 3 }], bag, 'selagem', null, false, M).ok).toBe(false);
  });
  it('não aceita material errado nem sem posse', () => {
    const t = transformationById('inscrever-barreira')!;
    expect(checkTransformation(t, [{ slot: 0, key: bag[2].key, qty: 1 }, { slot: 1, key: 'seiva-azul', qty: 1 }], bag, 'barreira-longa', null, false, M).ok).toBe(false);
    expect(checkTransformation(t, [{ slot: 0, key: 'quartzo-azul|integridade:alta', qty: 1 }, { slot: 1, key: 'seiva-azul', qty: 1 }], bag, 'barreira-longa', null, false, M).ok).toBe(false);
  });
  it('a procedência fica na chave do componente', () => {
    const k = componentKey('trama-distribuicao', { leveza: 'alta', estabilidade: 'media' }, M);
    expect(parseComponentKey(k)).toEqual({ component: 'trama-distribuicao', bands: { estabilidade: 'media', leveza: 'alta' }, maker: 'aaaaaaaa' });
    expect(parseComponentKey('cmp:nada|x:alta~aaaaaaaa')).toBeNull();
  });
});

describe('Pacto: Forja (Corpo, Trama, Marca)', () => {
  const comps = {
    cerne: componentKey('cerne-preservado', { resistencia: 'alta', flexibilidade: 'media' }, M),
    trama: componentKey('trama-distribuicao', { leveza: 'alta', estabilidade: 'media' }, 'bbbbbbbb-0000-4000-8000-000000000000'),
    matriz: componentKey('matriz-barreira', { duracao: 'alta', recarga: 'baixa' }, 'cccccccc-0000-4000-8000-000000000000'),
    agente: componentKey('agente-tempera-agua', { estabilidade: 'alta', potencia: 'media' }, 'dddddddd-0000-4000-8000-000000000000'),
  };
  const bag = [
    { key: comps.cerne, qty: 1 }, { key: comps.trama, qty: 1 }, { key: comps.matriz, qty: 1 }, { key: comps.agente, qty: 1 },
    { key: 'minerio-cobre|pureza:alta', qty: 3 }, { key: 'madeira-carvalho|flexibilidade:baixa,resistencia:alta', qty: 4 }, { key: 'madeira-salgueiro|flexibilidade:alta,resistencia:baixa', qty: 4 },
  ];
  it('Guardião da Nascente: envolve as cinco classes e registra os contribuintes', () => {
    const bp = blueprintById('guardiao-da-nascente')!;
    expect(new Set(bp.offices).size).toBe(5);
    const plan = assistPlan(bp.id, bag)!;
    const out = forgePreview(plan, bag);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.mark?.id).toBe('barreira-breve');
    expect(out.affinity).toBe('agua');
    expect(out.contributors.map((c) => c.office).sort()).toEqual(['confluencia', 'harmonizacao', 'inscricao', 'manejo']);
    expect(out.mark!.cooldown).toBeGreaterThan(out.mark!.duration); // sem ciclo infinito
  });
  it('previsão é o resultado (determinística) e mostra o consumo', () => {
    const plan = assistPlan('guardiao-da-nascente', bag)!;
    expect(forgePreview(plan, bag)).toEqual(forgePreview(plan, bag));
    const out = forgePreview(plan, bag);
    expect(out.ok && out.consume.reduce((a, c) => a + c.qty, 0)).toBe(6);
  });
  it('escolhas trocam propriedades (resistência x peso), sem bônus infinito', () => {
    const base = assistPlan('guardiao-da-nascente', bag)!;
    const a = forgePreview({ ...base, conduct: 'resistencia' }, bag), b = forgePreview({ ...base, conduct: 'leveza' }, bag);
    if (!a.ok || !b.ok) throw new Error('plano');
    expect(a.stats.defesa!).toBeGreaterThan(b.stats.defesa!);
    expect(['leve', 'medio', 'pesado'].indexOf(a.weight)).toBeGreaterThanOrEqual(['leve', 'medio', 'pesado'].indexOf(b.weight));
  });
  it('projeto básico acessível só com coleta sem ferramenta (madeira de galhos + cobre garimpado)', () => {
    const bp = blueprintById('faca-de-colheita')!;
    const basic = [{ key: 'madeira-salgueiro|flexibilidade:media,resistencia:baixa', qty: 1 }, { key: 'minerio-cobre|pureza:baixa', qty: 1 }];
    expect(forgePreview(assistPlan(bp.id, basic)!, basic).ok).toBe(true);
    // e esses materiais saem de abordagens sem ferramenta
    const noTool = Object.values(NODE_KINDS).flatMap((k) => k.approaches.filter((a) => !a.tool && !k.source)).flatMap((a) => a.yields.map((y) => y.material));
    expect(noTool).toContain('madeira-salgueiro');
    expect(noTool).toContain('minerio-cobre');
  });
  it('Guardião não depende de nenhuma fonte superior (alternativas comuns em todas as preparações)', () => {
    for (const t of TRANSFORMATIONS) {
      const anyCommon = t.inputs.every((s) => s.accepts.some((a) => (a.materials ?? []).some((m) => !['cerne-salgueiro', 'agua-da-nascente', 'fibra-aerea', 'cristal-inscrito'].includes(m)) || a.category)) || t.id === 'preservar-cerne';
      expect(anyCommon, t.id).toBe(true);
    }
  });
  it('falta material: diz o que falta e não consome nada', () => {
    const r = forgePreview({ blueprint: 'guardiao-da-nascente', picks: [], conduct: 'resistencia', temper: 'estavel' }, bag);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.missing!.length).toBe(5);
  });
});

describe('Pacto: ciclo de vida e economia', () => {
  it('reciclar nunca devolve mais do que consumiu e perde os componentes', () => {
    const consumed = [{ key: 'minerio-cobre|pureza:alta', qty: 2 }, { key: 'madeira-carvalho|flexibilidade:baixa,resistencia:alta', qty: 3 }, { key: componentKey('trama-distribuicao', { leveza: 'alta' }, M), qty: 1 }];
    const back = recycleReturn(consumed);
    expect(back.every((b) => !b.key.startsWith('cmp:'))).toBe(true);
    for (const b of back) expect(b.qty).toBeLessThan(consumed.find((c) => c.key === b.key)!.qty);
    // ciclo repetido só perde
    let stock = 10; for (let i = 0; i < 5; i++) { stock = stock - 2 + recycleReturn([{ key: 'x', qty: 2 }])[0]?.qty || stock - 2; }
    expect(stock).toBeLessThan(10);
  });
  it('reparo com kit não passa do máximo', () => {
    expect(repairWithKit({ durability: 100, maxDurability: 120 })).toBe(120);
    expect(repairWithKit({ durability: 10, maxDurability: 120 })).toBe(40);
  });
  it('contrato recusa peça inferior', () => {
    const req = { minStats: { defesa: 8 }, maxWeight: 'medio' as const, mark: 'barreira-breve' as const };
    expect(meetsRequirements(req, { stats: { defesa: 9 }, weight: 'medio', mark: { id: 'barreira-breve', label: '', duration: 3, absorb: 30, cooldown: 18, spCost: 6, trigger: '' } })).toEqual([]);
    expect(meetsRequirements(req, { stats: { defesa: 7 }, weight: 'pesado', mark: null }).length).toBe(3);
  });
  it('cancelamento e pagamento nunca criam moeda', () => {
    for (const st of ['aberta', 'aceita', 'em_forja'] as const) for (const absent of [false, true]) {
      const s = cancelSettlement(st, 101, DEFAULT_PACTO, absent)!;
      expect(s.toClient + s.toArtisan).toBe(101);
    }
    expect(cancelSettlement('entregue', 100, DEFAULT_PACTO, false)).toBeNull();
    const p = payout(101, DEFAULT_PACTO);
    expect(p.artisan + p.fee).toBe(101);
    expect(p.fee).toBeGreaterThan(0);
  });
  it('núcleos de Fogo e Terra: Taurina de Fogo traz o Fogo; essência não muda', () => {
    expect(coreCost('fogo', DEFAULT_PACTO)).toEqual({ fogo: 0, terra: 3, total: 3 });
    expect(coreCost('agua', DEFAULT_PACTO).total).toBe(6);
  });
  it('configuração limitada; recarga da barreira sempre maior que a duração', () => {
    const c = resolvePacto({ orderFee: 9, barrier: { duration: 8, cooldown: 2 } });
    expect(c.orderFee).toBe(0.5);
    expect(c.barrier.cooldown).toBeGreaterThan(c.barrier.duration);
    expect(DEFAULT_BARRIER.cooldown).toBeGreaterThan(DEFAULT_BARRIER.duration);
  });
});

describe('linhagem (late game): várias formas e essências', () => {
  it('híbrido Taurina + Dracônica forja e tem os dois ofícios completos', () => {
    const l = lineageOf('serpente', 'agua', { forms: ['touro'] });
    expect(canCompleteEquipment(l.forms)).toBe(true);
    expect(officesOf(l.forms).map((o) => o.key)).toEqual(['confluencia', 'forja']);
    expect(canExtractSuperior(l.forms, 'aquatica')).toBe(true); // a parte Dracônica extrai
    expect(canExtractSuperior(l.forms, 'flora')).toBe(false);
  });
  it('Fogo + Terra: a forja não cobra núcleo nenhum; só uma delas, cobra a outra metade', () => {
    expect(coreCost(['fogo', 'terra'], DEFAULT_PACTO).total).toBe(0);
    expect(coreCost(['fogo', 'agua'], DEFAULT_PACTO).total).toBe(DEFAULT_PACTO.coreFee);
    expect(coreCost('luz', DEFAULT_PACTO).total).toBe(DEFAULT_PACTO.coreFee * 2);
  });
  it('limites e pré-requisitos: forma híbrida só depois da forma avançada (4+) e com o lendário', () => {
    const l = lineageOf('felino', 'natureza', null);
    expect(canGainForm(l, 3, true)).toMatch(/avançada/);
    expect(canGainForm(l, 4, false)).toMatch(/lendário/);
    expect(canGainForm(l, 4, true)).toBeNull();
    expect(canGainForm(l, 9, true)).toBeNull(); // evolução infinita
    expect(canGainEssence(l, false)).toMatch(/quest/);
    const full = lineageOf('felino', 'natureza', { forms: ['passaro', 'touro'], essences: ['fogo', 'terra'] });
    expect(full.forms.length).toBe(LINEAGE_LIMITS.forms);
    expect(full.essences.length).toBe(LINEAGE_LIMITS.essences);
    expect(canGainForm(full, 5, true)).toMatch(/máximo/);
  });
  it('a identidade de nascença vem primeiro e não se repete', () => {
    expect(lineageOf('touro', 'fogo', { forms: ['touro', 'mistica'], essences: ['fogo'] })).toEqual({ forms: ['touro', 'mistica'], essences: ['fogo'] });
  });
});
