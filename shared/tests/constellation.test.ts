import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BALANCE, DEFAULT_SKILLS, RESONANCES, SPECIES, STAT_KEYS, applyBuildToResources, budget, buildReport, checkAllocation, deriveStats, demoProfiles,
  distribute, emptyAllocation, explainBuild, incomingDamage, inferModality, migrateBuild, parseAllocation, parseResonance, rescaleResource, resolveBalance,
  resolveHit, resonanceStrength, skillCost, skillEffect, skillModality, suggestedAllocation, usedPoints, affinity,
  type AttributeAllocation, type SpeciesKey,
} from '../rules/index.ts';

const CLASSES = Object.keys(SPECIES) as SpeciesKey[];
const sk = (slug: string) => DEFAULT_SKILLS.find((s) => s.slug === slug)!;
const derive = (alloc: AttributeAllocation, species: SpeciesKey = 'serpente', stage = 5, resonance: Parameters<typeof deriveStats>[0]['resonance'] = null) => deriveStats({ alloc, stage, species, resonance });

describe('Constelação Viva — orçamento e validação', () => {
  it('mesmo estágio → mesmo orçamento, em todas as classes', () => {
    for (const stage of [1, 5, 20, 200]) {
      const b = budget(stage);
      for (const c of CLASSES) expect(usedPoints(suggestedAllocation(c, stage))).toBe(b);
    }
    expect(budget(2)).toBe(budget(1) + DEFAULT_BALANCE.pointsPerStage);
  });
  it('recusa valores inválidos e soma acima do orçamento', () => {
    for (const bad of [{ vitalidade: -1 }, { forca: 1.5 }, { magia: '3' }, { sorte: 2 }, null, 'x', { vitalidade: Number.NaN }]) expect(parseAllocation(bad)).toBeNull();
    const a = parseAllocation({ vitalidade: budget(3) + 1 });
    expect(checkAllocation(a, 3).ok).toBe(false);
    expect(checkAllocation(parseAllocation({ vitalidade: budget(3) }), 3)).toEqual({ ok: true, used: budget(3), free: 0 });
    expect(checkAllocation(emptyAllocation(), 3)).toMatchObject({ ok: true, free: budget(3) });
  });
  it('zero pontos ainda funciona: vida, SP, potência e acerto básicos', () => {
    const d = derive(emptyAllocation());
    expect(d.hpMax).toBeGreaterThan(50); expect(d.spMax).toBeGreaterThan(30); expect(d.stMax).toBe(100);
    expect(d.physPower).toBe(100); expect(d.magPower).toBe(100); expect(d.attackSpeed).toBe(1); expect(d.castTime).toBe(1);
    // acerta inimigos normais sem Destreza: o dano nunca zera
    expect(resolveHit(40, { split: { fisica: 1, magica: 0 }, essence: null, precision: d.precision }, { essence: null, physDefense: 30 }, 1)).toBeGreaterThan(20);
  });
  it('distribuição por pesos sempre soma o orçamento', () => {
    for (let p = 0; p < 40; p++) expect(usedPoints(distribute(p, { magia: 5, agilidade: 3, espirito: 3 }))).toBe(p);
  });
});

