import { describe, it, expect } from 'vitest';
import {
  makeCompanionWorld, worldBiomeList, WORLD_SEED, REFUGE_BIOME, WORLD_FALLBACK_BIOMES, CHUNK, WORLD_WALK_R,
  chunkResources, worldNodeById, worldNodeKind, nodesNear, nodeAvailable, sanitizeBiome, sanitizeBiomeResources, DEFAULT_BIOME_RESOURCES,
  nodeKindOf, superiorBlockFor, NODE_KINDS, type BiomeConfig,
} from '../rules/index';

const world = (biomes: BiomeConfig[] = []) => makeCompanionWorld(WORLD_SEED, worldBiomeList(biomes));

describe('recursos espalhados pelo mundo', () => {
  it('nascem em todo o mundo, com ids únicos e determinísticos', () => {
    const w = world(), ids = new Set<string>();
    let total = 0;
    for (let cz = -12; cz <= 12; cz += 3) for (let cx = -12; cx <= 12; cx += 3) {
      const a = chunkResources(w, cx, cz), b = chunkResources(makeCompanionWorld(WORLD_SEED, worldBiomeList([])), cx, cz);
      expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
      for (const n of a) {
        expect(ids.has(n.id)).toBe(false); ids.add(n.id);
        expect(n.kind in NODE_KINDS).toBe(true);
        expect(Math.floor(n.x / CHUNK)).toBe(cx); expect(Math.floor(n.z / CHUNK)).toBe(cz);
        expect(Math.hypot(n.x, n.z)).toBeLessThan(WORLD_WALK_R);
        total++;
      }
    }
    expect(total).toBeGreaterThan(60);
    // longe do Vale de antes também
    expect(nodesNear(w, 120, -90, 40).length).toBeGreaterThan(3);
  });

  it('o servidor reencontra o recurso pelo id; ids inventados não existem', () => {
    const w = world();
    const n = nodesNear(w, 40, 40, 30)[0];
    expect(worldNodeById(w, n.id)).toMatchObject({ x: n.x, z: n.z, kind: n.kind });
    expect(worldNodeById(w, n.kind + '@0,0#99')).toBeNull();
    expect(worldNodeById(w, 'dragao@1,1#0')).toBeNull();
    expect(worldNodeKind(n.id)).toBe(n.kind);
    expect(nodeKindOf(n.id)).toBe(n.kind);
  });

  it('o bioma decide o que nasce: tabela própria troca a padrão', () => {
    const only = sanitizeBiome({ ...REFUGE_BIOME, slug: 'pedreira', settings: { ...REFUGE_BIOME.settings, kind: 'world', resources: [{ kind: 'granito', density: 2, time: 'sempre', weather: [], terrain: 'qualquer' }] } });
    const others = WORLD_FALLBACK_BIOMES.slice(1).map((b) => ({ ...b, settings: { ...b.settings, resources: [] } }));
    const w = makeCompanionWorld(WORLD_SEED, worldBiomeList([{ ...REFUGE_BIOME, settings: { ...REFUGE_BIOME.settings, resources: [] } }, only, ...others]));
    const all = nodesNear(w, 0, 0, 280);
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((n) => n.kind === 'granito' && n.biome === 'pedreira')).toBe(true);
  });

  it('horário e clima escondem recursos', () => {
    const n = { id: 'pedra-inscrita@1,1#0', kind: 'pedra-inscrita', x: 0, z: 0, biome: 'x', time: 'noite' as const, weather: [] };
    expect(nodeAvailable(n, { night: true, weatherOf: () => 'limpo' })).toBe(true);
    expect(nodeAvailable(n, { night: false, weatherOf: () => 'limpo' })).toBe(false);
    const rain = { ...n, time: 'sempre' as const, weather: ['chuva' as const] };
    expect(nodeAvailable(rain, { night: false, weatherOf: () => 'chuva' })).toBe(true);
    expect(nodeAvailable(rain, { night: false, weatherOf: () => 'sol' })).toBe(false);
  });

  it('saneia a tabela do Admin', () => {
    expect(sanitizeBiomeResources([{ kind: 'erva', density: 99, time: 'x', weather: ['chuva', 'lava'], terrain: '?' }, { kind: 'erva' }, { kind: 'dragao' }]))
      .toEqual([{ kind: 'erva', density: 3, time: 'sempre', weather: ['chuva'], terrain: 'qualquer' }]);
    expect(sanitizeBiomeResources('nada')).toBeUndefined();
    expect(sanitizeBiome({ slug: 'a', settings: {} }).settings.resources).toBeUndefined();
    expect(DEFAULT_BIOME_RESOURCES.every((r) => r.kind in NODE_KINDS)).toBe(true);
  });

  it('fonte superior do mundo continua restrita à classe', () => {
    expect(superiorBlockFor('liquen-dos-ventos@2,2#0', 'felino')).toMatch(/só/);
    expect(superiorBlockFor('liquen-dos-ventos@2,2#0', 'passaro')).toBeNull();
    expect(superiorBlockFor('erva@2,2#0', 'felino')).toBeNull();
  });
});
