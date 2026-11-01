import { describe, it, expect } from 'vitest';
import { pulseTimes, gradeOf, scoreTune, cleanTune, COMPANION_TUNE, TUNE_MAX_BONUS, TUNE_WINDOW } from '../rules/ecosTune';
import { NODE_KINDS, VALE_NODES, rollGather, bandRank, type PropKey } from '../rules/ecos';

describe('afinar o eco', () => {
  it('três pulsos espalhados pela coleta, com respiro no começo e no fim', () => {
    expect(pulseTimes(8)).toEqual([2000, 4000, 6000]);
  });

  it('dá a nota pelo quanto o toque passou do momento certo', () => {
    expect(gradeOf(0)).toBe('perfeito');
    expect(gradeOf(-TUNE_WINDOW.perfeito)).toBe('perfeito');
    expect(gradeOf(TUNE_WINDOW.perfeito + 1)).toBe('bom');
    expect(gradeOf(TUNE_WINDOW.bom + 1)).toBe('fora');
    expect(gradeOf(null)).toBe('fora');
  });

  it('eco puro soma o bônus máximo; errar não tira nada', () => {
    expect(scoreTune([0, 10, -20])).toMatchObject({ pure: true, bonus: TUNE_MAX_BONUS });
    expect(scoreTune([null, null, null]).bonus).toBe(0);
    expect(scoreTune(COMPANION_TUNE).grades).toEqual(['bom', 'bom', 'bom']);
  });

  it('saneia o que vem do cliente', () => {
    expect(cleanTune([0, 'x', 99999, 1, 2])).toEqual([0, null, 2000]);
    expect(cleanTune('nada')).toEqual([]);
  });

  it('com o eco afinado o material nunca sai pior, e às vezes sobe de faixa', () => {
    let better = 0;
    for (const node of VALE_NODES) {
      const ap = NODE_KINDS[node.kind].approaches[0];
      for (let i = 0; i < 15; i++) {
        const plain = rollGather(node, ap, 'r' + i), tuned = rollGather(node, ap, 'r' + i, TUNE_MAX_BONUS);
        plain.forEach((b, j) => {
          const t = tuned[j]; if (!t || t.material !== b.material) return;
          for (const k of Object.keys(b.bands) as PropKey[]) {
            expect(bandRank(t.bands[k])).toBeGreaterThanOrEqual(bandRank(b.bands[k]));
            if (bandRank(t.bands[k]) > bandRank(b.bands[k])) better++;
          }
        });
      }
    }
    expect(better).toBeGreaterThan(0);
  });
});
