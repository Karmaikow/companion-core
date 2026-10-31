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
