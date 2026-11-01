import { describe, it, expect } from 'vitest';
import { cleanOffer, cleanWant, tradeValid, wantFits, pickForWant, checkPicks, offerText, wantText, tradeKind, batchKey } from '../rules/index';

const folha = (pot: string, est: string) => batchKey('erva-orvalho-folha', { potencia: pot, estabilidade: est } as never);

describe('mural de trocas', () => {
  it('saneia ofertas e pedidos', () => {
    expect(cleanOffer({ kind: 'lumes', qty: 50.4 })).toEqual({ kind: 'lumes', qty: 50 });
    expect(cleanOffer({ kind: 'lumes', qty: 0 })).toBeNull();
    expect(cleanOffer({ kind: 'material', key: 'lixo', qty: 3 })).toBeNull();
    expect(cleanOffer({ kind: 'material', key: folha('baixa', 'alta'), qty: 30 })).toMatchObject({ kind: 'material', qty: 30 });
    expect(cleanWant({ kind: 'material', material: 'erva-orvalho-folha', qty: 20, prop: 'estabilidade', min: 'alta' })).toEqual({ kind: 'material', material: 'erva-orvalho-folha', qty: 20, prop: 'estabilidade', min: 'alta' });
    expect(cleanWant({ kind: 'material', material: 'erva-orvalho-folha', qty: 2, prop: 'pureza', min: 'alta' })).toEqual({ kind: 'material', material: 'erva-orvalho-folha', qty: 2 });
    expect(cleanWant({ kind: 'material', material: 'dragao', qty: 2 })).toBeNull();
    expect(tradeValid(cleanOffer({ kind: 'lumes', qty: 5 }), cleanWant({ kind: 'lumes', qty: 6 }))).toBe(false);
  });

  it('confere o que quem aceita entrega', () => {
    const w = cleanWant({ kind: 'material', material: 'erva-orvalho-folha', qty: 5, prop: 'estabilidade', min: 'media' })!;
    expect(wantFits(w, folha('baixa', 'alta'))).toBe(true);
    expect(wantFits(w, folha('alta', 'baixa'))).toBe(false);
    const bag = [{ key: folha('alta', 'alta'), qty: 4 }, { key: folha('baixa', 'media'), qty: 3 }, { key: folha('alta', 'baixa'), qty: 10 }];
    const picks = pickForWant(w, bag)!;
    expect(picks[0]).toEqual({ key: folha('baixa', 'media'), qty: 3 });
    expect(picks.reduce((a, p) => a + p.qty, 0)).toBe(5);
    expect(pickForWant({ ...w, qty: 8 }, bag)).toBeNull();
    expect(checkPicks(w, picks)).not.toBeNull();
    expect(checkPicks(w, [{ key: folha('alta', 'baixa'), qty: 5 }])).toBeNull();
    expect(checkPicks(w, [{ key: folha('alta', 'alta'), qty: 4 }])).toBeNull();
  });

  it('descreve o pedido', () => {
    const o = cleanOffer({ kind: 'material', key: batchKey('madeira-carvalho', { flexibilidade: 'baixa', resistencia: 'alta' }), qty: 30 })!;
    const w = cleanWant({ kind: 'material', material: 'erva-orvalho-folha', qty: 20 })!;
    expect(offerText(o)).toMatch(/30× .*Carvalho/);
    expect(wantText(w)).toMatch(/20× .*Erva-de-orvalho/);
    expect(tradeKind(o, w)).toBe('troca');
    expect(tradeKind(o, { kind: 'lumes', qty: 10 })).toBe('venda');
    expect(tradeKind({ kind: 'lumes', qty: 10 }, w)).toBe('compra');
  });
});
