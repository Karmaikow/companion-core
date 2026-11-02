// glTF (+ .bin + texturas) -> .glb único, com as texturas reduzidas de tex/ e sem os mapas de relevo (normal).
// Uso: node pack.cjs <pasta glTF> <pasta tex> <saída>
const fs = require('fs'), path = require('path');
const [src, texDir, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const pad4 = (n) => (n + 3) & ~3;

function texFile(uri) {
  const base = path.basename(uri, '.png');
  for (const ext of ['.jpg', '.png']) { const f = path.join(texDir, base + ext); if (fs.existsSync(f)) return { file: f, mime: ext === '.jpg' ? 'image/jpeg' : 'image/png' }; }
  throw new Error('textura não encontrada: ' + uri);
}

const report = [];
for (const name of fs.readdirSync(src).filter((f) => f.endsWith('.gltf'))) {
  const j = JSON.parse(fs.readFileSync(path.join(src, name), 'utf8'));
  const bin = fs.readFileSync(path.join(src, j.buffers[0].uri));
  // sem mapas de relevo: tira normalTexture dos materiais
  for (const m of j.materials ?? []) delete m.normalTexture;
  // texturas e imagens ainda usadas, renumeradas
  const usedTex = new Set();
  const visit = (o) => { if (o && typeof o === 'object') { if (typeof o.index === 'number' && ('texCoord' in o || Object.keys(o).length <= 3)) usedTex.add(o.index); for (const v of Object.values(o)) visit(v); } };
  for (const m of j.materials ?? []) visit(m);
  const texMap = new Map(), imgMap = new Map(), textures = [], images = [];
  let chunks = [bin], offset = pad4(bin.length);
  const views = [...j.bufferViews];
  [...usedTex].sort((a, b) => a - b).forEach((ti) => {
    const t = j.textures[ti];
    if (!imgMap.has(t.source)) {
      const { file, mime } = texFile(j.images[t.source].uri);
      const data = fs.readFileSync(file);
      chunks.push(Buffer.alloc(offset - (chunks.reduce((a, c) => a + c.length, 0)))); // alinhamento
      views.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
      chunks.push(data); offset = pad4(offset + data.length);
      imgMap.set(t.source, images.length);
      images.push({ bufferView: views.length - 1, mimeType: mime, name: path.basename(file) });
    }
    texMap.set(ti, textures.length);
    textures.push({ ...t, source: imgMap.get(t.source) });
  });
  // renumera as referências de textura nos materiais; casca/pedra (JPEG) ficam opacas
  const remap = (o) => { if (o && typeof o === 'object') { if (typeof o.index === 'number' && texMap.has(o.index) && ('texCoord' in o || Object.keys(o).length <= 3)) o.index = texMap.get(o.index); for (const v of Object.values(o)) remap(v); } };
  for (const m of j.materials ?? []) {
    remap(m);
    const bc = m.pbrMetallicRoughness?.baseColorTexture;
    if (bc && images[textures[bc.index].source].mimeType === 'image/jpeg') { delete m.alphaMode; delete m.alphaCutoff; }
  }
  const body = Buffer.concat(chunks);
  const total = pad4(body.length);
  j.bufferViews = views; j.textures = textures; j.images = images;
  j.buffers = [{ byteLength: total }];
  if (!textures.length) { delete j.textures; delete j.images; delete j.samplers; }
  const json = Buffer.from(JSON.stringify(j));
  const jsonLen = pad4(json.length);
  const glb = Buffer.alloc(12 + 8 + jsonLen + 8 + total);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonLen, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20); glb.fill(0x20, 20 + json.length, 20 + jsonLen);
  const b0 = 20 + jsonLen;
  glb.writeUInt32LE(total, b0); glb.writeUInt32LE(0x004e4942, b0 + 4); body.copy(glb, b0 + 8);
  const outName = path.basename(name, '.gltf') + '.glb';
  fs.writeFileSync(path.join(out, outName), glb);
  report.push(`${outName}\t${Math.round(glb.length / 1024)} KB\t${images.map((i) => i.name).join(', ')}`);
}
console.log(report.join('\n'));
