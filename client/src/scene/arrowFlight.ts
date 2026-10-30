/** Visual arrow flight is fixed at release, rather than following each terrain sample. */
export interface ArrowPath {
  x: number; z: number; startY: number; endY: number;
  yaw: number; range: number; lift: number;
}
export function makeArrowPath(origin: { x: number; y: number; z: number }, yaw: number, range: number, endGroundY: number): ArrowPath {
  const distance = Math.max(0.001, range);
  return { x: origin.x, z: origin.z, startY: origin.y + 0.6, endY: endGroundY + 0.6, yaw, range: distance, lift: Math.min(0.25, distance * 0.02) };
}
export function sampleArrowPath(path: ArrowPath, distance: number) {
  const u = Math.max(0, Math.min(1, distance / path.range));
  const dx = Math.sin(path.yaw), dz = Math.cos(path.yaw);
  return {
    x: path.x + dx * path.range * u,
    y: path.startY + (path.endY - path.startY) * u + 4 * path.lift * u * (1 - u),
    z: path.z + dz * path.range * u,
    dx, dz, dy: (path.endY - path.startY + 4 * path.lift * (1 - 2*u)) / path.range,
  };
}

/** Stop at the first ground crossing; do not snap the projectile up onto a hillside. */
export function arrowGroundHit(path: ArrowPath, from: number, to: number, heightAt: (x: number, z: number) => number) {
  let low = Math.max(0, Math.min(path.range, from));
  const end = Math.max(low, Math.min(path.range, to));
  const blocked = (distance: number) => { const p = sampleArrowPath(path, distance); return p.y <= heightAt(p.x, p.z) + 0.02; };
  if (blocked(low)) return sampleArrowPath(path, low);
  for (let step = 1; step <= 4; step++) {
    let high = from + (end - from) * step / 4;
    if (!blocked(high)) { low = high; continue; }
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      if (blocked(mid)) high = mid; else low = mid;
    }
    return sampleArrowPath(path, high);
  }
  return null;
}