describe('resultados calculados', () => {
  it('cada atributo mexe só no que promete', () => {
    const base = derive(emptyAllocation());
    const one = (k: keyof AttributeAllocation) => derive({ ...emptyAllocation(), [k]: 20 });
    const vit = one('vitalidade'), forca = one('forca'), mag = one('magia'), agi = one('agilidade'), des = one('destreza'), esp = one('espirito');
    expect(vit.hpMax).toBeGreaterThan(base.hpMax); expect(vit.physReduction).toBeGreaterThan(base.physReduction); expect(vit.magReduction).toBe(base.magReduction); expect(vit.physPower).toBe(100);
    expect(forca.physPower).toBeGreaterThan(100); expect(forca.magPower).toBe(100); expect(forca.hpMax).toBe(base.hpMax); expect(forca.attackSpeed).toBe(1);
    expect(mag.magPower).toBeGreaterThan(100); expect(mag.spMax).toBe(base.spMax); expect(mag.attackSpeed).toBe(1);
    expect(agi.attackSpeed).toBeGreaterThan(1); expect(agi.castTime).toBeLessThan(1); expect(agi.physPower).toBe(100); expect(agi.moveSpeed).toBeGreaterThan(base.moveSpeed);
    expect(des.precision).toBeGreaterThan(0); expect(des.physPower).toBe(100); expect(des.magPower).toBe(100);
    expect(esp.spMax).toBeGreaterThan(base.spMax); expect(esp.magReduction).toBeGreaterThan(base.magReduction); expect(esp.spRegen).toBeGreaterThan(base.spRegen); expect(esp.magPower).toBe(100);
  });
  it('sem invulnerabilidade nem velocidade ilimitada, mesmo com pontos absurdos', () => {
    const huge = Object.fromEntries(STAT_KEYS.map((k) => [k, 100000])) as AttributeAllocation;
    const d = derive(huge, 'felino', 999999);
    expect(d.physReduction).toBeLessThanOrEqual(DEFAULT_BALANCE.armor.maxReduction); expect(d.magReduction).toBeLessThanOrEqual(DEFAULT_BALANCE.armor.maxReduction);
    expect(d.attackSpeed).toBeLessThanOrEqual(1 + DEFAULT_BALANCE.attackSpeed.cap * 1.2);
    expect(d.castTime).toBeGreaterThanOrEqual(0.4);
    expect(d.moveSpeed).toBeLessThanOrEqual(SPECIES.felino.speed * (1 + DEFAULT_BALANCE.move.cap) + 1e-9);
    expect(d.physPower).toBeLessThanOrEqual(100 + DEFAULT_BALANCE.power.cap);
    expect(incomingDamage(1000, 'fisica', d, true)).toBeGreaterThanOrEqual(1);
  });
  it('retorno decrescente: o 2º lote de 20 pontos rende menos que o 1º', () => {
    const a = (n: number) => derive({ ...emptyAllocation(), forca: n }).physPower;
    expect(a(40) - a(20)).toBeLessThan(a(20) - a(0));
    const s = (n: number) => derive({ ...emptyAllocation(), agilidade: n }).attackSpeed;
    expect(s(40) - s(20)).toBeLessThan(s(20) - s(0));
  });
  it('velocidade de ataque (frequência) e tempo de conjuração (duração) são coisas diferentes', () => {
    const d = derive({ ...emptyAllocation(), agilidade: 50 });
    expect(d.attackSpeed).not.toBeCloseTo(1 / d.castTime, 2);
  });
  it('a origem de cada resultado é registrada', () => {
    const d = deriveStats({ alloc: { ...emptyAllocation(), vitalidade: 5 }, stage: 3, species: 'touro', equipment: { vida: 10 }, tree: { vida: 5 } });
    expect(d.sources.hpMax!.map((s) => s.label)).toEqual(expect.arrayContaining(['base do estágio', 'Vitalidade', 'equipamento (vida)', 'árvore (vida)']));
  });
});

