/**
 * Colisão pela malha dos prédios de Áster. Em vez de um círculo em volta do centro (que parava o Companion longe da
 * parede ou deixava ele afundar no piso), cada prédio vira uma grade de 20 cm medida no próprio modelo:
 *
 *  - **piso**: um raio desce de 1,5 m acima do chão em cada célula e acha a superfície mais alta (calçada, degraus,
 *    tablado da loja). O Companion sobe nela se o degrau for de até STEP; mais alto que isso (balcão, mesa, caixote)
 *    conta como obstáculo.
 *  - **paredes**: raios horizontais na altura do joelho e do peito varrem cada linha e cada coluna da grade; onde
 *    cruzam uma superfície, a célula é parede. (Um raio vertical não enxerga parede: ela fica de lado para ele.)
 *  - **por dentro**: o que tem telhado em cima e fica a mais de COVER_DEEP da calçada descoberta (contornando as
 *    paredes) é bloqueado — o modelo pode ser oco, e entrar nele deixava o Companion escondido sob o telhado.
 *
 * A medição usa BVH (three-mesh-bvh) e roda em pedaços entre os quadros, para não travar a entrada na cidade.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface MeshField {
  x0: number; z0: number; nx: number; nz: number;
  /** altura do piso (y do mundo) por célula; NaN = nada do modelo ali (vale o chão) */
  floor: Float32Array;
  /** 1 = parede (cruzada pelos raios horizontais) */
  wall: Uint8Array;
  /** chão da peça (y do mundo) */
  base: number;
}

export const CELL = 0.2;
/** degrau mais alto que o Companion sobe andando */
export const STEP = 0.5;
const PROBE = 1.5, SCAN = [0.85, 1.35];
/**
 * Piso andável vai até esta altura acima do chão da peça: acima disso é obstáculo mesmo que se chegue em degraus
 * pequenos (sem isso o Companion "subia" a parede por cima de molduras e beirais rasos).
 */
const MAX_FLOOR = 0.9;
/** até onde se anda debaixo de cobertura (toldo, beiral, varanda), medido da borda descoberta */
const COVER_DEEP = 2.0;

/** Grades prontas, por peça. */
export const meshFields = new Map<string, MeshField>();
/** Medições já feitas nesta sessão (voltar à cidade não mede de novo), pela peça e pela posição. */
const baked = new Map<string, MeshField>();
const bvhs = new WeakMap<THREE.BufferGeometry, MeshBVH>();

interface Part { bvh: MeshBVH; inv: THREE.Matrix4; m: THREE.Matrix4; box: THREE.Box3 }
const ray = new THREE.Ray(), local = new THREE.Ray(), pt = new THREE.Vector3();

/** Todos os pontos (mundo) onde o raio cruza a peça, nas duas faces. */
function hits(parts: Part[], o: THREE.Vector3, d: THREE.Vector3, far: number, out: THREE.Vector3[], first: boolean) {
  ray.set(o, d);
  for (const p of parts) {
    if (!ray.intersectsBox(p.box)) continue;
    local.copy(ray).applyMatrix4(p.inv);
    if (first) {
      const h = p.bvh.raycastFirst(local, THREE.DoubleSide);
      if (h) { pt.copy(h.point).applyMatrix4(p.m); if (pt.distanceTo(o) <= far) out.push(pt.clone()); }
    } else {
      for (const h of p.bvh.raycast(local, THREE.DoubleSide)) { pt.copy(h.point).applyMatrix4(p.m); if (pt.distanceTo(o) <= far) out.push(pt.clone()); }
    }
  }
}

const idle = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Mede a peça (já posicionada na cena) e publica a grade em `meshFields` com a chave `id`. `base`: altura do chão.
 * Devolve uma função que cancela/retira a grade.
 */
