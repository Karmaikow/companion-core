import { describe, it, expect } from 'vitest';
import { DEFAULT_ITEMS, DEFAULT_CREATURES, forgeCheck, canForge, sanitizeItem, equip, validateEquipped, equipmentBonus, basicAttack, bowShot, ITEM_TYPES, BOW_MAX_CHARGE, animKind } from '../rules/index.ts';

const by = (s: string) => DEFAULT_ITEMS.find((i) => i.slug === s)!;

describe('forja', () => {
  it('só Taurina forja; confere vínculo e ingredientes', () => {
    expect(canForge('touro')).toBe(true); expect(canForge('felino')).toBe(false);
    const arco = by('arco-curto');
    expect(forgeCheck(arco, { species: 'felino', bond: 9, materials: {} })[0]).toContain('Taurina');
    const falta = forgeCheck(arco, { species: 'touro', bond: 3, materials: { 'Pelo gelado': 1 } });
    expect(falta).toContain('Pelo gelado: 1/3');
    expect(forgeCheck(arco, { species: 'touro', bond: 3, materials: { 'Pelo gelado': 3, 'Musgo macio': 2, 'Fragmento de Bruma': 3 } })).toEqual([]);
  });
  it('todo ingrediente das receitas vem de algum monstro', () => {
    const drops = new Set(DEFAULT_CREATURES.flatMap((c) => c.drops.map((d) => d.item)));
    for (const it of DEFAULT_ITEMS) for (const g of it.recipe.ingredients) expect(drops.has(g.item)).toBe(true);
    expect(DEFAULT_ITEMS.every((i) => !i.starter)).toBe(true);
  });
});

describe('equipamento', () => {
  it('catálogo inicial válido, um tipo por espaço certo', () => {
    expect(new Set(DEFAULT_ITEMS.map((i) => i.slug)).size).toBe(DEFAULT_ITEMS.length);
    for (const i of DEFAULT_ITEMS) expect(sanitizeItem(i)).toEqual(i);
  });
  it('arma de duas mãos tira a mão secundária e vice-versa', () => {
    let e = equip({}, by('espada-de-madeira'), DEFAULT_ITEMS);
    e = equip(e, by('escudo-de-folha'), DEFAULT_ITEMS);
    expect(e).toEqual({ mainhand: 'espada-de-madeira', offhand: 'escudo-de-folha' });
    e = equip(e, by('arco-curto'), DEFAULT_ITEMS);
    expect(e).toEqual({ mainhand: 'arco-curto' });
    e = equip(e, by('aljava-de-couro'), DEFAULT_ITEMS);
    e = equip(e, by('orbe-de-luz'), DEFAULT_ITEMS);
    expect(e).toEqual({ cape: 'aljava-de-couro', offhand: 'orbe-de-luz' });
  });
  it('valida conjunto salvo e soma bônus com raridade', () => {
    const owned = new Set(['adaga-de-cristal', 'escudo-de-folha']);
    const v = validateEquipped({ weapon: 'adaga-de-cristal', head: 'escudo-de-folha', accessory: 'amuleto-do-vinculo' }, DEFAULT_ITEMS, (s) => owned.has(s));
    expect(v).toEqual({ mainhand: 'adaga-de-cristal' });
    expect(equipmentBonus(v, DEFAULT_ITEMS)).toEqual({ agilidade: 11 }); // 5% × rara (2,2)
  });
  it('golpe básico pela arma e afinidade da classe', () => {
    expect(basicAttack(null).label).toBe('Desarmado');
    expect(basicAttack(by('maca-de-pedra'), 'touro').power).toBeCloseTo(1.45 * 1.05);
    expect(basicAttack(by('maca-de-pedra'), 'felino').affinity).toBe(1);
    expect(basicAttack(by('cajado-de-galho')).anim).toBe('cast');
    expect(basicAttack(by('arco-curto')).ranged).toBe('charged');
  });
  it('arco: mais carga = mais longe, mais forte e mais rápido; carga perfeita dá bônus', () => {
    const fraco = bowShot(0.1), meio = bowShot(0.8), cheio = bowShot(BOW_MAX_CHARGE);
    expect(fraco.charge).toBe(0);
    expect(fraco.range).toBeLessThan(meio.range); expect(meio.range).toBeLessThan(cheio.range);
    expect(fraco.power).toBeLessThan(meio.power); expect(meio.power).toBeLessThan(cheio.power);
    expect(cheio.perfect).toBe(true); expect(cheio.range).toBe(16); expect(cheio.power).toBe(2.25);
    expect(bowShot(99).charge).toBe(1);
  });
  it('tipos novos de animação pelo nome do arquivo', () => {
    expect(animKind('mayuna_magia.glb')).toBe('cast');
    expect(animKind('atirar_fogo')).toBe('cast');
    expect(animKind('mayuna_arco.glb')).toBe('shoot');
    expect(animKind('levantando')).toBe('getup');
    expect(animKind('mayuna_desmaiado.glb')).toBe('faint');
    expect(animKind('sentado')).toBe('sit');
    expect(animKind('waving hand')).toBe('wave');
    expect(animKind('esquiva')).toBe('dodge');
    expect(ITEM_TYPES.arco.weapon?.twoHanded).toBe(true);
  });
});

describe('nomes das animações do Tripo (Mayuna humana)', () => {
  it('cada clipe cai no tipo certo', async () => {
    const { animKind, attackVariant } = await import('../rules/index.ts');
    const cases: [string, string | null][] = [
      ['quick double dagger stab forward, light agile stance, short.001', 'attack'], ['run.001', 'run'], ['cast_a_spell.001', 'cast'],
      ['depressed.001', null], ['sentado nochão com as pernas cruzadasblocking with both arms r', 'block'],
      ['Movimento de puchando a linha de um arco e flecha.001', 'shoot'], ['complain_01.001', 'talk'], ['fall.001', 'faint'], ['idle.001', 'idle'],
      ['cute anime character diagonal sword slash with one hand, small ', 'attack'], ['jump_down.001', 'jump'], ['sentado nochão com as pernas cruzadas.001', 'sit'],
      ['walk.001', 'walk'], ['dig.001', 'pickup'], ['hit_to_stomach.001', 'hurt'], ['Pegando algo do chão.001', 'pickup'],
      ['drawing a bow and aiming, pulling the string to the cheek.001', 'shoot'],
    ];
    for (const [n, k] of cases) expect([n, animKind(n)]).toEqual([n, k]);
    expect(attackVariant('quick double dagger stab forward')).toBe('faca');
    expect(attackVariant('cute anime character diagonal sword slash')).toBe('espada');
  });
});
