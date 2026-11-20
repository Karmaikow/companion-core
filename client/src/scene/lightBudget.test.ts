import { describe, expect, it } from 'vitest';
import { nearestRequests, LIGHT_BUDGET } from './lightBudget';

describe('orçamento de luzes', () => {
  it('as luzes vão para os pedidos mais perto do Companion', () => {
    const at = (x: number, z: number) => ({ at: { x, y: 0, z }, id: `${x},${z}` });
    const list = [at(30, 0), at(2, 0), at(0, 9), at(-1, 1), at(15, 15), at(4, 4)];
    expect(nearestRequests(list, { x: 0, y: 0, z: 0 }, 3).map((r) => r.id)).toEqual(['-1,1', '2,0', '4,4']);
  });
  it('com menos pedidos que luzes, devolve só os pedidos (as luzes que sobram ficam apagadas)', () => {
    expect(nearestRequests([{ at: { x: 1, y: 0, z: 1 } }], { x: 0, y: 0, z: 0 }, LIGHT_BUDGET.high)).toHaveLength(1);
  });
  it('o número de luzes de cada qualidade é fixo', () => {
    expect(LIGHT_BUDGET).toEqual({ high: 4, low: 2 });
  });
});
