import { describe, it, expect } from 'vitest';
import { REFINES, refineById, refineBands, autoPickRefine, checkRefine, batchKey, parseBatchKey, MATERIALS, sanitizeCityLayout, CRAFTABLES, recipeName, type MaterialBatch } from '../rules/index';

const lot = (material: string, bands: Record<string, string>, qty: number): MaterialBatch => { const key = batchKey(material, bands as never); return { key, qty, ...parseBatchKey(key)! }; };

describe('refino da Casa dos Ecos', () => {
  it('toda receita de refino aponta para materiais que existem', () => {
    for (const r of REFINES) {
      expect(MATERIALS[r.to]).toBeTruthy();
      expect(MATERIALS[r.to].rarity).toBe(3);
      for (const f of r.from) expect(MATERIALS[f]).toBeTruthy();
    }
  });

  it('a qualidade do refinado é a média do que entrou', () => {
    const r = refineById('lingote-de-cobre')!;
    expect(refineBands(r, [{ material: 'minerio-cobre', bands: { pureza: 'alta' }, qty: 30 }])).toEqual({ pureza: 'alta' });
    expect(refineBands(r, [{ material: 'minerio-cobre', bands: { pureza: 'alta' }, qty: 10 }, { material: 'minerio-cobre', bands: { pureza: 'baixa' }, qty: 20 }])).toEqual({ pureza: 'media' });
  });

  it('escolhe os melhores ou os mais comuns primeiro, e só com quantidade suficiente', () => {
    const r = refineById('extrato-de-orvalho')!;
    const bag = [lot('erva-orvalho-folha', { potencia: 'baixa', estabilidade: 'alta' }, 20), lot('erva-orvalho-raiz', { potencia: 'alta', estabilidade: 'alta' }, 15), lot('pedra-granito', { resistencia: 'alta' }, 40)];
    expect(autoPickRefine(r, bag, 30, 'melhores')![0]).toMatchObject({ qty: 15 });
    expect(autoPickRefine(r, bag, 30, 'comuns')![0]).toMatchObject({ qty: 20 });
    expect(autoPickRefine(r, bag, 40)).toBeNull();
  });

  it('o servidor confere quantidade, material e posse', () => {
    const r = refineById('tabua-nobre')!;
    const bag = [lot('madeira-carvalho', { flexibilidade: 'baixa', resistencia: 'alta' }, 30), lot('pedra-seixo', { resistencia: 'media' }, 30)];
    const ok = checkRefine(r, [{ key: bag[0].key, qty: 30 }], bag, 30);
    expect(ok.ok && parseBatchKey(ok.give.key)).toMatchObject({ material: 'tabua-nobre', bands: { flexibilidade: 'baixa', resistencia: 'alta' } });
    expect(checkRefine(r, [{ key: bag[0].key, qty: 29 }], bag, 30).ok).toBe(false);
    expect(checkRefine(r, [{ key: bag[1].key, qty: 30 }], bag, 30).ok).toBe(false);
    expect(checkRefine(r, [{ key: bag[0].key, qty: 20 }, { key: bag[0].key, qty: 20 }], bag, 40).ok).toBe(false);
    expect(checkRefine(null, [], bag, 30).ok).toBe(false);
  });

  it('a cidade sempre tem a Casa dos Ecos e os refinos contam nas missões', () => {
    expect(sanitizeCityLayout({}).markers.some((m) => m.kind === 'ecos')).toBe(true);
    const moved = sanitizeCityLayout({ markers: [{ id: 'casa', kind: 'ecos', name: 'Casa dos Ecos', x: 5, z: 5 }] });
    expect(moved.markers.filter((m) => m.kind === 'ecos')).toHaveLength(1);
    expect(CRAFTABLES).toContain('lingote-de-cobre');
    expect(recipeName('lingote-de-cobre')).toMatch(/Lingote/);
  });
});
