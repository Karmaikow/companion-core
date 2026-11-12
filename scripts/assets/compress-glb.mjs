// Comprime os .glb de client/public SEM mudar o que aparece na tela:
//  - geometria, skins e animações: EXT_meshopt_compression sem quantização (os números decodificados são os mesmos
//    floats de antes; só a ordem dos vértices muda, para comprimir melhor);
//  - texturas: JPEG -> WebP (qualidade alta, mesma resolução), PNG -> WebP sem perdas. Só troca se ficar menor.
// Não reduz resolução de textura nem simplifica malha (isso muda o visual e precisa de aprovação).
//
// Depois de gravar, relê o arquivo e confere com o original: malhas, vértices, triângulos, caixa delimitadora, soma das
// posições, ossos (nomes e matrizes inversas) e animações (nomes, canais e todos os quadros). Se algo diferir, o
// arquivo original é mantido.
//
// Uso: node scripts/assets/compress-glb.mjs [--dry] [--quality=88] [pasta ou arquivo ...]   (padrão: client/public)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { reorder, getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const quality = Number((args.find((a) => a.startsWith('--quality=')) ?? '').split('=')[1]) || 88;
const targets = args.filter((a) => !a.startsWith('--'));
if (!targets.length) targets.push('client/public');

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const quiet = { debug() {}, info() {}, warn() {}, error(m) { console.error(m); } };

const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : /\.glb$/i.test(p) ? [p] : []);
const brotli = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }).length;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i] || (Number.isNaN(v) && Number.isNaN(b[i])));

/** Retrato do que importa para o jogo: se for igual antes e depois, o modelo é o mesmo. */
function fingerprint(doc) {
  const root = doc.getRoot();
  const meshes = root.listMeshes().map((m) => m.listPrimitives().map((p) => {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices();
    let sx = 0, sy = 0, sz = 0;
    const a = pos ? pos.getArray() : [];
    for (let i = 0; i < a.length; i += 3) { sx += a[i]; sy += a[i + 1]; sz += a[i + 2]; }
    return {
      attrs: p.listSemantics().sort().map((s) => `${s}:${p.getAttribute(s).getComponentType()}:${p.getAttribute(s).getType()}`).join(','),
      verts: pos ? pos.getCount() : 0, tris: idx ? idx.getCount() : 0, targets: p.listTargets().length,
      min: pos ? pos.getMin([]) : [], max: pos ? pos.getMax([]) : [], sum: [sx, sy, sz],
    };
  }));
  const skins = root.listSkins().map((s) => ({ joints: s.listJoints().map((j) => j.getName()), ibm: Array.from(s.getInverseBindMatrices()?.getArray() ?? []) }));
  const nodes = root.listNodes().map((n) => ({ name: n.getName(), trs: [...n.getTranslation(), ...n.getRotation(), ...n.getScale()] }));
  const anims = root.listAnimations().map((an) => ({
    name: an.getName(),
    ch: an.listChannels().map((c) => `${c.getTargetNode()?.getName()}/${c.getTargetPath()}/${c.getSampler()?.getInterpolation()}`),
    data: an.listChannels().map((c) => [c.getSampler().getInput().getArray(), c.getSampler().getOutput().getArray()]),
  }));
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const b = scene ? getBounds(scene) : { min: [], max: [] };
  return { meshes, skins, nodes, anims, bounds: [...b.min, ...b.max], materials: root.listMaterials().length, textures: root.listTextures().map((t) => (t.getSize() ?? []).join('x')) };
}

function diff(a, b) {
  const out = [];
  // Nó gravado como matriz volta como posição/rotação/escala: a diferença é de arredondamento (~1e-6), nada visível.
  if (a.nodes.length !== b.nodes.length || a.nodes.some((n, i) => n.name !== b.nodes[i].name || n.trs.some((v, k) => Math.abs(v - b.nodes[i].trs[k]) > 1e-5))) out.push('nós/transformações');
  if (a.materials !== b.materials) out.push('materiais');
  if (JSON.stringify(a.textures) !== JSON.stringify(b.textures)) out.push('resolução das texturas');
  if (!same(a.bounds, b.bounds)) out.push('caixa delimitadora');
  if (a.meshes.length !== b.meshes.length) out.push('nº de malhas');
  else a.meshes.forEach((prims, i) => prims.forEach((p, k) => {
    const q = b.meshes[i][k];
    if (!q || p.attrs !== q.attrs || p.verts !== q.verts || p.tris !== q.tris || p.targets !== q.targets) out.push(`malha ${i}.${k}: estrutura`);
    else if (!same(p.min, q.min) || !same(p.max, q.max)) out.push(`malha ${i}.${k}: limites`);
    else if (p.sum.some((v, n) => Math.abs(v - q.sum[n]) > 1e-3 * Math.max(1, Math.abs(v)))) out.push(`malha ${i}.${k}: posições`);
  }));
  if (a.skins.length !== b.skins.length) out.push('nº de skins');
  else a.skins.forEach((s, i) => { if (s.joints.join() !== b.skins[i].joints.join()) out.push(`skin ${i}: ossos`); if (!same(s.ibm, b.skins[i].ibm)) out.push(`skin ${i}: matrizes`); });
  if (a.anims.length !== b.anims.length) out.push('nº de animações');
  else a.anims.forEach((an, i) => {
    const bn = b.anims[i];
    if (an.name !== bn.name || an.ch.join() !== bn.ch.join()) out.push(`animação ${an.name}: canais`);
    else if (!an.data.every((d, k) => same(d[0], bn.data[k][0]) && same(d[1], bn.data[k][1]))) out.push(`animação ${an.name}: quadros`);
  });
  return out;
}

