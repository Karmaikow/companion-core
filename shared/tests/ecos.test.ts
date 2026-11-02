import { describe, expect, it } from 'vitest';
import {
  BAG_CAPACITY,
  MATERIALS, NODE_KINDS, VALE_NODES, VALE, NASCENTE, STREAM, CATEGORIES, rollGather, batchKey, parseBatchKey, bandOf, batchQuality, abundanceNow,
  msUntilAvailable, expectedOutcome, streamDist, valeHeight, makeCompanionWorld, WORLD_FALLBACK_BIOMES, resolveEcos,
  SEIVA_AZUL, stepSatisfied, cluesFor, chainReward, JARDIM, siteStoredNow, RECIPES, slotFit, checkCraft, autoPick, recipeById,
  PONTE, acceptContribution, needFits, stageComplete, scaledNeed, suggestGather, perceivedNodes, DEFAULT_INTENT, nodeById,
  STARTER_TOOLS, type MaterialBatch,
} from '../rules/index.ts';

const T0 = Date.UTC(2026, 9, 22, 12);

describe('Ecos: materiais e lotes', () => {
  it('cada categoria tem poucas propriedades legíveis; há 6 categorias no vale', () => {
    for (const c of Object.values(CATEGORIES)) expect(c.props.length).toBeLessThanOrEqual(3);
    const cats = new Set(VALE_NODES.map((n) => NODE_KINDS[n.kind].category));
    for (const m of Object.values(MATERIALS)) cats.add(m.category);
    expect(cats.size).toBeGreaterThanOrEqual(6);
  });
  it('todo material comum tem uso', () => {
    for (const m of Object.values(MATERIALS)) expect(m.uses.length).toBeGreaterThan(0);
  });
  it('lotes se agrupam por faixa (chave estável) e a chave volta', () => {
    expect(bandOf(10)).toBe('baixa'); expect(bandOf(50)).toBe('media'); expect(bandOf(80)).toBe('alta');
    const k = batchKey('madeira-salgueiro', { resistencia: 'media', flexibilidade: 'alta' });
    expect(k).toBe('madeira-salgueiro|flexibilidade:alta,resistencia:media');
    expect(parseBatchKey(k)).toEqual({ material: 'madeira-salgueiro', bands: { flexibilidade: 'alta', resistencia: 'media' } });
    expect(parseBatchKey('nada|x:y')).toBeNull();
    expect(batchQuality({ bands: { flexibilidade: 'alta', resistencia: 'alta' } })).toBe('excelente');
  });
  it('a mesma requisição rende sempre o mesmo lote; outra pode render diferente', () => {
    const n = nodeById('cobre-veio')!, ap = NODE_KINDS.cobre.approaches[1];
    expect(rollGather(n, ap, 'a')).toEqual(rollGather(n, ap, 'a'));
    const all = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(rollGather(n, ap, 'r' + i))));
    expect(all.size).toBeGreaterThan(1);
  });
  it('a garantia mínima sempre vem', () => {
    for (const n of VALE_NODES) for (const ap of NODE_KINDS[n.kind].approaches) for (let i = 0; i < 20; i++) {
      const got = rollGather(n, ap, `g${i}`);
      for (const y of ap.yields) expect(got.filter((b) => b.material === y.material).reduce((a, b) => a + b.qty, 0)).toBeGreaterThanOrEqual(y.guaranteed);
    }
  });
});

