import { describe, it, expect } from 'vitest';
import {
  ASTER_GATE, CITY_R, CRATERS, DEAD_CRYSTALS, DEFAULT_CITY_LAYOUT, GATE_IDS, LABYRINTH_WALLS, OUT_ARRIVAL, OUT_R, OUT_WALL_R, REFUGE_BIOME, ROAD_W,
  TRENCH_RINGS, WORLD_FALLBACK_BIOMES, WORLD_R, WORLD_SEED, WORLD_WALK_R, cityArrival, makeCompanionWorld, outskirtsGatePoint, outskirtsHeight, outskirtsPlaceName,
  ringAt, roadDistance, safeAssetUrl, sanitizeCityLayout, visibleIn,
} from '../rules/index.ts';

describe('Estrada para Áster no Companion World', () => {
  const cw = makeCompanionWorld(WORLD_SEED, [REFUGE_BIOME, ...WORLD_FALLBACK_BIOMES.slice(1)]);
  const gate = cw.sites.find((s) => s.gate === 'aster')!;
  it('fica fixa o mais longe possível do Portal do Refúgio, mas onde o Companion consegue chegar', () => {
    expect(gate).toBeDefined();
    expect(gate.name).toBe(ASTER_GATE.name);
    expect([gate.x, gate.z]).toEqual([ASTER_GATE.x, ASTER_GATE.z]);
    const r = Math.hypot(gate.x, gate.z);
    expect(r).toBeLessThan(WORLD_WALK_R - 4);        // dá para pisar no portal
    expect(r).toBeGreaterThan(WORLD_WALK_R - 15);    // e quase na borda do que se anda
    expect(Math.max(Math.abs(gate.x), Math.abs(gate.z))).toBeLessThan(WORLD_R - 25); // longe dos morros
  });
  it('tem chão plano em volta, trilha e nenhuma planta em cima', () => {
    const y0 = cw.heightAt(gate.x, gate.z);
    for (const [dx, dz] of [[3, 0], [0, 3], [-3, 0], [0, -3]]) expect(Math.abs(cw.heightAt(gate.x + dx, gate.z + dz) - y0)).toBeLessThan(0.15);
    expect(cw.roads.some(([a, b]) => a === gate || b === gate)).toBe(true);
    const cx = Math.floor(gate.x / 16), cz = Math.floor(gate.z / 16);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      for (const spots of cw.chunkSpots(cx + dx, cz + dz).values()) for (const s of spots) expect(Math.hypot(s.x - gate.x, s.z - gate.z)).toBeGreaterThan(5);
  });
});

describe('Arredores de Áster', () => {
  it('anéis e setores dão nome ao lugar', () => {
    expect(ringAt(0, 0)).toBe('cidade');
    expect(ringAt(0, -(OUT_WALL_R + 10))).toBe('labirinto');
    expect(ringAt(TRENCH_RINGS[0], 0)).toBe('trincheiras');
    expect(ringAt(0, 200)).toBe('campos');
    expect(outskirtsPlaceName(0, -200)).toBe('Campos Cinzentos · Setor Norte');
    expect(outskirtsPlaceName(200, 10)).toBe('Campos Cinzentos · Setor Leste');
  });
  it('as quatro estradas ficam livres do portão até a borda (sem labirinto, cratera ou cristal em cima)', () => {
    for (const w of LABYRINTH_WALLS) expect(roadDistance(w.x, w.z)).toBeGreaterThan(ROAD_W);
    for (const c of CRATERS) expect(roadDistance(c.x, c.z)).toBeGreaterThan(ROAD_W + c.r);
    for (const c of DEAD_CRYSTALS) expect(roadDistance(c.x, c.z)).toBeGreaterThan(ROAD_W);
    // pela estrada não tem degrau: as trincheiras têm ponte
    for (const g of GATE_IDS) {
      const a = outskirtsGatePoint(g, 2), b = outskirtsGatePoint(g, OUT_R - OUT_WALL_R - 30);
      let prev = outskirtsHeight(a.x, a.z);
      for (let t = 0.02; t <= 1; t += 0.02) {
        const y = outskirtsHeight(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        expect(Math.abs(y - prev)).toBeLessThan(0.6);
        prev = y;
      }
    }
  });
  it('trincheiras são fundas, crateras e cristais mortos existem, a chegada é plana', () => {
    const r = TRENCH_RINGS[0], a = 0.7;
    expect(outskirtsHeight(Math.cos(a) * r, Math.sin(a) * r)).toBeLessThan(outskirtsHeight(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8)) - 1);
    expect(CRATERS.length).toBeGreaterThan(40);
    expect(DEAD_CRYSTALS.length).toBeGreaterThan(80);
    expect(Math.abs(outskirtsHeight(OUT_ARRIVAL.x, OUT_ARRIVAL.z))).toBeLessThan(0.1);
  });
});

describe('Layout da cidade (Estúdio da Cidade)', () => {
  it('só aceita modelos por https ou do próprio site', () => {
    expect(safeAssetUrl('https://x.supabase.co/storage/v1/object/public/world-assets/city/aster/a.glb')).toContain('https://');
    expect(safeAssetUrl('/assets/refuge/pedra.glb')).toBe('/assets/refuge/pedra.glb');
    for (const bad of ['javascript:alert(1)', 'http://x.com/a.glb', '//x.com/a.glb', 'data:model/gltf-binary,abc', 'https://u:p@x.com/a.glb']) expect(safeAssetUrl(bad)).toBeNull();
  });
  it('limpa o que veio do banco e sempre deixa as quatro saídas', () => {
    const l = sanitizeCityLayout({
      pieces: [
        { id: 'a', url: 'https://x.co/a.glb', x: 9999, scale: -3, show: 'destruida', solid: 2 },
        { id: 'a', url: 'https://x.co/b.glb' },
        { id: 'c', url: 'javascript:alert(1)' },
      ],
      markers: [{ kind: 'loja', name: 'Empório', x: 5, z: 5 }, { kind: 'portao', gate: 'norte', x: 0, z: -50 }, { kind: 'hack', x: 1 }],
    });
    expect(l.pieces).toHaveLength(2);
    expect(l.pieces[0]).toMatchObject({ x: 400, scale: 0.01, show: 'destruida', solid: 2 });
    expect(new Set(l.pieces.map((p) => p.id)).size).toBe(2);
    expect(l.markers.filter((m) => m.kind === 'portao').map((m) => m.gate).sort()).toEqual([...GATE_IDS].sort());
    expect(l.markers.some((m) => m.kind === 'loja' && m.name === 'Empório')).toBe(true);
    expect(sanitizeCityLayout(null).markers.filter((m) => m.kind === 'portao')).toHaveLength(4);
  });
  it('estados e chegada', () => {
    expect(visibleIn('ambos', 'destruida')).toBe(true);
    expect(visibleIn('normal', 'destruida')).toBe(false);
    for (const g of GATE_IDS) { const p = cityArrival(DEFAULT_CITY_LAYOUT, g); expect(Math.hypot(p.x, p.z)).toBeLessThan(CITY_R - 2); }
  });
});
