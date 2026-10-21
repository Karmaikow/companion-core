import { describe, it, expect } from 'vitest';
import { makeCompanionWorld, WORLD_SEED, WORLD_FALLBACK_BIOMES, REFUGE_BIOME, CHUNK, REGION, sanitizeBiome } from '../rules/index.ts';

const biomes = [REFUGE_BIOME, ...WORLD_FALLBACK_BIOMES.slice(1)];

describe('Companion World', () => {
  it('é determinístico pela seed', () => {
    const a = makeCompanionWorld(WORLD_SEED, biomes), b = makeCompanionWorld(WORLD_SEED, biomes);
    expect(a.sites.map((s) => [s.x, s.z, s.biome, s.name])).toEqual(b.sites.map((s) => [s.x, s.z, s.biome, s.name]));
    expect(a.heightAt(37.2, -81.5)).toBe(b.heightAt(37.2, -81.5));
    expect([...a.chunkSpots(3, -2).entries()]).toEqual([...b.chunkSpots(3, -2).entries()]);
  });
  it('o portal fica no bioma de casa, plano, e os vizinhos são outros biomas', () => {
    const w = makeCompanionWorld(WORLD_SEED, biomes);
    expect(w.regionAt(0, 0).site.home).toBe(true);
    expect(w.biomes[w.regionAt(0, 0).site.biome].slug).toBe('refugio');
    expect(Math.abs(w.heightAt(2, 2))).toBeLessThan(0.3);
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(w.siteAt(i, j)!.biome).not.toBe(w.siteAt(0, 0)!.biome);
  });
  it('as trilhas ligam todas as regiões', () => {
    const w = makeCompanionWorld(WORLD_SEED, biomes);
    const adj = new Map<string, string[]>();
    for (const [a, b] of w.roads) { const ka = a.i + ',' + a.j, kb = b.i + ',' + b.j; adj.set(ka, [...(adj.get(ka) ?? []), kb]); adj.set(kb, [...(adj.get(kb) ?? []), ka]); }
    const seen = new Set(['0,0']), stack = ['0,0'];
    while (stack.length) for (const n of adj.get(stack.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    expect(seen.size).toBe(w.sites.length);
    // o portal tem trilha saindo dele
    expect(w.dirtAt(REGION * 0.3, w.siteAt(1, 0)!.z * 0.3)).toBeGreaterThanOrEqual(0);
  });
  it('nomes de lugares não se repetem', () => {
    const w = makeCompanionWorld(WORLD_SEED, biomes);
    expect(new Set(w.sites.map((s) => s.name)).size).toBe(w.sites.length);
  });
  it('vegetação respeita a região, o portal e a densidade', () => {
    const w = makeCompanionWorld(WORLD_SEED, biomes);
    let trees = 0;
    for (let cz = -4; cz < 4; cz++) for (let cx = -4; cx < 4; cx++) for (const [key, spots] of w.chunkSpots(cx, cz)) {
      const slug = key.split('/')[0];
      for (const s of spots) {
        expect(s.x).toBeGreaterThanOrEqual(cx * CHUNK); expect(s.x).toBeLessThan((cx + 1) * CHUNK);
        expect(w.biomes[w.regionAt(s.x, s.z).site.biome].slug).toBe(slug);
        expect(Math.hypot(s.x, s.z)).toBeGreaterThan(5);
      }
      if (key.includes('arvore')) trees += spots.length;
    }
    expect(trees).toBeGreaterThan(10);
    expect(trees).toBeLessThan(1500);
  });
  it('biomas antigos (sem world/hills) entram no mundo com relevo padrão', () => {
    const b = sanitizeBiome({ slug: 'velho', name: 'Velho', settings: { grassBlades: 1, cliffs: true } });
    expect(b.settings.world).toBe(true);
    expect(b.settings.hills).toBe(1);
  });
});