describe('Ecos: abordagens', () => {
  it('todo nó tem 2 ou 3 abordagens e nenhuma domina as outras do mesmo material', () => {
    for (const k of Object.values(NODE_KINDS)) {
      expect(k.approaches.length).toBeGreaterThanOrEqual(2); expect(k.approaches.length).toBeLessThanOrEqual(3);
      const metric = (a: (typeof k.approaches)[number]) => {
        const qty = a.yields.reduce((s, y) => s + ((y.qty[0] + y.qty[1]) / 2) * (y.chance ?? 1), 0);
        return { rate: qty / a.seconds, perCost: qty / a.cost, free: a.tool ? 0 : 1, fast: -a.seconds, mats: a.yields.map((y) => y.material).sort().join() };
      };
      for (const a of k.approaches) for (const b of k.approaches) {
        if (a === b) continue;
        const A = metric(a), B = metric(b);
        if (A.mats !== B.mats) continue; // materiais diferentes: não competem
        const dominates = A.rate >= B.rate && A.perCost >= B.perCost && A.free >= B.free && A.fast >= B.fast;
        expect(dominates, `${k.kind}: ${a.id} domina ${b.id}`).toBe(false);
      }
    }
  });
  it('estimativa honesta: faixas possíveis incluem tudo que pode sair', () => {
    const n = nodeById('cobre-veio')!;
    for (const ap of NODE_KINDS.cobre.approaches) {
      const exp = expectedOutcome(n, ap)[0];
      for (let i = 0; i < 40; i++) for (const b of rollGather(n, ap, 'e' + i)) expect(exp.bands.pureza).toContain(b.bands.pureza);
    }
  });
});

describe('Ecos: o vale e a ecologia', () => {
  it('o riacho desce para o sul (montante = norte, mais alto) e o vale fica fora das pedras-guia', () => {
    expect(valeHeight(STREAM[0][0], STREAM[0][1])).toBeGreaterThan(valeHeight(STREAM[STREAM.length - 1][0], STREAM[STREAM.length - 1][1]));
    expect(streamDist(NASCENTE.x, NASCENTE.z).t).toBeLessThan(0.05);
    const w = makeCompanionWorld(7, WORLD_FALLBACK_BIOMES);
    for (const s of w.sites) if (!s.home) expect(Math.hypot(s.x - VALE.x, s.z - VALE.z)).toBeGreaterThan(VALE.r + 4);
    for (const n of VALE_NODES) expect(Math.hypot(n.x - VALE.x, n.z - VALE.z)).toBeLessThan(VALE.r);
  });
  it('abundância cai com a coleta e volta sozinha até a capacidade (sem simulação por quadro)', () => {
    const n = nodeById('salgueiro-curva')!, k = NODE_KINDS.salgueiro;
    expect(abundanceNow(n, null, T0)).toBe(k.capacity);
    const st = { amount: 0, at: T0 };
    expect(abundanceNow(n, st, T0 + 3_600_000)).toBeCloseTo(k.regenPerHour);
    expect(abundanceNow(n, st, T0 + 100 * 3_600_000)).toBe(k.capacity);
    expect(msUntilAvailable(n, k.approaches[2], st, T0)).toBeGreaterThan(0);
    expect(msUntilAvailable(n, k.approaches[0], { amount: 1, at: T0 }, T0)).toBe(0);
  });
  it('chuva ajuda as plantas a voltar', () => {
    const n = nodeById('erva-margem')!, st = { amount: 0, at: T0 };
    expect(abundanceNow(n, st, T0 + 3_600_000, 'chuva')).toBeGreaterThan(abundanceNow(n, st, T0 + 3_600_000));
  });
});

describe('Ecos: cadeia "A Seiva Azul"', () => {
  it('3 etapas em ordem, cada indício aponta para conteúdo que existe', () => {
    expect(SEIVA_AZUL.steps).toHaveLength(3);
    for (const s of SEIVA_AZUL.steps) for (const c of [s.lead, s.evidence]) {
      if (c.points.node) expect(nodeById(c.points.node)).not.toBeNull();
      if (c.points.step) expect(SEIVA_AZUL.steps.some((x) => x.id === c.points.step)).toBe(true);
    }
    expect(stepSatisfied(SEIVA_AZUL, null, { node: 'cascalho-alto', approach: 'peneirar' })).toBe(false); // fora de ordem
    expect(stepSatisfied(SEIVA_AZUL, null, { node: 'salgueiro-nascente', inspect: true })).toBe(true);
    expect(stepSatisfied(SEIVA_AZUL, { step: 1 }, { node: 'cascalho-alto', approach: 'juntar' })).toBe(false);
    expect(stepSatisfied(SEIVA_AZUL, { step: 1 }, { node: 'cascalho-alto', approach: 'peneirar' })).toBe(true);
    expect(stepSatisfied(SEIVA_AZUL, { step: 2 }, { x: NASCENTE.x + 1, z: NASCENTE.z })).toBe(true);
    expect(stepSatisfied(SEIVA_AZUL, { step: 2 }, { x: 0, z: 0 })).toBe(false);
  });
  it('o indício só surge perto da árvore e nunca revela o que não se viu', () => {
    expect(cluesFor(SEIVA_AZUL, null, () => false)).toEqual([]);
    expect(cluesFor(SEIVA_AZUL, null, () => true).map((c) => c.id)).toEqual(['seiva-lead']);
    expect(cluesFor(SEIVA_AZUL, { step: 1 }, () => false).map((c) => c.status)).toEqual(['hipotese', 'hipotese']);
    expect(cluesFor(SEIVA_AZUL, { step: 3, completedAt: 'x', choice: 'preservar' }, () => false).at(-1)!.status).toBe('descoberta');
  });
  it('extrair dá cristais agora; preservar não dá nada agora (mas cria o jardim)', () => {
    expect(chainReward('extrair').reduce((a, b) => a + b.qty, 0)).toBe(5);
    expect(chainReward('preservar')).toEqual([]);
  });
});