async function toWebp(doc) {
  let changed = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const mime = tex.getMimeType(), src = tex.getImage();
    if (!src || (mime !== 'image/jpeg' && mime !== 'image/png')) continue;
    const img = sharp(src, { limitInputPixels: false });
    const out = mime === 'image/png' ? await img.webp({ lossless: true, effort: 5 }).toBuffer() : await img.webp({ quality, effort: 5, smartSubsample: true }).toBuffer();
    if (out.length >= src.length * 0.95) continue; // não vale a troca
    tex.setImage(new Uint8Array(out)).setMimeType('image/webp');
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(jpe?g|png)$/i, '.webp'));
    changed++;
  }
  if (changed) doc.createExtension(EXTTextureWebP).setRequired(true);
}

const files = targets.flatMap((t) => walk(t));
const tot = { n: 0, skipped: 0, failed: 0, before: 0, after: 0, brBefore: 0, brAfter: 0 };
const rows = [];
for (const file of files) {
  const orig = fs.readFileSync(file);
  const rel = path.relative('client/public', file).replaceAll('\\', '/');
  let outBuf = orig, note = '';
  try {
    const doc = await io.readBinary(new Uint8Array(orig)); doc.setLogger(quiet);
    const already = doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression' || e.extensionName === 'KHR_draco_mesh_compression');
    if (already) { note = 'já comprimido'; tot.skipped++; }
    else {
      const before = fingerprint(doc);
      await doc.transform(reorder({ encoder: MeshoptEncoder }));
      await toWebp(doc);
      doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
      const bin = Buffer.from(await io.writeBinary(doc));
      const back = await io.readBinary(new Uint8Array(bin)); back.setLogger(quiet);
      const problems = diff(before, fingerprint(back));
      if (problems.length) { note = 'MANTIDO (difere: ' + problems.slice(0, 3).join('; ') + ')'; tot.failed++; }
      else if (bin.length >= orig.length * 0.97) { note = 'sem ganho'; tot.skipped++; }
      else { outBuf = bin; tot.n++; }
    }
  } catch (e) { note = 'MANTIDO (erro: ' + String(e?.message ?? e).slice(0, 80) + ')'; tot.failed++; }
  const brB = brotli(orig), brA = outBuf === orig ? brB : brotli(outBuf);
  tot.before += orig.length; tot.after += outBuf.length; tot.brBefore += brB; tot.brAfter += brA;
  rows.push({ rel, before: orig.length, after: outBuf.length, brB, brA, note });
  if (outBuf !== orig && !dry) fs.writeFileSync(file, outBuf);
  console.log(`${(orig.length / 1048576).toFixed(2).padStart(7)} -> ${(outBuf.length / 1048576).toFixed(2).padStart(6)} MB  ${rel} ${note}`);
}
const mb = (v) => (v / 1048576).toFixed(1);
console.log(`\n${dry ? '[simulação] ' : ''}${files.length} arquivos: ${tot.n} comprimidos, ${tot.skipped} sem troca, ${tot.failed} mantidos por segurança`);
console.log(`em disco:        ${mb(tot.before)} MB -> ${mb(tot.after)} MB (${(100 - (tot.after / tot.before) * 100).toFixed(0)}% menor)`);
console.log(`transferido(br): ${mb(tot.brBefore)} MB -> ${mb(tot.brAfter)} MB (${(100 - (tot.brAfter / tot.brBefore) * 100).toFixed(0)}% menor)`);
if (process.env.GLB_REPORT) fs.writeFileSync(process.env.GLB_REPORT, JSON.stringify({ tot, rows }, null, 1));
