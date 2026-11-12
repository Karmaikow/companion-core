import { describe, it, expect } from 'vitest';
import {
  CADENCE_SEED, COMBO_FINISHERS, WEAPON_TECHNIQUES, cadenceAdvance, cadenceLabel, cadenceNext, cadenceOrder, cadencesFor, cadenceTokenOfSlot,
  generateCadences, usableCadences, type CadenceToken, type WeaponKind,
} from '../rules/index';

const WEAPONS = [...new Set(WEAPON_TECHNIQUES.map((t) => t.weapon!))] as WeaponKind[];

describe('cadências', () => {
  it('toda técnica de toda arma ganha uma sequência única, bem formada e que começa com o golpe básico', () => {
    for (const w of WEAPONS) {
      const order = cadenceOrder(w), list = cadencesFor(w);
      expect(list.map((c) => c.slug)).toEqual(order);
      expect(new Set(list.map((c) => c.seq.join())).size).toBe(list.length);
      for (const c of list) {
        expect(c.seq[0]).toBe('B');
        expect(c.seq.length).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < c.seq.length; i++) expect(c.seq[i] === 'B' && c.seq[i - 1] === 'B').toBe(false);
        const hs = c.seq.filter((t) => t !== 'B');
        expect(new Set(hs).size).toBe(hs.length); // cada habilidade no máximo uma vez (recarga)
      }
    }
  });

  it('as primeiras são raízes de 3 toques (B → habilidade → B) e as seguintes continuam uma que já existe', () => {
    for (const w of WEAPONS) {
      const list = cadencesFor(w), bySlug = new Map(list.map((c) => [c.slug, c]));
      const roots = list.filter((c) => c.parent === null);
      expect(roots.length).toBeGreaterThanOrEqual(2);
      for (const r of roots) { expect(r.seq.length).toBe(3); expect(r.seq[2]).toBe('B'); expect(r.seq[1]).not.toBe('B'); }
      expect(new Set(roots.map((r) => r.seq[1])).size).toBe(roots.length);
      for (const c of list.filter((x) => x.parent)) {
        const p = bySlug.get(c.parent!)!;
        expect(c.seq.slice(0, p.seq.length)).toEqual(p.seq);
        expect(c.seq.length).toBe(p.seq.length + 2);
        expect(c.depth).toBe(p.depth + 1);
      }
    }
  });

  it('a mesma semente dá as mesmas sequências; outra semente embaralha', () => {
    const a = cadencesFor('espada'), b = cadencesFor('espada', [], CADENCE_SEED);
    expect(a).toEqual(b);
    const others = ['x', 'y', 'z', 'outra', '2'].map((s) => cadencesFor('espada', [], s).map((c) => c.seq.join()).join('|'));
    expect(others.some((o) => o !== a.map((c) => c.seq.join()).join('|'))).toBe(true);
  });

  it('o finalizador que sai só com golpes básicos fica fora; os outros entram depois das técnicas', () => {
    const order = cadenceOrder('espada');
    expect(order).not.toContain('espada-corte-duplo');
    expect(order).toContain('espada-lancador');
    const firstFin = order.findIndex((s) => COMBO_FINISHERS.some((f) => f.slug === s));
    expect(order.slice(0, firstFin).every((s) => WEAPON_TECHNIQUES.some((t) => t.slug === s))).toBe(true);
  });

  it('uma técnica da Forja entra na ordem pelo vínculo e não muda as sequências das raízes', () => {
    const forged = { ...WEAPON_TECHNIQUES.find((t) => t.slug === 'espada-estocada')!, slug: 'espada-nova', name: 'Nova', unlockBond: 99 };
    const order = cadenceOrder('espada', [forged]);
    expect(order).toContain('espada-nova');
    expect(order.indexOf('espada-nova')).toBeGreaterThan(order.indexOf('espada-investida-da-lamina'));
  });

  it('tocar a sequência fecha a técnica; dá para emendar na continuação', () => {
    const list = cadencesFor('espada');
    const child = list.find((c) => c.parent)!, parent = list.find((c) => c.slug === child.parent)!;
    let h: CadenceToken[] = [];
    const fired: string[] = [];
    for (const t of child.seq) { const s = cadenceAdvance(h, t, list); h = s.history; if (s.done) fired.push(s.done.slug); }
    expect(fired).toContain(parent.slug);
    expect(fired[fired.length - 1]).toBe(child.slug);
  });

  it('errar não trava: a história encolhe até o maior final que ainda começa uma cadência', () => {
    const list = cadencesFor('espada'), root = list[0];
    let s = cadenceAdvance([], 'H1', list);
    expect(s.history).toEqual([]);
    s = cadenceAdvance(['B'], 'B', list);
    expect(s.history).toEqual(['B']);
    // toque errado no meio e depois a sequência certa: fecha mesmo assim
    let h: CadenceToken[] = ['B'];
    for (const t of root.seq) { s = cadenceAdvance(h, t, list); h = s.history; }
    expect(s.done?.slug).toBe(root.slug);
  });

  it('acende o que continua: depois do primeiro básico, as habilidades das raízes', () => {
    const list = cadencesFor('arco');
    const next = cadenceNext(['B'], list).map((n) => n.token);
    expect(next.length).toBeGreaterThan(0);
    expect(next.every((t) => t !== 'B')).toBe(true);
    expect(cadenceNext([], list)).toEqual([]);
  });

  it('só valem as cadências de técnicas abertas, e a continuação precisa da anterior', () => {
    const list = cadencesFor('espada');
    const child = list.find((c) => c.parent)!;
    expect(usableCadences(list, new Set([child.slug])).length).toBe(0);
    expect(usableCadences(list, new Set([child.slug, child.parent!])).map((c) => c.slug).sort()).toEqual([child.slug, child.parent!].sort());
    // com as cadências que sobraram, a que não está aberta não fecha
    const open = usableCadences(list, new Set([list[0].slug]));
    let h: CadenceToken[] = [], done: string | null = null;
    for (const t of list[1].seq) { const s = cadenceAdvance(h, t, open); h = s.history; if (s.done) done = s.done.slug; }
    expect(done).toBe(null);
  });

  it('só os três primeiros espaços da barra são toques; o texto da sequência é legível', () => {
    expect(cadenceTokenOfSlot(0)).toBe('H1');
    expect(cadenceTokenOfSlot(2)).toBe('H3');
    expect(cadenceTokenOfSlot(3)).toBe(null);
    expect(cadenceLabel(['B', 'H1', 'B'])).toBe('Básico → Hab. 1 → Básico');
    expect(generateCadences('espada', []).length).toBe(0);
  });
});
