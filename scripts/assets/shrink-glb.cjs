// Reduz as texturas JPEG de dentro de um .glb (os modelos do Tripo vêm com uma textura de 2048 px por parte) e grava
// um .glb novo. Uso: node scripts/assets/shrink-glb.cjs entrada.glb saida.glb [max=1024]
// As imagens saem para uma pasta temporária, o resize-jpg.ps1 (System.Drawing, Windows) reduz, e o binário é remontado
// com os bufferViews no lugar (alinhados em 4 bytes).
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const [src, dst, maxArg] = process.argv.slice(2);
if (!src || !dst) { console.error('uso: node shrink-glb.cjs entrada.glb saida.glb [max]'); process.exit(1); }
const b = fs.readFileSync(src);
const jsonLen = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8, bin = b.slice(binStart, binStart + b.readUInt32LE(20 + jsonLen));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-'));
const imgViews = new Map();
(j.images || []).forEach((im, i) => {
  if (im.bufferView === undefined || im.mimeType !== 'image/jpeg') return;
  const v = j.bufferViews[im.bufferView], f = path.join(tmp, `img${i}.jpg`);
  fs.writeFileSync(f, bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
  imgViews.set(im.bufferView, f);
});
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'resize-jpg.ps1'), '-Dir', tmp, '-Max', String(Number(maxArg) || 1024)], { stdio: 'inherit' });
const parts = [];
let off = 0;
j.bufferViews.forEach((v, i) => {
  const data = imgViews.has(i) ? fs.readFileSync(imgViews.get(i)) : bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const pad = (4 - (off % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  v.byteOffset = off; v.byteLength = data.length;
  parts.push(data); off += data.length;
});
let newBin = Buffer.concat(parts);
if (newBin.length % 4) newBin = Buffer.concat([newBin, Buffer.alloc(4 - (newBin.length % 4))]);
j.buffers[0].byteLength = newBin.length;
let json = Buffer.from(JSON.stringify(j));
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + newBin.length, 8);
const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
fs.writeFileSync(dst, Buffer.concat([head, ch(json.length, 0x4e4f534a), json, ch(newBin.length, 0x004e4942), newBin]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${path.basename(src)}: ${(b.length / 1048576).toFixed(1)} MB -> ${(fs.statSync(dst).size / 1048576).toFixed(1)} MB`);