describe('Ecos: Jardim da Nascente', () => {
  it('produz sozinho até o limite; ausência nunca destrói; cuidar acelera por um tempo', () => {
    const st = { stored: 0, at: T0 };
    expect(siteStoredNow(JARDIM, st, T0 + 2 * 3_600_000)).toBeCloseTo(3);
    expect(siteStoredNow(JARDIM, st, T0 + 1000 * 3_600_000)).toBe(JARDIM.capacity);
    expect(siteStoredNow(JARDIM, { ...st, caredAt: T0 }, T0 + 2 * 3_600_000)).toBeCloseTo(4.5);
  });
});

describe('Ecos: receitas livres são só consumíveis', () => {
  it('nenhuma receita livre produz equipamento ou ferramenta (isso é da Forja Taurina)', () => {
    expect(RECIPES.every((r) => r.output.kind === 'item' && !/arco|cinzel|espada|escudo|machado|picareta|faca/.test(r.output.key))).toBe(true);
  });
  it('o unguento valoriza folhas comuns e estáveis', () => {
    const u = recipeById('unguento-orvalho')!;
    const folha = { key: 'erva-orvalho-folha|estabilidade:alta,potencia:media', material: 'erva-orvalho-folha', bands: { estabilidade: 'alta' as const, potencia: 'media' as const }, qty: 2 };
    const flor = { key: 'erva-orvalho-flor|estabilidade:baixa,potencia:alta', material: 'erva-orvalho-flor', bands: { estabilidade: 'baixa' as const, potencia: 'alta' as const }, qty: 2 };
    expect(slotFit(u.slots[0], folha)).toBe('ideal');
    expect(slotFit(u.slots[0], flor)).toBe('nao-serve');
    const ok = checkCraft(u, autoPick(u, [folha as MaterialBatch])!, [folha as MaterialBatch]);
    expect(ok.ok && ok.quality).toBe('excelente');
  });
  it('não há kit grátis de ferramentas', () => { expect(STARTER_TOOLS).toEqual([]); });
});

describe('Ecos: Ponte do Riacho', () => {
  const cfg = { scale: 1, capShare: 0.4, capHours: 2 };
  it('aceita só o que falta e respeita a cota pessoal (anti-monopólio); a cota some com o tempo', () => {
    const st = { stage: 0, progress: [0], startedAt: T0 };
    expect(acceptContribution(PONTE, st, 0, 50, 0, cfg, T0)).toBe(8); // 40% de 20
    expect(acceptContribution(PONTE, st, 0, 50, 8, cfg, T0)).toBe(0);
    expect(acceptContribution(PONTE, st, 0, 50, 8, cfg, T0 + 3 * 3_600_000)).toBe(20);
    expect(acceptContribution(PONTE, { ...st, progress: [18] }, 0, 50, 0, cfg, T0)).toBe(2);
  });
  it('etapa completa só com todas as necessidades; meta escala com o servidor', () => {
    expect(stageComplete(PONTE, { stage: 0, progress: [20], startedAt: T0 }, 1)).toBe(true);
    expect(stageComplete(PONTE, { stage: 1, progress: [14, 3], startedAt: T0 }, 1)).toBe(false);
    expect(scaledNeed(PONTE.stages[0].needs[0], 0.5)).toBe(10);
  });
  it('pedra fraca não entra na fundação; o brilho aceita alternativas (não trava)', () => {
    expect(needFits(PONTE, 0, 0, { material: 'pedra-seixo', bands: { resistencia: 'baixa' } })).toBe(false);
    expect(needFits(PONTE, 0, 0, { material: 'pedra-granito', bands: { resistencia: 'alta' } })).toBe(true);
    expect(needFits(PONTE, 2, 1, { material: 'quartzo-fragmento', bands: { integridade: 'baixa' } })).toBe(true);
  });
});