export function bakeMeshField(id: string, key: string, obj: THREE.Object3D, base: number): () => void {
  let alive = true;
  const ready = baked.get(key);
  if (ready) { meshFields.set(id, ready); return () => { meshFields.delete(id); }; }
  void (async () => {
    obj.updateWorldMatrix(true, true);
    const parts: Part[] = [], all = new THREE.Box3();
    const meshes: THREE.Mesh[] = [];
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && m.geometry?.attributes.position) meshes.push(m); });
    for (const m of meshes) {
      let bvh = bvhs.get(m.geometry);
      if (!bvh) { bvh = new MeshBVH(m.geometry); bvhs.set(m.geometry, bvh); await idle(); if (!alive) return; }
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const box = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      all.union(box);
      parts.push({ bvh, m: m.matrixWorld.clone(), inv: m.matrixWorld.clone().invert(), box });
    }
    if (!parts.length || all.isEmpty()) return;
    const x0 = all.min.x - CELL, z0 = all.min.z - CELL;
    const nx = Math.ceil((all.max.x + CELL - x0) / CELL), nz = Math.ceil((all.max.z + CELL - z0) / CELL);
    const f: MeshField = { x0, z0, nx, nz, floor: new Float32Array(nx * nz).fill(NaN), wall: new Uint8Array(nx * nz), base };
    const DOWN = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3(), found: THREE.Vector3[] = [];
    let t0 = performance.now();
    const breathe = async () => { if (performance.now() - t0 > 6) { await idle(); t0 = performance.now(); } return alive; };
    // piso: a superfície mais alta abaixo de PROBE em cada célula
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        found.length = 0;
        o.set(x0 + (ix + 0.5) * CELL, base + PROBE, z0 + (iz + 0.5) * CELL);
        hits(parts, o, DOWN, PROBE + 0.5, found, true);
        let top = -Infinity; for (const h of found) top = Math.max(top, h.y);
        if (top > -Infinity) f.floor[iz * nx + ix] = top;
      }
      if (!(await breathe())) return;
    }
    // paredes: varre linhas (ao longo de x) e colunas (ao longo de z) no joelho e no peito, medidos do piso de rua
    // só é parede o que fica de pé acima do piso daquela célula (o espelho de um degrau, rente ao piso, não é)
    const mark = (p: THREE.Vector3) => {
      const ix = Math.floor((p.x - x0) / CELL), iz = Math.floor((p.z - z0) / CELL);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return;
      const i = iz * nx + ix, fl = f.floor[i];
      if (Number.isNaN(fl) || p.y - fl > 0.3) f.wall[i] = 1;
    };
    const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1), lenX = nx * CELL + 2, lenZ = nz * CELL + 2;
    for (const h of SCAN) {
      for (let iz = 0; iz < nz; iz++) {
        found.length = 0; o.set(x0 - 1, base + h, z0 + (iz + 0.5) * CELL);
        hits(parts, o, AX, lenX, found, false); for (const p of found) mark(p);
        if (!(await breathe())) return;
      }
      for (let ix = 0; ix < nx; ix++) {
        found.length = 0; o.set(x0 + (ix + 0.5) * CELL, base + h, z0 - 1);
        hits(parts, o, AZ, lenZ, found, false); for (const p of found) mark(p);
        if (!(await breathe())) return;
      }
    }
    // por dentro: o modelo pode ser oco (com piso lá dentro) e ter a frente aberta. Debaixo de toldo e beiral dá para
    // ficar; o miolo coberto (mais de COVER_DEEP da borda descoberta) conta como parede — senão o Companion entra e
    // some sob o telhado.
    const covered = new Uint8Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix, fl = Number.isNaN(f.floor[i]) ? base : f.floor[i];
        found.length = 0;
        o.set(x0 + (ix + 0.5) * CELL, base + 80, z0 + (iz + 0.5) * CELL);
        hits(parts, o, DOWN, 90, found, true);
        if (found.some((h) => h.y > fl + 1.8)) covered[i] = 1;
      }
      if (!(await breathe())) return;
    }
    // distância (em células) até a célula descoberta mais perto
    const dist = new Int32Array(nx * nz).fill(-1), queue: number[] = [];
    // ponto de partida: piso andável a céu aberto (o topo de uma parede grossa não conta)
    for (let i = 0; i < nx * nz; i++) if (!covered[i] && !f.wall[i] && !(f.floor[i] > base + MAX_FLOOR)) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], ix = i % nx, iz = (i - ix) / nx;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const j = jz * nx + jx;
        // contorna paredes: só se chega ao miolo pelas aberturas de verdade
        if (dist[j] < 0 && !f.wall[j] && !(f.floor[j] > base + MAX_FLOOR)) { dist[j] = dist[i] + 1; queue.push(j); }
      }
    }
    const deep = Math.round(COVER_DEEP / CELL);
    for (let i = 0; i < nx * nz; i++) if (covered[i] && (dist[i] < 0 || dist[i] > deep)) f.wall[i] = 1;
    baked.set(key, f);
    if (alive) meshFields.set(id, f);
  })();
  return () => { alive = false; meshFields.delete(id); };
}

function cellOf(f: MeshField, x: number, z: number) {
  const ix = Math.floor((x - f.x0) / CELL), iz = Math.floor((z - f.z0) / CELL);
  return ix < 0 || iz < 0 || ix >= f.nx || iz >= f.nz ? -1 : iz * f.nx + ix;
}

/** Piso mais alto dos prédios em (x, z), ou null fora deles. */
export function fieldFloor(x: number, z: number): number | null {
  let y: number | null = null;
  meshFields.forEach((f) => { const i = cellOf(f, x, z), fl = i >= 0 ? f.floor[i] : NaN; if (!Number.isNaN(fl) && fl <= f.base + MAX_FLOOR) y = Math.max(y ?? -Infinity, fl); });
  return y;
}

/** O corpo (raio `body`) em (x, z) bate numa parede ou num degrau alto demais vindo do nível `level`? */
export function fieldBlocked(x: number, z: number, level: number, body: number): boolean {
  if (!meshFields.size) return false;
  const r = body * 0.85;
  const pts = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
  let hit = false;
  meshFields.forEach((f) => {
    if (hit) return;
    for (const [dx, dz] of pts) {
      const i = cellOf(f, x + dx, z + dz);
      if (i < 0) continue;
      const fl = f.floor[i];
      if (f.wall[i] || fl > level + STEP || fl > f.base + MAX_FLOOR) { hit = true; return; }
    }
  });
  return hit;
}

/**
 * Passo de `before` para `next` contra os prédios: se bater, tenta deslizar só em x ou só em z; senão fica.
 * Quem já está dentro de algo (nasceu ali) pode sair. Devolve true se encostou.
 */
export function slideFields(before: { x: number; z: number }, next: { x: number; z: number }, level: number, body: number): boolean {
  if (!meshFields.size || !fieldBlocked(next.x, next.z, level, body)) return false;
  if (fieldBlocked(before.x, before.z, level, body)) return false;
  if (!fieldBlocked(next.x, before.z, level, body)) { next.z = before.z; return true; }
  if (!fieldBlocked(before.x, next.z, level, body)) { next.x = before.x; return true; }
  next.x = before.x; next.z = before.z;
  return true;
}
