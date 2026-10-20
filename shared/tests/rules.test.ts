import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG as cfg, resolveConfig, computeTurnXp, levelForXp, xpForLevel, validateDiscovery, nextCuriosity,
  initialQuests, checkAwakening, buildIdentityContract, resolveColor, resolveForm, resolveElement, gameTime,
  REAL_MS_PER_GAME_DAY, similarity, derivePalette, traitTendencies, type QuestState,
} from '../rules/index.ts';

describe('vínculo e XP', () => {
  it('curva sem teto e monotônica', () => {
    let prev = -1;
    for (let l = 1; l < 200; l++) {
      const x = xpForLevel(l, cfg);
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
    expect(levelForXp(0, cfg)).toBe(1);
    expect(levelForXp(xpForLevel(5, cfg), cfg)).toBe(5);
    expect(levelForXp(xpForLevel(5, cfg) - 1, cfg)).toBe(4);
  });

  const base = { recentPlayerMessages: [], meaningfulToday: 0, modelSaysMeaningful: true, newDiscoveries: 0, newMemories: 0 };

  it('mensagem significativa gera XP', () => {
    const r = computeTurnXp({ ...base, message: 'Hoje eu fui ao mar e lembrei de você, a água estava linda' }, cfg);
    expect(r.parts.message).toBe(cfg.messageXp);
    expect(r.meaningful).toBe(true);
  });

  it('repetição não gera XP', () => {
    const msg = 'Hoje eu fui ao mar e lembrei de você, a água estava linda';
    const r = computeTurnXp({ ...base, message: msg + '!!', recentPlayerMessages: [msg] }, cfg);
    expect(r.parts.message).toBe(0);
    expect(r.reason).toBe('repetição');
  });

  it('elogio genérico repetido não gera XP', () => {
    expect(computeTurnXp({ ...base, message: 'você é muito linda' }, cfg).parts.message).toBe(0);
    expect(computeTurnXp({ ...base, message: 'te amo te amo' }, cfg).parts.message).toBe(0);
  });

  it('mensagens curtas não geram XP', () => {
    expect(computeTurnXp({ ...base, message: 'oi' }, cfg).total).toBe(0);
  });

  it('retorno decrescente ao longo do dia, e XP diário total é sublinear', () => {
    const early = computeTurnXp({ ...base, message: 'Me conta o que você sonhou essa noite?' }, cfg).parts.message;
    const late = computeTurnXp({ ...base, meaningfulToday: 200, message: 'Me conta o que você sonhou essa noite?' }, cfg).parts.message;
    expect(late).toBeLessThan(early);
    let total = 0;
    for (let i = 0; i < 1000; i++) total += Math.max(1, Math.round(cfg.messageXp / (1 + i / cfg.dailySoftCap)));
    expect(total).toBeLessThan(1000 * cfg.messageXp * 0.2);
  });

  it('descobertas e memórias somam, memórias limitadas por turno', () => {
    const r = computeTurnXp({ ...base, message: 'acho que seu nome deveria ser Lumi', newDiscoveries: 1, newMemories: 9 }, cfg);
    expect(r.parts.discoveries).toBe(cfg.discoveryXp);
    expect(r.parts.memories).toBe(cfg.maxMemoryXpPerTurn * cfg.memoryXp);
  });
});

describe('quests e descobertas', () => {
  const ctx = { bondLevel: 1, cfg };
  it('nome válido e inválido', () => {
    expect(validateDiscovery({ quest: 'identity', value: 'lumi' }, ctx)).toMatchObject({ ok: true, patch: { name: 'Lumi' } });
    expect(validateDiscovery({ quest: 'identity', value: 'ChatGPT' }, ctx).ok).toBe(false);
    expect(validateDiscovery({ quest: 'identity', value: '<script>' }, ctx).ok).toBe(false);
  });
  it('cor por nome e hex', () => {
    expect(resolveColor('azul claro')?.hex).toBe('#7fc4ff');
    expect(resolveColor('Azul')?.hex).toBe('#3f8cff');
    expect(resolveColor('#AABBCC')?.hex).toBe('#aabbcc');
    expect(validateDiscovery({ quest: 'color', value: 'xadrez' }, ctx).ok).toBe(false);
  });
  it('forma mapeia para família', () => {
    expect(resolveForm('uma raposa com asas')).toBe('felino');
    expect(resolveForm('Fênix')).toBe('passaro');
    expect(resolveForm('dragões')).toBe('serpente');
    expect(resolveForm('cadeira')).toBeNull();
  });
  it('elemento', () => {
    expect(resolveElement('acho que é a luz das estrelas')).toBe('luz');
    expect(resolveElement('água')).toBe('agua');
  });
  it('traços exigem ao menos dois', () => {
    expect(validateDiscovery({ quest: 'traits', value: ['curiosa'] }, ctx).ok).toBe(false);
    expect(validateDiscovery({ quest: 'traits', value: 'curiosa, gentil e corajosa' }, ctx)).toMatchObject({ ok: true });
  });
  it('primeiro laço exige nível de vínculo', () => {
    expect(validateDiscovery({ quest: 'bond', value: 'Di' }, ctx).ok).toBe(false);
    expect(validateDiscovery({ quest: 'bond', value: 'Di' }, { bondLevel: cfg.firstBondLevel, cfg }).ok).toBe(true);
  });
  it('próxima curiosidade segue a ordem', () => {
    const q = initialQuests();
    expect(nextCuriosity(q)?.key).toBe('identity');
    q[0].status = 'done';
    expect(nextCuriosity(q)?.key).toBe('color');
    expect(nextCuriosity(q.map((s) => ({ ...s, status: 'done' as const })))).toBeNull();
  });
});

describe('despertar e contrato de identidade', () => {
  const d = { name: 'Lumi', species: 'raposa alada', form: 'felino' as const, color: '#3f8cff', traits: ['curiosa', 'gentil'], element: 'luz' as const, playerAddress: 'Di', dream: 'Voar sobre as montanhas ao amanhecer' };
  const allDone: QuestState[] = initialQuests().map((q) => ({ ...q, status: 'done' }));
  it('exige 7 quests e vínculo 5', () => {
    expect(checkAwakening(allDone, d, 4, cfg).ready).toBe(false);
    expect(checkAwakening(allDone.slice(0, 6).concat({ key: 'dream', status: 'active' }), d, 5, cfg).ready).toBe(false);
    expect(checkAwakening(allDone, d, 5, cfg).ready).toBe(true);
  });
  it('valores configuráveis pelo administrador', () => {
    const c = resolveConfig({ awakeningBondLevel: 2, levelBase: -5 as number });
    expect(c.awakeningBondLevel).toBe(2);
    expect(c.levelBase).toBe(cfg.levelBase);
    expect(checkAwakening(allDone, d, 2, c).ready).toBe(true);
  });
  it('contrato determinístico e versionado', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    const a = buildIdentityContract('abc', d, 5, 'ela', now);
    const b = buildIdentityContract('abc', d, 5, 'ela', now);
    expect(a).toEqual(b);
    expect(a.version).toBe(1);
    expect(a.palette.primary).toBe('#3f8cff');
    expect(a.personality.tendencies.exploracao).toBeGreaterThan(0);
    expect(a.personality.tendencies.social).toBeGreaterThan(0);
  });
});

describe('utilidades', () => {
  it('relógio: 8h reais = 1 dia de jogo', () => {
    const epoch = 0;
    expect(gameTime(0, epoch).day).toBe(0);
    expect(gameTime(REAL_MS_PER_GAME_DAY, epoch).day).toBe(1);
    expect(gameTime(4 * 3600_000, epoch).hour).toBe(12);
  });
  it('similaridade', () => {
    expect(similarity('eu gosto de gatos azuis', 'eu gosto de gatos azuis!')).toBe(1);
    expect(similarity('eu gosto de gatos azuis', 'amanhã vou viajar para o sul')).toBe(0);
  });
  it('paleta válida', () => {
    const p = derivePalette('#3f8cff', 'fogo');
    for (const v of Object.values(p)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('tendências', () => {
    expect(traitTendencies(['tímida']).cautela).toBe(2);
  });
});