describe('Ecos: Companion decide com o que sabe', () => {
  const known = (ids: string[], at = { x: -6, z: 30 }) => ids.map((id) => { const node = nodeById(id)!; return { node, st: null, dist: Math.hypot(node.x - at.x, node.z - at.z) }; });
  it('selecionar madeira flexível prefere salgueiro (galhos) e explica', () => {
    const s = suggestGather({ ...DEFAULT_INTENT, mode: 'selecionar', target: { category: 'madeira', prop: 'flexibilidade', min: 'media', qty: 3, label: 'Madeira flexível' } }, { known: known(['salgueiro-curva', 'carvalho-velho']), bagFree: 60, tools: ['faca', 'machado', 'picareta'], knownMaterials: ['madeira-salgueiro'], now: T0 });
    expect(s[0].node.kind).toBe('salgueiro');
    expect(s[0].reason.length).toBeGreaterThan(10);
  });
  it('não sugere o que não conhece, nem o que exige ferramenta que não tem, nem risco acima do combinado', () => {
    const s = suggestGather({ ...DEFAULT_INTENT, risk: 0, target: { category: 'pedra', qty: 10, label: 'Pedra' } }, { known: known(['granito-face']), bagFree: 60, tools: [], knownMaterials: [], now: T0 });
    expect(s.every((x) => x.node.id === 'granito-face')).toBe(true);
    expect(s.find((x) => x.approach.id === 'volume')!.blocked).toBeTruthy();
    expect(s[0].approach.id).toBe('lascas');
  });
  it('respeita a reserva da mochila', () => {
    const s = suggestGather({ ...DEFAULT_INTENT, reserve: 10 }, { known: known(['salgueiro-curva']), bagFree: 11, tools: ['machado'], knownMaterials: [], now: T0 });
    expect(s.find((x) => x.approach.id === 'cortar')!.blocked).toBe('mochila quase cheia');
  });
  it('percepção: só nós por perto ou já vistos; a margem leste só com a ponte', () => {
    const near = perceivedNodes([{ x: -6, z: 30 }], [], false).map((n) => n.id);
    expect(near).toContain('salgueiro-curva');
    expect(near).not.toContain('geodo-fenda');
    expect(perceivedNodes([{ x: 8, z: 27 }], [], false).some((n) => n.needs)).toBe(false);
    expect(perceivedNodes([{ x: 8, z: 27 }], [], true).some((n) => n.needs)).toBe(true);
  });
});

describe('Ecos: configuração', () => {
  it('valores ruins viram padrão ou são limitados', () => {
    const c = resolveEcos({ bag: 'x', projectScale: 999, capShare: -1 });
    expect(c.bag).toBe(BAG_CAPACITY); expect(c.projectScale).toBe(20); expect(c.capShare).toBe(0.1);
  });
});

describe('Ecos: ordens de coleta no chat', () => {
  it('entende o que coletar', async () => {
    const { parseCommand } = await import('../rules/index.ts');
    expect(parseCommand('Mayuna, colete 5 cobres')).toEqual({ kind: 'gather', count: 5, what: 'cobre' });
    expect(parseCommand('pega 12 seixos')).toEqual({ kind: 'gather', count: 12, what: 'pedra' });
    expect(parseCommand('colher 3 raizes')).toEqual({ kind: 'gather', count: 3, what: 'raiz' });
    expect(parseCommand('junte seiva')).toEqual({ kind: 'gather', count: 10, what: 'seiva' });
  });
});
