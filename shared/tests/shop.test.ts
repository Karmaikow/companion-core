import { describe, expect, it } from 'vitest';
import {
  SHOP_GOODS, goodById, goodByKey, goodsOf, shopKey, buyCheck, bagSellPrice, valeSellPrice, rollLumes, SELL_RATE,
  blueprintById, DEFAULT_ITEMS, sanitizeCreature, DEFAULT_CREATURES, sanitizeCityLayout, batchKey,
} from '../rules/index.ts';

describe('Lojas de Áster', () => {
  it('estoque fixo: poções e comidas na Loja de Poções, as três ferramentas na de Equipamentos', () => {
    expect(goodsOf('pocoes').every((g) => g.kind === 'consumivel' && g.effect)).toBe(true);
    expect(goodsOf('equipamentos').map((g) => g.tool).sort()).toEqual(['faca', 'machado', 'picareta']);
    expect(goodsOf('rotacao')).toHaveLength(0);
    for (const g of SHOP_GOODS.filter((x) => x.kind === 'ferramenta')) expect(blueprintById(g.blueprint!)?.tool).toBe(g.tool);
    expect(new Set(SHOP_GOODS.map((g) => g.id)).size).toBe(SHOP_GOODS.length);
  });

  it('compra: preço, quantidade e ferramenta uma por vez', () => {
    const p = goodById('pocao-vida-p')!, t = goodById('machado-simples')!;
    expect(buyCheck(p, 2, 30)).toBeNull();
    expect(buyCheck(p, 3, 30)).toMatch(/insuficientes/);
    expect(buyCheck(p, 0, 999)).not.toBeNull();
    expect(buyCheck(t, 2, 9999)).toMatch(/uma por vez/);
    expect(buyCheck(null, 1, 999)).not.toBeNull();
    expect(goodByKey(shopKey('pao-de-mel'))?.name).toBe('Pão de Mel');
  });

  it('venda: consumível a 40%, drops pela raridade, raros e armas não', () => {
    const p = goodById('pocao-vida-m')!;
    expect(bagSellPrice(shopKey(p.id), {}, DEFAULT_ITEMS)).toBe(Math.floor(p.price * SELL_RATE));
    expect(bagSellPrice('musgo-macio', {}, DEFAULT_ITEMS)).toBe(2);
    expect(bagSellPrice('drop:Cristal de geada', {}, DEFAULT_ITEMS)).toBe(12);
    expect(bagSellPrice('drop:coisa estranha', {}, DEFAULT_ITEMS)).toBe(1);
    expect(bagSellPrice('espada-de-madeira', {}, DEFAULT_ITEMS)).toBeNull();
    expect(bagSellPrice('pena-da-lua', { rare: true }, DEFAULT_ITEMS)).toBeNull();
  });

  it('venda da mochila do Vale: raridade × qualidade', () => {
    const low = valeSellPrice(batchKey('minerio-cobre', { pureza: 'baixa' }))!, high = valeSellPrice(batchKey('minerio-cobre', { pureza: 'alta' }))!;
    expect(high).toBeGreaterThan(low);
    expect(valeSellPrice(batchKey('quartzo-azul', { integridade: 'media' }))!).toBeGreaterThan(high);
    expect(valeSellPrice('nao-existe')).toBeNull();
  });

  it('lumes dos monstros: intervalo do Invocador, +10% por nível; padrão 1–3', () => {
    expect(rollLumes([2, 2], 1, () => 0)).toBe(2);
    expect(rollLumes([10, 10], 11, () => 0.5)).toBe(20);
    expect(rollLumes([0, 0], 30, () => 0.9)).toBe(0);
    expect(DEFAULT_CREATURES[0].lumes).toEqual([1, 3]);
    expect(sanitizeCreature({ ...DEFAULT_CREATURES[0], lumes: [9, 4] })!.lumes).toEqual([4, 9]);
  });

  it('marcador de loja guarda o tipo (padrão Poções)', () => {
    const l = sanitizeCityLayout({ markers: [{ id: 'a', kind: 'loja', name: 'X', x: 1, z: 2, shop: 'equipamentos' }, { id: 'b', kind: 'loja', name: 'Y', x: 3, z: 4, shop: 'hack' }] });
    expect(l.markers.find((m) => m.id === 'a')?.shop).toBe('equipamentos');
    expect(l.markers.find((m) => m.id === 'b')?.shop).toBe('pocoes');
  });
});

describe('configuração das lojas (ADM)', async () => {
  const { DEFAULT_SHOP, resolveShop, shopListing, entryBuyCheck, materialsTake, bagSellPrice, batchKey } = await import('../rules');
  const merc = (id: string, o: Record<string, unknown> = {}) => ({ id, shop: 'rotacao', ref: { kind: 'loja', good: 'pocao-vida-p' }, price: 10, maxBuy: 5, enabled: true, stock: 3, weight: 1, school: null, materials: [], ...o });
  it('sem nada salvo vale o estoque padrão; lixo é descartado', () => {
    expect(resolveShop(undefined)).toEqual(DEFAULT_SHOP);
    const c = resolveShop({ entries: [merc('a'), { id: 'x', shop: 'nada' }, merc('a')], rotationPerDay: 99 });
    expect(c.entries.map((e) => e.id)).toEqual(['a', 'a-2']);
    expect(c.rotationPerDay).toBe(30);
  });
  it('Mercadão: sorteio do dia é estável e respeita o peso 0', () => {
    const c = resolveShop({ rotationPerDay: 2, entries: [merc('a'), merc('b'), merc('c'), merc('d', { weight: 0 })] });
    const d1 = shopListing(c, 'rotacao', '2026-11-01').map((e) => e.id);
    expect(d1).toHaveLength(2);
    expect(shopListing(c, 'rotacao', '2026-11-01').map((e) => e.id)).toEqual(d1);
    for (const day of ['2026-11-02', '2026-11-03', '2026-11-04']) expect(shopListing(c, 'rotacao', day).some((e) => e.id === 'd')).toBe(false);
  });
  it('estoque, escola e materiais', () => {
    const e = resolveShop({ entries: [merc('a', { school: 'veneno', materials: [{ material: 'erva-orvalho-folha', qty: 2 }] })] }).entries[0];
    const bag = [{ key: batchKey('erva-orvalho-folha', { potencia: 'alta', estabilidade: 'alta' }), qty: 3 }];
    expect(entryBuyCheck(e, 1, { lumes: 100, sold: 3, schools: ['veneno'], bag })).toMatch(/Esgotado/);
    expect(entryBuyCheck(e, 1, { lumes: 100, sold: 0, schools: [], bag })).toMatch(/Escola do Veneno/);
    expect(entryBuyCheck(e, 2, { lumes: 100, sold: 0, schools: ['veneno'], bag })).toMatch(/Faltam/);
    expect(entryBuyCheck(e, 1, { lumes: 100, sold: 0, schools: ['veneno'], bag })).toBeNull();
    expect(materialsTake(e, 1, bag)).toEqual([{ key: bag[0].key, qty: 2 }]);
  });
  it('revenda segue o preço e a taxa do ADM', () => {
    const c = resolveShop({ sellRate: 0.5, entries: [{ ...merc('p', { shop: 'pocoes', stock: 0 }), price: 30 }] });
    expect(bagSellPrice('loja:pocao-vida-p', {}, [], c)).toBe(15);
  });
});
