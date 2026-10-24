/** Lab (só no dev): converte o pacote padrão para um modelo, grava o .GLB do jogo, reabre e toca num modelo novo. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makeRetargeter, exportClips, STANDARD_SLOTS, STANDARD_EXTRAS } from './standard';

const log = (s: string) => { document.getElementById('log')!.textContent += s + '\n'; };
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
(async () => {
  const url = new URLSearchParams(location.search).get('modelo') ?? '/m2m-test/sample.glb';
  const model = await loader.loadAsync(url);
  // ?girar=180: simula um modelo exportado de costas (como alguns do Tripo)
  const turn = Number(new URLSearchParams(location.search).get('girar') ?? 0) * Math.PI / 180;
  model.scene.rotation.y += turn;
  let t = performance.now();
  const rt = await makeRetargeter(model.scene);
  log(`lados trocados nos nomes: ${rt.mirrored ? 'sim (corrigido)' : 'não'}`);
  log(`esqueleto ${rt.rigType}: ${rt.mapped}/${rt.bones} ossos · biblioteca ${rt.names.length} clipes · ${(performance.now() - t).toFixed(0)} ms`);
  const names = [...new Set([...Object.values(STANDARD_SLOTS), ...STANDARD_EXTRAS])];
  t = performance.now();
  const clips = names.map((n) => rt.get(n)!).filter(Boolean);
  { const bn: string[] = []; model.scene.traverse((o) => { if ((o as THREE.Bone).isBone) bn.push(o.name); }); log(`ossos: ${bn.slice(0, 5).join(', ')} · Walk: ${clips[1]?.tracks.length} trilhas (${clips[1]?.tracks.slice(0, 3).map((t) => t.name).join(', ')}) · no arquivo do modelo: ${model.animations.map((a) => a.name).join(', ')}`); }
  log(`${clips.length} clipes convertidos em ${(performance.now() - t).toFixed(0)} ms`);
  const buf = await exportClips(model.scene, clips);
  log(`arquivo do jogo: ${(buf.byteLength / 1024).toFixed(0)} KB`);
  // como o jogo: abre o arquivo de animação e toca num modelo carregado à parte
  const anim = await loader.parseAsync(buf, '');
  const fresh = await loader.loadAsync(url + '?outra');
  fresh.scene.rotation.y += turn;
  const body = cloneSkinned(fresh.scene);
  const scene = new THREE.Scene(); scene.add(body);
  scene.background = new THREE.Color('#2d3770');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 4, 3); scene.add(dl);
  const big = new URLSearchParams(location.search).get('so');
  const box = new THREE.Box3().setFromObject(body), c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).y;
  const cam = new THREE.PerspectiveCamera(35, 200 / 250, 0.01, 100); const look = big ? new THREE.Vector3(c.x, c.y - h * 0.3, c.z) : c;
  cam.position.set(look.x + h * 0.2, look.y + h * 0.15, look.z + h * (big ? 1.4 : 2.2)); cam.lookAt(look);
  const W = big ? 600 : 200, H = big ? 600 : 250;
  cam.aspect = W / H; cam.updateProjectionMatrix();
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H);
  const mixer = new THREE.AnimationMixer(body);
  const grid = document.getElementById('grid')!;
  let bound = 0;
  for (const [slot, name] of Object.entries(STANDARD_SLOTS).filter(([k]) => !big || k === big)) {
    const clip = anim.animations.find((a) => a.name === name);
    if (!clip) { log('faltou no arquivo: ' + name); continue; }
    mixer.stopAllAction(); const a = mixer.clipAction(clip); a.play(); mixer.setTime(clip.duration * 0.45);
    // quantas trilhas acharam osso no modelo novo
    bound = Math.max(bound, (a as unknown as { _propertyBindings: { binding: { node?: unknown } }[] })._propertyBindings.filter((p) => p.binding.node).length);
    r.render(scene, cam);
    const f = document.createElement('figure'); f.innerHTML = `<img src="${r.domElement.toDataURL()}"><figcaption>${slot} · ${name}</figcaption>`; if (big) f.style.width = W + 'px'; grid.appendChild(f);
  }
  log(`clipes no arquivo: ${anim.animations.length} · trilhas ligadas ao modelo novo: ${bound}`);
  (window as unknown as { __done: boolean }).__done = true;
})().catch((e) => { log('ERRO ' + (e?.stack ?? e)); (window as unknown as { __done: boolean }).__done = true; });
// diagnóstico de tamanho (só no lab)
(window as unknown as { __stats: unknown }).__stats = async () => {
  const url = new URLSearchParams(location.search).get('modelo') ?? '/m2m-test/sample.glb';
  const model = await loader.loadAsync(url);
  const rt = await makeRetargeter(model.scene);
  const c = rt.get('Walk')!;
  const by: Record<string, { tracks: number; keys: number; constant: number }> = {};
  for (const t of c.tracks) {
    const kind = t.name.split('.').pop()!;
    const e = (by[kind] ??= { tracks: 0, keys: 0, constant: 0 });
    e.tracks++; e.keys += t.times.length;
    const n = t.getValueSize(); let same = true;
    for (let i = n; i < t.values.length && same; i++) if (Math.abs(t.values[i] - t.values[i % n]) > 1e-4) same = false;
    if (same) e.constant++;
  }
  const buf = await exportClips(model.scene, [c]);
  const dv = new DataView(buf); const jl = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const bv = j.bufferViews as { byteLength: number }[];
  const sizes: Record<string, number> = {};
  (j.accessors as { bufferView: number; type: string; count: number }[]).forEach((a) => { sizes[a.type] = (sizes[a.type] ?? 0) + bv[a.bufferView].byteLength; });
  const parts: Record<string, number> = {}; for (const k of Object.keys(j)) parts[k] = JSON.stringify(j[k]).length;
  return { sample: JSON.stringify([j.accessors[0], j.accessors[1], j.bufferViews[0], j.animations[0].samplers[0], j.animations[0].channels[0]]), parts, duration: c.duration, by, file: buf.byteLength, json: jl, nodes: j.nodes.length, accessors: j.accessors.length, sizes, extra: Object.keys(j) };
};
