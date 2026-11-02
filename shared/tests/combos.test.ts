import { describe, it, expect } from 'vitest';
import {
  COMBO_LINKS, COMBO_FINISHERS, COMBO_WINDOW, WEAPON_TECHNIQUES, comboTiming, findComboLink, comboNext, finisherBySlug,
  styleRank, styleAdd, styleDecay, styleHurt, STYLE_MAX, STYLE_IDLE, techniquesFor,
} from '../rules/index';

describe('combos', () => {
  it('a janela tem cedo, aberta, perfeita e fechada', () => {
    expect(comboTiming(0.05)).toBe('cedo');
    expect(comboTiming(COMBO_WINDOW.open + 0.01)).toBe('aberta');
    expect(comboTiming((COMBO_WINDOW.perfectFrom + COMBO_WINDOW.perfectTo) / 2)).toBe('perfeita');
    expect(comboTiming(COMBO_WINDOW.close + 0.01)).toBe('fechada');
  });

  it('todo elo aponta para um finalizador e parte de algo que existe', () => {
    const known = new Set([...WEAPON_TECHNIQUES, ...COMBO_FINISHERS].map((s) => s.slug).concat('basic'));
    for (const l of COMBO_LINKS) {
      expect(finisherBySlug(l.becomes)?.weapon).toBe(l.weapon);
      expect(known.has(l.from)).toBe(true);
      expect(known.has(l.press)).toBe(true);
    }
  });

  it('finalizadores não aparecem na barra', () => {
    const bar = techniquesFor([], 'espada', 'fogo', 99).map((s) => s.slug);
    for (const f of COMBO_FINISHERS) expect(bar).not.toContain(f.slug);
  });

  it('Estocada → Golpe Ascendente vira Lançador, e o Lançador encadeia o Redemoinho', () => {
    expect(findComboLink('espada-estocada', 'espada-golpe-ascendente', 'espada')?.becomes).toBe('espada-lancador');
    expect(findComboLink('espada-lancador', 'espada-corte-giratorio', 'espada')?.becomes).toBe('espada-redemoinho-aereo');
    expect(findComboLink('espada-estocada', 'espada-golpe-ascendente', 'arco')).toBeNull();
    expect(findComboLink(null, 'espada-golpe-ascendente', 'espada')).toBeNull();
  });

  it('Corte Duplo só no terceiro golpe básico', () => {
    expect(findComboLink('basic', 'basic', 'espada', 1)).toBeNull();
    expect(findComboLink('basic', 'basic', 'espada', 2)?.becomes).toBe('espada-corte-duplo');
    expect(comboNext('basic', 'espada', 2).map((l) => l.press)).toEqual(['basic']);
  });
});

describe('Estilo', () => {
  it('as notas sobem de D a S', () => {
    expect(styleRank(0).letter).toBe('D');
    expect(styleRank(STYLE_MAX).letter).toBe('S');
    expect(styleRank(70).damage).toBeGreaterThan(styleRank(0).damage);
  });
  it('soma com teto, escorre parado e cai ao apanhar', () => {
    expect(styleAdd(STYLE_MAX - 1, 50)).toBe(STYLE_MAX);
    expect(styleDecay(100, STYLE_IDLE - 0.1, 1)).toBe(100);
    expect(styleDecay(100, STYLE_IDLE + 0.1, 1)).toBeLessThan(100);
    expect(styleHurt(100)).toBeLessThan(100);
  });
});
