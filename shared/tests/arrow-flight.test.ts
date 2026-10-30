import { describe, expect, it } from 'vitest';
import { makeArrowPath, sampleArrowPath, arrowGroundHit } from '../../client/src/scene/arrowFlight';
import { bowShot } from '../rules/equipment';

describe('charged arrow trajectory', () => {
  it('keeps maximum-charge flight shallow and descending at the end on flat ground', () => {
    const shot = bowShot(10), path = makeArrowPath({ x: 0, y: 0, z: 0 }, 0, shot.range, 0);
    expect(path.lift).toBeLessThanOrEqual(0.25);
    const middle = sampleArrowPath(path, shot.range / 2), nearEnd = sampleArrowPath(path, shot.range * 0.9), end = sampleArrowPath(path, shot.range);
    expect(middle.y).toBeLessThanOrEqual(0.85);
    expect(end.y).toBeCloseTo(0.6);
    expect(nearEnd.y).toBeGreaterThan(end.y);
    expect(end.dy).toBeLessThan(0);
  });
  it('uses release height and fixed endpoint, with smooth slope rather than terrain-following jumps', () => {
    const path = makeArrowPath({ x: 2, y: 4, z: -3 }, Math.PI / 2, 8, 6);
    const start = sampleArrowPath(path, 0), end = sampleArrowPath(path, 8);
    expect(start).toMatchObject({ x: 2, y: 4.6, z: -3 });
    expect(end.x).toBeCloseTo(10);
    expect(end.y).toBeCloseTo(6.6);
    expect(end.z).toBeCloseTo(-3);
    expect(sampleArrowPath(path, 80)).toEqual(end);
  });
  it('aligns orientation tangent to the actual curve for low and high charge', () => {
    for (const held of [0, 0.8, 10]) {
      const shot = bowShot(held), path = makeArrowPath({ x: 0, y: 0, z: 0 }, 0.7, shot.range, 0);
      const d = shot.range * 0.8, h = 0.001;
      const p = sampleArrowPath(path, d), a = sampleArrowPath(path, d - h), b = sampleArrowPath(path, d + h);
      expect(p.dy).toBeCloseTo((b.y - a.y) / (2 * h), 6);
      expect(p.dx).toBeCloseTo((b.x - a.x) / (2 * h), 6);
      expect(p.dz).toBeCloseTo((b.z - a.z) / (2 * h), 6);
    }
  });
});

it('stops on a slope at the crossing rather than jumping to the terrain height', () => {
  const path = makeArrowPath({ x: 0, y: 0, z: 0 }, 0, 10, 0);
  const ground = (_x: number, z: number) => Math.max(0, (z - 4) * 10);
  const hit = arrowGroundHit(path, 3.5, 5, ground)!;
  expect(hit).not.toBeNull();
  expect(hit.z).toBeGreaterThan(4);
  expect(hit.z).toBeLessThan(4.1);
  expect(hit.y).toBeLessThan(0.85);
  expect(Math.abs(hit.y - ground(hit.x, hit.z) - 0.02)).toBeLessThan(0.002);
  expect(arrowGroundHit(path, 0, 3, () => 0)).toBeNull();
});
