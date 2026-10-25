import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ITEMS, ITEM_TYPES, slotsFor, equip, unequip, validateEquipped, normalizeEquipped, equipmentBonus, elementSets, carryCapacity, loadState,
  findItem, dropKey, bagEntries, sanitizeItem, categoryOf, type ItemDef,
} from '../rules/index.ts';

const cat = DEFAULT_ITEMS;
const by = (slug: string) => cat.find((i) => i.slug === slug)!;

describe('itens: tipos e espaços', () => {
  it('toda categoria tem tipos e todo tipo de arma ocupa a mão direita', () => {
    const cats = new Set(Object.keys(ITEM_TYPES).map((t) => categoryOf(t as keyof typeof ITEM_TYPES)));
    expect([...cats].sort()).toEqual(['arma', 'diversos', 'equipamento', 'material']);
    for (const [t, i] of Object.entries(ITEM_TYPES)) if (i.weapon) expect(slotsFor(t as keyof typeof ITEM_TYPES)[0]).toBe('mainhand');
  });
  it('arma de uma mão pode ir na esquerda; duas mãos não; acessório nos dois espaços; material não veste', () => {
    expect(slotsFor('faca')).toEqual(['mainhand', 'offhand']);
    expect(slotsFor('arco')).toEqual(['mainhand']);
    expect(slotsFor('anel')).toEqual(['acc1', 'acc2']);
    expect(slotsFor('madeira')).toEqual([]);
  });
  it('equipar: duas armas de uma mão, duas mãos tira a esquerda, mesmo item não fica em dois espaços', () => {
    let e = equip({}, by('espada-de-madeira'), cat);
    e = equip(e, by('adaga-de-cristal'), cat, 'offhand');
    expect(e).toEqual({ mainhand: 'espada-de-madeira', offhand: 'adaga-de-cristal' });
    e = equip(e, by('arco-curto'), cat);
    expect(e).toEqual({ mainhand: 'arco-curto' });
    e = equip(e, by('escudo-de-folha'), cat);
    expect(e).toEqual({ offhand: 'escudo-de-folha' });
    e = equip(e, by('anel-de-brasa'), cat); e = equip(e, by('amuleto-do-vinculo'), cat);
    expect(e.acc1).toBe('anel-de-brasa'); expect(e.acc2).toBe('amuleto-do-vinculo');
    e = equip(e, by('anel-de-brasa'), cat, 'acc2');
    expect(e.acc1).toBeUndefined(); expect(e.acc2).toBe('anel-de-brasa');
    expect(unequip(e, 'acc2').acc2).toBeUndefined();
  });
  it('conjunto salvo com os nomes antigos continua valendo', () => {
    expect(normalizeEquipped({ weapon: 'a', back: 'b', accessory: 'c', head: 'd', lixo: 'x' })).toEqual({ mainhand: 'a', cape: 'b', acc1: 'c', head: 'd' });
    const e = validateEquipped({ weapon: 'espada-de-madeira', back: 'mochila-de-viagem', offhand: 'nao-existe' }, cat, () => true);
    expect(e).toEqual({ mainhand: 'espada-de-madeira', cape: 'mochila-de-viagem' });
    expect(validateEquipped({ weapon: 'espada-de-madeira' }, cat, () => false)).toEqual({});
  });
});

describe('itens: conjuntos de elemento', () => {
  const fire = (slug: string, type: keyof typeof ITEM_TYPES): ItemDef => sanitizeItem({ ...by('espada-de-madeira'), slug, type, essence: 'fogo', stats: {} })!;
  const list = [...cat, fire('f-chapeu', 'chapeu'), fire('f-arm', 'armadura'), fire('f-botas', 'botas'), fire('f-capa', 'capa'), fire('f-espada', 'espada'), fire('f-anel', 'anel')];
  it('2 peças dão o primeiro degrau, 4 o segundo, 6 o terceiro', () => {
    let e = equip(equip({}, by('f-chapeu' as never) ?? list.find((i) => i.slug === 'f-chapeu')!, list), list.find((i) => i.slug === 'f-arm')!, list);
    expect(elementSets(e, list)[0]).toMatchObject({ element: 'fogo', pieces: 2, tier: 1, next: 4 });
    expect(equipmentBonus(e, list).poder).toBe(4);
    for (const s of ['f-botas', 'f-capa']) e = equip(e, list.find((i) => i.slug === s)!, list);
    expect(equipmentBonus(e, list).poder).toBe(10);
    for (const s of ['f-espada', 'f-anel']) e = equip(e, list.find((i) => i.slug === s)!, list);
    expect(elementSets(e, list)[0].tier).toBe(3);
    expect(equipmentBonus(e, list).poder).toBe(18);
  });
});

describe('itens: peso', () => {
  it('capacidade cresce com Força e Vitalidade e com a mochila', () => {
    expect(carryCapacity({})).toBe(30);
    expect(carryCapacity({ forca: 10, vitalidade: 5 })).toBe(55);
    expect(carryCapacity({}, { cape: 'mochila-de-viagem' }, cat)).toBe(45);
  });
  it('carga: leve, pesado e sobrecarregado', () => {
    expect(loadState(30, 30).level).toBe('leve');
    expect(loadState(40, 30)).toMatchObject({ level: 'pesado', moveMul: 0.8, agilityPct: -10 });
    expect(loadState(50, 30)).toMatchObject({ level: 'sobrecarregado', moveMul: 0.55 });
  });
  it('item sem peso usa o padrão do tipo; peso fora do limite é cortado', () => {
    expect(sanitizeItem({ slug: 'x-item', type: 'armadura' })!.weight).toBe(8);
    expect(sanitizeItem({ slug: 'x-item', type: 'anel', weight: 9999 })!.weight).toBe(500);
  });
});

describe('itens: bolsa', () => {
  it('drop pelo nome vira o item do catálogo; nome desconhecido vira material avulso', () => {
    expect(findItem('pelo gelado', cat)?.slug).toBe('pelo-gelado');
    expect(dropKey('Fragmento de Bruma', cat)).toBe('fragmento-de-bruma');
    expect(dropKey('Dente de lobo', cat)).toBe('drop:Dente de lobo');
    const e = bagEntries([{ item_key: 'pelo-gelado', qty: 3, meta: {} }, { item_key: 'drop:Dente de lobo', qty: 2, meta: {} }, { item_key: 'pena-dourada', qty: 1, meta: { label: 'Pena dourada', rare: true } }, { item_key: 'vazio', qty: 0, meta: {} }], cat);
    expect(e.map((x) => [x.label, x.category, x.unitWeight])).toEqual([['Pelo gelado', 'material', 0.3], ['Dente de lobo', 'material', 0.2], ['Pena dourada', 'diversos', 0]]);
  });
});