describe('modalidade, afinidade e resistências', () => {
  it('física usa só a defesa física; mágica, só a resistência', () => {
    const tank = { essence: null, physDefense: 300, magResist: 0 };
    const phys = resolveHit(100, { split: { fisica: 1, magica: 0 }, essence: null, precision: 0 }, tank, 1);
    const mag = resolveHit(100, { split: { fisica: 0, magica: 1 }, essence: null, precision: 0 }, tank, 1);
    expect(phys).toBe(25); expect(mag).toBe(100);
    // híbrida divide explicitamente: metade em cada defesa (não as duas no mesmo componente)
    expect(resolveHit(100, { split: { fisica: 0.5, magica: 0.5 }, essence: null, precision: 0 }, tank, 1)).toBe(Math.round(12.5 + 50));
  });
  it('técnica física de fogo escala com Força; magia de fogo, com Magia', () => {
    const forte = derive({ ...emptyAllocation(), forca: 30 }), mago = derive({ ...emptyAllocation(), magia: 30 });
    const garra = { ...sk('sopro-de-chamas'), modality: 'fisica' as const }, sopro = sk('sopro-de-chamas');
    const ctx = { species: 'serpente' as const, alloc: emptyAllocation() };
    expect(skillEffect(garra, forte, ctx).damage.fisica).toBeGreaterThan(skillEffect(garra, mago, ctx).damage.fisica);
    expect(skillEffect(sopro, mago, ctx).damage.magica).toBeGreaterThan(skillEffect(sopro, forte, ctx).damage.magica);
    expect(skillEffect(sopro, mago, ctx).damage.fisica).toBe(0);
  });
  it('a modalidade inferida faz sentido no catálogo', () => {
    expect(inferModality(sk('golpe'))).toBe('fisica'); expect(inferModality(sk('investida'))).toBe('fisica');
    expect(inferModality(sk('garra-sombria'))).toBe('fisica'); expect(inferModality(sk('jato-dagua'))).toBe('magica');
    expect(inferModality(sk('guarda'))).toBe('magica'); expect(skillModality(sk('ressonancia'))).toEqual({ fisica: 0.5, magica: 0.5 });
  });
  it('afinidade da classe: −10% de SP na essência afim, sem mexer no dano; teto e arredondamento', () => {
    const a = emptyAllocation();
    expect(skillCost(sk('sopro-de-chamas'), { species: 'serpente', alloc: a, resonance: null }).cost).toBe(18); // 20 × 0,9
    expect(skillCost(sk('rajada-fria'), { species: 'serpente', alloc: a, resonance: null }).cost).toBe(20);     // gelo não é afim
    expect(skillCost(sk('sopro-de-chamas'), { species: 'serpente', lineage: true, alloc: a, resonance: null }).cost).toBe(16);
    expect(skillCost(sk('ressonancia'), { species: 'serpente', alloc: a, resonance: null }).cost).toBe(0);
    const maxed = { ...a, magia: 500, espirito: 500 };
    const c = skillCost(sk('sopro-de-chamas'), { species: 'serpente', lineage: true, alloc: maxed, resonance: 'canal-profundo' }).cost;
    expect(c).toBe(Math.round(20 * (1 - DEFAULT_BALANCE.maxCostReduction))); // composição com teto
    const d = derive(a), fx = (sp: SpeciesKey) => skillEffect(sk('sopro-de-chamas'), d, { species: sp, alloc: a });
    expect(fx('serpente').damage).toEqual(fx('passaro').damage);
  });
  it('anel, luz/sombra e veneno preservados', () => {
    expect(affinity('agua', 'fogo')).toBe(1.25); expect(affinity('fogo', 'agua')).toBe(0.8); expect(affinity('vento', 'agua')).toBe(1.25);
    expect(affinity('luz', 'sombra')).toBe(1.25); expect(affinity('sombra', 'luz')).toBe(1.25); expect(affinity('luz', 'fogo')).toBe(1);
    expect(affinity('veneno', 'natureza')).toBe(1.25); expect(affinity('veneno', 'terra')).toBe(0.8);
    expect(affinity('terra', 'veneno')).toBe(1.25); expect(affinity('agua', 'veneno')).toBe(0.8);
  });
  it('precisão: reduz a variação e rende mais nas fraquezas', () => {
    const def = { essence: null, physDefense: 0 };
    const spread = (p: number) => resolveHit(100, { split: { fisica: 1, magica: 0 }, essence: null, precision: p }, def, 1, 0.999) - resolveHit(100, { split: { fisica: 1, magica: 0 }, essence: null, precision: p }, def, 1, 0);
    expect(spread(DEFAULT_BALANCE.precision.cap)).toBeLessThan(spread(0));
    const weak = (p: number) => resolveHit(100, { split: { fisica: 1, magica: 0 }, essence: 'agua', precision: p }, { essence: 'fogo', physDefense: 0 }, 1.25);
    expect(weak(0.5)).toBeGreaterThan(weak(0));
  });
});

