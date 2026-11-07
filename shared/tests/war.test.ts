import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WAR, resolveWar, emptyWar, addKills, scheduleWar, enlist, startWar, assignGates, hordeSchedule, bossAtSec,
  newField, damageGate, crystalDrain, warOutcome, finishWar, plausibleDamage, ranking, warRewards, rebuildGoalFor, hordeSpawns,
} from '../rules/index';

const cfg = DEFAULT_WAR, T0 = 1_000_000_000;

describe('guerra de Áster', () => {
  it('a Fúria enche com os abates e anuncia a guerra (respeitando o intervalo mínimo)', () => {
    let s = emptyWar(cfg);
    s = addKills(s, 50, cfg, T0);
    expect(s.kills).toBe(50);
    s = { ...s, kills: cfg.killTrigger - 10 };
    const a = addKills(s, 50, cfg, T0);
    expect(a.phase).toBe('anuncio');
    expect(a.by).toBe('furia');
    expect(addKills({ ...s, lastEndedAt: T0 - 1000 }, 50, cfg, T0).phase).toBe('descanso');
  });

  it('o Administrador marca a guerra e o alistamento vale até a hora', () => {
    const s = scheduleWar(emptyWar(cfg), T0, 20 * 60_000);
    expect(s.startsAt).toBe(T0 + 20 * 60_000);
    expect(enlist(s, 'a', T0 + 1000).ok).toBe(true);
    expect(enlist(s, 'b', s.startsAt! + 1).ok).toBe(false);
  });

  it('no mínimo 2 por portão: heróis completam as vagas', () => {
    const a = assignGates(['a', 'b', 'c'], cfg, 7);
    expect(Object.values(a.gates).flat().sort()).toEqual(['a', 'b', 'c']);
    for (const g of ['norte', 'leste', 'sul', 'oeste'] as const) expect(a.gates[g].length + a.heroes[g]).toBeGreaterThanOrEqual(cfg.minPerGate);
    expect(assignGates(['a', 'b', 'c'], cfg, 7)).toEqual(a);
  });

  it('38 min: 7 hordas (5:00 a 35:00) e o chefe aos 30:00', () => {
    expect(hordeSchedule(cfg)).toEqual([300, 600, 900, 1200, 1500, 1800, 2100]);
    expect(bossAtSec(cfg)).toBe(1800);
  });

  it('as hordas saem iguais em todo aparelho', () => {
    expect(hordeSpawns(5, 2, 'norte', 6)).toEqual(hordeSpawns(5, 2, 'norte', 6));
  });

  it('derrota com o cristal a zero; vitória com ele de pé aos 38 min', () => {
    let f = newField(8, [], cfg);
    expect(crystalDrain(f, 10, 5)).toBe(f);
    f = damageGate(f, 'sul', 1e6);
    f = crystalDrain(f, 100, 1e6);
    expect(warOutcome(f, 100, cfg, false).state).toBe('derrota');
    const ok = newField(8, [], cfg);
    expect(warOutcome(ok, 2280, cfg, true)).toEqual({ state: 'vitoria', glorious: true });
  });

  it('placar limita o dano impossível e só alistados com dano mínimo ganham prêmio', () => {
    expect(plausibleDamage(1e9, 10, 1500)).toBeLessThan(1e9);
    let s = scheduleWar(emptyWar(cfg), T0, 60_000);
    s = enlist(enlist(s, 'a', T0).state, 'b', T0 + 1).state;
    const board = { a: 5000, b: 100, z: 99999 };
    expect(ranking(board, s).map((r) => r.id)).toEqual(['a', 'b']);
    const r = warRewards({ state: 'vitoria', glorious: false }, board, s, cfg);
    expect(r.titleTo).toBe('a');
    expect(r.eligible).toEqual(['a']);
    expect(warRewards({ state: 'derrota' }, board, s, cfg).globalBuff).toBeNull();
  });

  it('a guerra acaba: derrota leva à reconstrução; a meta escala com os jogadores', () => {
    let s = startWar(scheduleWar(emptyWar(cfg), T0, 1000), T0 + 5000, cfg);
    expect(s.phase).toBe('guerra');
    s = finishWar(s, { state: 'derrota' }, T0 + 9e6, cfg);
    expect(s.phase).toBe('reconstrucao');
    const g = rebuildGoalFor({ crystals: 10, lumes: 1000, materials: [{ label: 'x', qty: 10 }] }, 40);
    expect(g.crystals).toBe(20);
  });

  it('a configuração do Admin é limitada', () => {
    expect(resolveWar({ killTrigger: -5, durationMin: 9999 }).durationMin).toBe(180);
    expect(resolveWar({}).killTrigger).toBe(30_000);
  });
});
