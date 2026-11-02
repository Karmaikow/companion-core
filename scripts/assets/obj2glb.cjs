// .obj + .mtl (só cores, sem textura) -> .glb. Uma parte (primitiva) por material; normais do arquivo ou planas.
// Uso: node obj2glb.cjs <pasta OBJ> <saída> [nomes...]
const fs = require('fs'), path = require('path');
const [src, out, ...only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const pad4 = (n) => (n + 3) & ~3;

function readMtl(file) {
  const mats = {}; let cur = null;
  if (!fs.existsSync(file)) return mats;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k === 'newmtl') { cur = v.join(' '); mats[cur] = { kd: [0.8, 0.8, 0.8], d: 1 }; }
    else if (cur && k === 'Kd') mats[cur].kd = v.slice(0, 3).map(Number);
    else if (cur && k === 'd') mats[cur].d = Number(v[0]);
  }
  return mats;
}

function convert(name) {
  const text = fs.readFileSync(path.join(src, name + '.obj'), 'utf8');
  const V = [], N = [];
  const groups = new Map(); let mat = 'Default', mtl = name + '.mtl';
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') V.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'vn') N.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'usemtl') mat = p.slice(1).join(' ');
    else if (p[0] === 'mtllib') mtl = p.slice(1).join(' ');
    else if (p[0] === 'f') {
      const idx = p.slice(1).map((t) => { const [v, , n] = t.split('/'); const vi = Number(v), ni = n ? Number(n) : 0; return [vi < 0 ? V.length + vi : vi - 1, ni ? (ni < 0 ? N.length + ni : ni - 1) : -1]; });
      if (!groups.has(mat)) groups.set(mat, []);
      const g = groups.get(mat);
      for (let i = 1; i + 1 < idx.length; i++) g.push(idx[0], idx[i], idx[i + 1]); // leque
    }
  }
  const mats = readMtl(path.join(src, path.basename(mtl)));
  const chunks = [], views = [], accessors = [], meshPrims = [], materials = [];
  let offset = 0;
  const add = (arr, target) => { const b = Buffer.from(new Float32Array(arr).buffer); chunks.push(b); const pad = pad4(b.length) - b.length; if (pad) chunks.push(Buffer.alloc(pad)); views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target }); offset += b.length + pad; return views.length - 1; };
  for (const [mname, tri] of groups) {
    const pos = [], nor = [];
    for (let i = 0; i < tri.length; i += 3) {
      const a = V[tri[i][0]], b = V[tri[i + 1][0]], c = V[tri[i + 2][0]];
      // normal plana (quando o .obj não traz)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const k of [0, 1, 2]) { const [vi, ni] = tri[i + k]; pos.push(...V[vi]); nor.push(...(ni >= 0 && N[ni] ? N[ni] : [nx, ny, nz])); }
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
    const pv = add(pos, 34962), nv = add(nor, 34962);
    accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
    accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    const m = mats[mname] ?? { kd: [0.8, 0.8, 0.8], d: 1 };
    const metal = /steel|metal|iron|gold|silver|blade/i.test(mname);
    materials.push({ name: mname, pbrMetallicRoughness: { baseColorFactor: [...m.kd, m.d], metallicFactor: metal ? 0.6 : 0, roughnessFactor: metal ? 0.45 : 0.8 }, ...(m.d < 1 ? { alphaMode: 'BLEND' } : {}) });
    meshPrims.push({ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: materials.length - 1 });
  }
  const body = Buffer.concat(chunks);
  const j = { asset: { version: '2.0', generator: 'companion-core obj2glb' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ name, primitives: meshPrims }], materials, accessors, bufferViews: views, buffers: [{ byteLength: body.length }] };
  const json = Buffer.from(JSON.stringify(j)), jl = pad4(json.length);
  const glb = Buffer.alloc(12 + 8 + jl + 8 + body.length);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jl, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20); glb.fill(0x20, 20 + json.length, 20 + jl);
  glb.writeUInt32LE(body.length, 20 + jl); glb.writeUInt32LE(0x004e4942, 24 + jl); body.copy(glb, 28 + jl);
  fs.writeFileSync(path.join(out, name + '.glb'), glb);
  return `${name}.glb\t${Math.round(glb.length / 1024)} KB\t${[...groups.keys()].join(', ')}`;
}

const names = only.length ? only : fs.readdirSync(src).filter((f) => f.endsWith('.obj') && !/\(\d+\)\.obj$/.test(f)).map((f) => path.basename(f, '.obj'));
console.log(names.map(convert).join('\n'));