describe('Ressonâncias', () => {
  it('só uma ativa, gradual, com benefício e contrapartida', () => {
    expect(parseResonance('fluxo-arcano')).toBe('fluxo-arcano'); expect(parseResonance(['fluxo-arcano', 'bastiao'])).toBeUndefined();
    expect(parseResonance('impacto')).toBeUndefined(); // ainda não funcional
    const avail = Object.values(RESONANCES).filter((r) => r.available);
    expect(avail.length).toBe(3);
    for (const r of Object.values(RESONANCES)) { expect(r.benefit).toBeTruthy(); expect(r.cost).toBeTruthy(); }
    const low = resonanceStrength('fluxo-arcano', { ...emptyAllocation(), magia: 2, agilidade: 2 });
    const high = resonanceStrength('fluxo-arcano', { ...emptyAllocation(), magia: 30, agilidade: 30 });
    expect(low).toBeGreaterThan(0); expect(high).toBeGreaterThan(low); expect(high).toBeLessThan(1);
    expect(resonanceStrength('fluxo-arcano', { ...emptyAllocation(), magia: 30 })).toBe(0); // precisa dos dois atributos
  });
  it('Fluxo Arcano: conjura mais rápido, cada lançamento rende menos; não mexe em golpes instantâneos', () => {
    const a = { ...emptyAllocation(), magia: 20, agilidade: 20 };
    const on = derive(a, 'serpente', 5, 'fluxo-arcano'), off = derive(a, 'serpente', 5, null);
    const ctx = { species: 'serpente' as const, alloc: a };
    const s = sk('jato-dagua');
    expect(skillEffect(s, on, ctx).windup).toBeLessThan(skillEffect(s, off, ctx).windup);
    expect(skillEffect(s, on, ctx).damage.magica).toBeLessThan(skillEffect(s, off, ctx).damage.magica);
    const instant = { ...sk('golpe'), windup: 0 };
    expect(skillEffect(instant, on, ctx)).toEqual(skillEffect(instant, off, ctx));
    expect(skillEffect(sk('investida'), on, ctx).windup).toBe(sk('investida').windup); // física: sem bônus de conjuração
  });
  it('Canal Profundo: menos SP, preparação mais longa; Bastião: magia na guarda, anda mais devagar', () => {
    const a = { ...emptyAllocation(), magia: 20, espirito: 20, vitalidade: 20 };
    const canal = derive(a, 'serpente', 5, 'canal-profundo'), none = derive(a, 'serpente', 5, null), bast = derive(a, 'serpente', 5, 'bastiao');
    const ctx = { species: 'passaro' as const, alloc: a };
    expect(skillEffect(sk('jato-dagua'), canal, ctx).cost).toBeLessThan(skillEffect(sk('jato-dagua'), none, ctx).cost);
    expect(skillEffect(sk('jato-dagua'), canal, ctx).windup).toBeGreaterThan(skillEffect(sk('jato-dagua'), none, ctx).windup);
    expect(incomingDamage(100, 'magica', bast, true)).toBeLessThan(incomingDamage(100, 'magica', none, true));
    expect(incomingDamage(100, 'magica', bast, false)).toBe(incomingDamage(100, 'magica', none, false)); // só na guarda
    expect(incomingDamage(100, 'fisica', bast, true)).toBe(incomingDamage(100, 'fisica', none, true));
    expect(bast.guard.move).toBeLessThan(none.guard.move);
  });
});

describe('troca de build', () => {
  it('não cura nem recupera SP/stamina; mantém proporção sem passar do valor anterior', () => {
    expect(rescaleResource(50, 100, 200)).toBe(50);        // máximo subiu: continua 50, não vira 100
    expect(rescaleResource(50, 100, 80)).toBe(40);         // máximo caiu: proporção
    expect(rescaleResource(0, 100, 200)).toBe(0);
    expect(rescaleResource(100, 100, 150)).toBe(100);
    const r = applyBuildToResources({ hp: 30, hpMax: 100, sp: 10, spMax: 60, st: 5, stMax: 100, down: false }, { hpMax: 180, spMax: 90, stMax: 100 });
    expect(r).toMatchObject({ hp: 30, sp: 10, st: 5, hpMax: 180, spMax: 90 });
  });
  it('desmaiado continua desmaiado', () => {
    const r = applyBuildToResources({ hp: 0, hpMax: 100, sp: 0, spMax: 60, st: 0, stMax: 100, down: true }, { hpMax: 300, spMax: 90, stMax: 100 });
    expect(r.down).toBe(true); expect(r.hp).toBe(0);
  });
  it('migração: distribuição inicial válida, sem somar bônus raciais antigos', () => {
    for (const c of CLASSES) {
      const m = migrateBuild(c, 4);
      expect(checkAllocation(m.active.alloc, 4).ok).toBe(true);
      const d = deriveStats({ alloc: m.active.alloc, stage: 4, species: c });
      const sameAlloc = deriveStats({ alloc: m.active.alloc, stage: 4, species: 'serpente' });
      expect(d.hpMax).toBe(sameAlloc.hpMax); // a classe não soma HP por fora (só a velocidade muda)
      expect(m.migrated).toBeTruthy();
    }
  });
  it('configuração do servidor é limitada', () => {
    const b = resolveBalance({ armor: { maxReduction: 5 }, basePoints: 7.6, maxCostReduction: 3, inventado: 1 });
    expect(b.armor.maxReduction).toBeLessThanOrEqual(0.9); expect(b.basePoints).toBe(8); expect(b.maxCostReduction).toBeLessThanOrEqual(0.8);
  });
});

