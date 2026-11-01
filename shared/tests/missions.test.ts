import { describe, it, expect } from 'vitest';
import {
  sanitizeMission, missionPeriod, missionBlock, missionProgress, missionComplete, objectiveLabel, batchFits, DEFAULT_MISSIONS, batchKey, recipeName,
  type MissionDef,
} from '../rules/index';

const base = (p: Partial<MissionDef> = {}) => sanitizeMission({ slug: 'teste', name: 'Teste', objectives: [{ kind: 'coletar', qty: 3, material: 'erva-orvalho-folha' }], ...p })!;

describe('missões', () => {
  it('saneia o que vem do Admin', () => {
    const m = sanitizeMission({
      slug: 'a-b', name: '  Nome ', rarity: 'mitica', repeat: 'diaria', giver: 'escola-veneno',
      req: { after: ['a-b', 'outra', 'X!'], bond: 500, schools: ['veneno', 'magia'], classes: ['felino', 'dragao'], essences: ['fogo', 'plasma'] },
      objectives: [
        { kind: 'coletar', qty: 5000, material: 'erva-orvalho-folha', prop: 'estabilidade', min: 'alta', biome: 'floresta-densa' },
        { kind: 'coletar', qty: 2, material: 'nada' },
        { kind: 'cacar', qty: 3, family: 'distorcidos', minLevel: 5 },
        { kind: 'fabricar', qty: 1, recipe: 'pocao-vida-p' },
        { kind: 'fabricar', qty: 1, recipe: 'bolo-de-lava' },
      ],
      rewards: { lumes: -5, bond: 30, materials: [{ key: 'lixo', qty: 1 }, { key: batchKey('pedra-granito', { resistencia: 'alta' }), qty: 3 }], items: [{ item: 'pocao-vida-p', qty: 2 }], unlock: 'erva:lunar' },
    })!;
    expect(m).toMatchObject({ name: 'Nome', rarity: 'comum', repeat: 'diaria', giver: 'escola-veneno' });
    expect(m.req).toEqual({ after: ['outra'], bond: 99, schools: ['veneno'], classes: ['felino'], essences: ['fogo'] });
    expect(m.objectives.map((o) => o.kind)).toEqual(['coletar', 'cacar', 'fabricar']);
    expect(m.objectives[0]).toMatchObject({ qty: 999, prop: 'estabilidade', min: 'alta', biome: 'floresta-densa' });
    expect(m.rewards).toMatchObject({ lumes: 0, bond: 30, materials: [{ qty: 3 }], items: [{ item: 'pocao-vida-p', qty: 2 }], unlock: 'erva:lunar' });
    expect(sanitizeMission({ slug: 'x', name: 'a' })).toBeNull();
    expect(sanitizeMission({ slug: 'ok-1', name: '' })).toBeNull();
  });

  it('repete por dia e por semana (horário de Brasília)', () => {
    const t = Date.UTC(2026, 10, 2, 2, 0); // 1/nov 23h em Brasília
    expect(missionPeriod('unica', t)).toBe('x');
    expect(missionPeriod('diaria', t)).toBe('2026-11-01');
    expect(missionPeriod('semanal', t)).toBe(missionPeriod('semanal', Date.UTC(2026, 9, 27, 12)));
    expect(missionPeriod('semanal', t)).not.toBe(missionPeriod('semanal', Date.UTC(2026, 10, 3, 12)));
  });

  it('confere os pré-requisitos', () => {
    const m = base({ req: { after: ['antes'], bond: 3, schools: ['veneno'], classes: ['passaro'], essences: ['agua'] } });
    const who = { done: new Set<string>(), bondLevel: 1, schools: [] as string[], forms: ['felino' as const], essence: 'fogo' as const };
    expect(missionBlock(m, who)).toMatch(/antes/);
    expect(missionBlock(m, { ...who, done: new Set(['antes']) })).toMatch(/vínculo/);
    expect(missionBlock(m, { ...who, done: new Set(['antes']), bondLevel: 3 })).toMatch(/Veneno/);
    expect(missionBlock(m, { ...who, done: new Set(['antes']), bondLevel: 3, schools: ['veneno'] })).toMatch(/Alada/);
    expect(missionBlock(m, { ...who, done: new Set(['antes']), bondLevel: 3, schools: ['veneno'], forms: ['passaro'] })).toMatch(/Água/);
    expect(missionBlock(m, { done: new Set(['antes']), bondLevel: 3, schools: ['veneno'], forms: ['passaro'], essence: 'agua' })).toBeNull();
  });

  it('conta o progresso só com o que o servidor registrou', () => {
    const m = sanitizeMission({
      slug: 'mix', name: 'Mix', objectives: [
        { kind: 'coletar', qty: 4, category: 'planta', prop: 'estabilidade', min: 'media', biome: 'floresta-densa' },
        { kind: 'entregar', qty: 5, category: 'madeira' },
        { kind: 'cacar', qty: 2, family: 'distorcidos', minLevel: 3 },
        { kind: 'fabricar', qty: 2, recipe: 'pocao-vida-p' },
      ],
    })!;
    const good = batchKey('erva-orvalho-folha', { potencia: 'baixa', estabilidade: 'alta' }), bad = batchKey('erva-orvalho-flor', { potencia: 'alta', estabilidade: 'baixa' });
    const log = {
      gathers: [{ items: [{ key: good, qty: 3 }, { key: bad, qty: 5 }], biome: 'floresta-densa' }, { items: [{ key: good, qty: 3 }], biome: 'outra' }, { items: [{ key: good, qty: 2 }], biome: 'floresta-densa' }],
      kills: [{ slug: 'lasquinha', level: 2, family: 'distorcidos' }, { slug: 'estilhaco', level: 6, family: 'distorcidos' }, { slug: 'fagulha', level: 9, family: null }],
      crafts: [{ recipe: 'pocao-vida-p', times: 3 }],
    };
    const p = missionProgress(m, log, [0, 5]);
    expect(p).toEqual([4, 5, 1, 2]);
    expect(missionComplete(m, p)).toBe(false);
    expect(missionComplete(m, [4, 5, 2, 2])).toBe(true);
    expect(batchFits(m.objectives[0], bad)).toBe(false);
  });

  it('gera textos legíveis e os exemplos são válidos', () => {
    expect(objectiveLabel({ kind: 'coletar', qty: 6, material: 'erva-orvalho-folha' })).toBe('Coletar 6× Folhas de Erva-de-orvalho');
    expect(objectiveLabel({ kind: 'cacar', qty: 10, family: 'distorcidos' }, (_k, s) => s === 'distorcidos' ? 'Distorcidos' : s)).toBe('Derrotar 10× da família Distorcidos');
    expect(recipeName('pocao-vida-p')).toBeTruthy();
    for (const m of DEFAULT_MISSIONS) expect(sanitizeMission(m)).toEqual(m);
  });
});
