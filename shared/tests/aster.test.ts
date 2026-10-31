import { describe, it, expect } from 'vitest';
import {
  ASTER_GATE, BRIDGE_DECKS, BRIDGE_HW, CITY_R, CRATERS, DEFAULT_CITY_WALL, GATES, MOAT_IN, MOAT_OUT, OUT_GATE_ARRIVE, WATER_Y, buildWall, bridgeSpan, gateAxisPoint, moatBand, onBridge, DEAD_CRYSTALS, DEFAULT_CITY_LAYOUT, GATE_IDS, LABYRINTH_WALLS, OUT_ARRIVAL, OUT_R, OUT_WALL_R, REFUGE_BIOME, ROAD_W,
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
    // pela estrada não tem degrau (do fim da ponte do fosso até a borda): as trincheiras têm ponte de terra
    for (const g of GATE_IDS) {
      const a = outskirtsGatePoint(g, OUT_GATE_ARRIVE), b = outskirtsGatePoint(g, OUT_R - OUT_WALL_R - 30);
      let prev = outskirtsHeight(a.x, a.z);
      for (let t = 0.02; t <= 1; t += 0.02) {
        const y = outskirtsHeight(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        expect(Math.abs(y - prev)).toBeLessThan(0.6);
        prev = y;
      }
    }
  });
  it('fosso de água em volta da muralha, com ponte em cada portão (por dentro e por fora)', () => {
    const mid = (MOAT_OUT[0] + MOAT_OUT[1]) / 2;
    expect(outskirtsHeight(Math.cos(0.7) * mid, Math.sin(0.7) * mid)).toBeLessThan(WATER_Y - 1);   // fundo abaixo da água
    expect(outskirtsHeight(Math.cos(0.7) * (MOAT_OUT[1] + 3), Math.sin(0.7) * (MOAT_OUT[1] + 3))).toBeGreaterThan(WATER_Y);
    // o labirinto não cai dentro do fosso
    for (const w of LABYRINTH_WALLS) expect(Math.hypot(w.x, w.z)).toBeGreaterThan(MOAT_OUT[1] + 2);
    for (const g of GATE_IDS) {
      // ponte de fora: do portão até depois do fosso; a chegada vinda da cidade é em terra firme
      for (let r = OUT_WALL_R; r <= MOAT_OUT[1]; r += 1) { const p = gateAxisPoint(g, r, 2); expect(onBridge(p.x, p.z, 'fora')).toBe(true); }
      const off = gateAxisPoint(g, mid, BRIDGE_HW + 1);
      expect(onBridge(off.x, off.z)).toBe(false);
      const arr = outskirtsGatePoint(g, OUT_GATE_ARRIVE);
      expect(moatBand(Math.hypot(arr.x, arr.z))).toBe(0);
      // ponte de dentro: começa logo depois do portal de dentro
      const inside = gateAxisPoint(g, MOAT_IN[0] + 1);
      expect(onBridge(inside.x, inside.z, 'dentro')).toBe(true);
      expect(Math.hypot(...Object.values(cityArrival(DEFAULT_CITY_LAYOUT, g)) as [number, number])).toBeLessThan(MOAT_IN[0]);
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
  it('monta a muralha por trechos: portões nos pontos cardeais, sem trecho na abertura, face de fora para fora', () => {
    const box = (sx: number, sy: number, sz: number, c: [number, number, number] = [0, 0, 0]) => ({ min: [c[0] - sx / 2, c[1] - sy / 2, c[2] - sz / 2] as [number, number, number], max: [c[0] + sx / 2, c[1] + sy / 2, c[2] + sz / 2] as [number, number, number] });
    const w = { ...DEFAULT_CITY_WALL, segment: '/a.glb', tower: '/t.glb', gate: '/g.glb', segmentBroken: '/q.glb' };
    // trecho com pivô no meio da caixa (comum em modelo gerado): a base tem que ir ao chão
    const parts = buildWall(w, { segment: box(10, 10, 3), tower: box(4, 16, 4), gate: box(20, 14, 6) });
    const gates = parts.filter((p) => p.wall === 'portao');
    expect(gates).toHaveLength(4);
    for (const g of GATE_IDS) {
      const p = gates.find((x) => x.id.endsWith(g))!;
      expect(p.x).toBeCloseTo(GATES[g].dx * OUT_WALL_R, 1); expect(p.z).toBeCloseTo(GATES[g].dz * OUT_WALL_R, 1);
    }
    const segs = parts.filter((p) => p.wall === 'trecho' && p.show !== 'destruida');
    expect(segs.length).toBeGreaterThanOrEqual(36);
    for (const p of segs) {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(OUT_WALL_R, 1);
      expect(p.y).toBeCloseTo(5);                                       // base no chão
      expect(roadDistance(p.x, p.z)).toBeGreaterThan(8);                 // fora da abertura do portão (20 m de largura)
      // o +Z do modelo aponta para fora (giro em Y: +Z → (sen θ, cos θ))
      expect(Math.sin(p.rot) * p.x + Math.cos(p.rot) * p.z).toBeGreaterThan(OUT_WALL_R * 0.99);
    }
    // sem fresta: o arco entre portões fica coberto pelos trechos de 10 m
    expect(segs.length * 10).toBeGreaterThanOrEqual(2 * Math.PI * OUT_WALL_R - 4 * 20 - 1);
    // a cidade destruída troca alguns trechos pelos quebrados
    const broken = parts.filter((p) => p.show === 'destruida');
    expect(broken.length).toBeGreaterThan(5);
    expect(parts.filter((p) => p.show === 'normal')).toHaveLength(broken.length);
    // 9 trechos entre cada par de portões, torre a cada 3 → 2 torres por quarto
    expect(parts.filter((p) => p.wall === 'torre' && p.show !== 'destruida')).toHaveLength(8);
    // modelo comprido no eixo Z e com pivô fora do centro: gira 90° e o centro ainda cai na linha
    const z = buildWall({ ...w, tower: null, gate: null, segmentBroken: null }, { segment: box(3, 8, 12, [5, 4, 2]) });
    for (const p of z) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      expect(Math.hypot(p.x + 5 * c + 2 * s, p.z - 5 * s + 2 * c)).toBeCloseTo(OUT_WALL_R, 1);
      expect(p.y).toBeCloseTo(0);
    }
    expect(sanitizeCityLayout({ pieces: parts, wall: w }).pieces.filter((p) => p.wall).length).toBe(parts.length);
    // ponte: 8 (4 portões × dentro/fora), comprida na direção do centro e esticada até cobrir o fosso
    const withBridge = buildWall({ ...w, bridge: '/p.glb' }, { segment: box(10, 10, 3), bridge: box(6, 2, 10) });
    const bridges = withBridge.filter((p) => p.wall === 'ponte');
    expect(bridges).toHaveLength(8);
    for (const p of bridges) {
      const deck = BRIDGE_DECKS.find((d) => p.id === `muro-ponte-${d.side}-${d.gate}`)!;
      const [from, to] = bridgeSpan(deck);
      expect(Math.hypot(p.x, p.z)).toBeCloseTo((from + to) / 2, 1);
      expect(p.scale * 10).toBeCloseTo(to - from, 1);
      // modelo comprido no Z: o +Z local aponta ao longo do raio (para fora ou para dentro)
      const along = Math.abs(Math.sin(p.rot) * p.x + Math.cos(p.rot) * p.z) / Math.hypot(p.x, p.z);
      expect(along).toBeCloseTo(1, 2);
    }
    expect(sanitizeCityLayout({ wall: { segment: 'javascript:x', towerEvery: 99 } }).wall).toMatchObject({ segment: null, towerEvery: 20 });
  });
  it('estados e chegada', () => {
    expect(visibleIn('ambos', 'destruida')).toBe(true);
    expect(visibleIn('normal', 'destruida')).toBe(false);
    for (const g of GATE_IDS) { const p = cityArrival(DEFAULT_CITY_LAYOUT, g); expect(Math.hypot(p.x, p.z)).toBeLessThan(CITY_R - 2); }
  });
});