describe('perfis de demonstração (Dracônico) e builds alternativas', () => {
  const stage = 10;
  const reports = demoProfiles(stage).map((p) => ({ p, d: deriveStats({ alloc: p.alloc, stage, species: 'serpente', resonance: p.resonance }) })).map((x) => ({ ...x, r: buildReport(x.d) }));
  const [conj, guard, phys] = reports;
  it('os três perfis gastam o mesmo orçamento e são diferentes', () => {
    for (const x of reports) expect(usedPoints(x.p.alloc)).toBe(budget(stage));
    expect(conj.r.sustainedMag).toBeGreaterThan(guard.r.sustainedMag); expect(conj.r.sustainedMag).toBeGreaterThan(phys.r.sustainedMag);
    expect(phys.r.sustainedPhys).toBeGreaterThan(conj.r.sustainedPhys); expect(phys.r.sustainedPhys).toBeGreaterThan(guard.r.sustainedPhys);
    expect(guard.r.ehpPhys).toBeGreaterThan(conj.r.ehpPhys); expect(guard.r.ehpMag).toBeGreaterThan(phys.r.ehpMag);
    expect(conj.r.ehpPhys).toBeLessThan(phys.r.ehpPhys); // o conjurador investe pouco em Vitalidade: fica vulnerável
  });
  it('nenhum perfil vence em tudo', () => {
    const keys = ['sustainedPhys', 'sustainedMag', 'burst', 'ehpPhys', 'ehpMag'] as const;
    for (const x of reports) expect(reports.some((y) => y !== x && keys.some((k) => y.r[k] > x.r[k]))).toBe(true);
  });
  it('em toda classe, builds física e mágica são viáveis (dano principal ≥ 65% da melhor build da outra classe)', () => {
    const best = { fisica: 0, magica: 0 };
    const all = CLASSES.flatMap((c) => (['fisica', 'magica'] as const).map((m) => {
      const w = m === 'fisica' ? { forca: 5, vitalidade: 3, agilidade: 2 } : { magia: 5, espirito: 3, agilidade: 2 };
      const r = buildReport(deriveStats({ alloc: distribute(budget(stage), w), stage, species: c }));
      const v = m === 'fisica' ? r.sustainedPhys : r.sustainedMag; best[m] = Math.max(best[m], v); return { c, m, v };
    }));
    for (const x of all) expect(x.v).toBeGreaterThanOrEqual(best[x.m] * 0.65);
  });
  it('a explicação do Companion vem dos números', () => {
    const lines = explainBuild(phys.d, conj.d);
    expect(lines.join(' ')).toMatch(/magia|Conjuro|HP efetivo/);
  });
});

import { skillChargeMultiplier, skillCharge, SKILL_CHARGE_MAX } from '../rules/index.ts';
describe('concentrar a habilidade (Shift + número)', () => {
  it('cresce com o tempo e para em 2,5 s', () => {
    expect(skillChargeMultiplier(0)).toBe(1);
    expect(skillChargeMultiplier(0.1)).toBe(1);                    // toque rápido: lançamento normal
    expect(skillChargeMultiplier(1.25)).toBeCloseTo(1.5, 5);
    expect(skillChargeMultiplier(SKILL_CHARGE_MAX)).toBe(2);
    expect(skillChargeMultiplier(10)).toBe(2);                     // segurar mais não passa do máximo
    expect(skillCharge(2)).toBeLessThan(skillCharge(2.4));
  });
});

describe('quests secretas dão pontos', () => {
  it('+1 de habilidade por secreta e +10 de Constelação a cada 10', async () => {
    const { secretBonus, skillPoints, budget, checkAllocation, DEFAULT_BALANCE } = await import('../rules/index.ts');
    expect(secretBonus(3)).toMatchObject({ skillPoints: 3, constellationPoints: 0, nextIn: 7 });
    expect(secretBonus(10).constellationPoints).toBe(10);
    expect(secretBonus(25).constellationPoints).toBe(20);
    expect(skillPoints(4, 0, 3)).toBe(7);
    expect(budget(1, DEFAULT_BALANCE, 10)).toBe(budget(1) + 10);
    const alloc = { vitalidade: budget(1) + 10, forca: 0, magia: 0, agilidade: 0, destreza: 0, espirito: 0 };
    expect(checkAllocation(alloc, 1).ok).toBe(false);
    expect(checkAllocation(alloc, 1, DEFAULT_BALANCE, 10).ok).toBe(true);
  });
});
