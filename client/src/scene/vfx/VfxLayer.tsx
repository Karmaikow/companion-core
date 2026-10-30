import { CatalogueRenderer } from './CatalogueRenderer';
/** Desenha uma VfxStore: duas malhas instanciadas (normal e aditiva) com as formas no shader, e as fitas. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VfxStore, lineAlpha, type Particle } from './engine';

const PART_VERT = /* glsl */ `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iA; attribute vec4 iB; attribute vec3 iC1; attribute vec3 iC2;
varying vec2 vUv; varying vec4 vA; varying vec3 vC1; varying vec3 vC2;
void main() {
  vec2 c = position.xy * 2.0;
  vUv = c;
  float s = iA.x * 0.5; float r = iA.y;
  vA = vec4(iA.z, iA.w, iB.z, iB.w);
  vC1 = iC1; vC2 = iC2;
  vec2 rc = vec2(c.x * cos(r) - c.y * sin(r), c.x * sin(r) + c.y * cos(r)) * s;
  if (iB.x > 0.5) {
    gl_Position = projectionMatrix * viewMatrix * vec4(iPos + vec3(rc.x, 0.0, rc.y), 1.0);
    return;
  }
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 off = rc;
  if (iB.y > 0.0) {
    vec2 v2 = (mat3(viewMatrix) * iVel).xy;
    float l = length(v2);
    vec2 d = l > 1e-4 ? v2 / l : vec2(0.0, 1.0);
    vec2 p = vec2(-d.y, d.x);
    off = d * c.y * s * (1.0 + l * iB.y) + p * c.x * s;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
}`;

const PART_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv; varying vec4 vA; varying vec3 vC1; varying vec3 vC2;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// preenchimento com borda suave de 1 pixel (sd negativo = dentro)
float fill(float sd) { float w = fwidth(sd) + 1e-4; return clamp(0.5 - sd / w, 0.0, 1.0); }
void main() {
  vec2 uv = vUv; float life = vA.x; int kind = int(vA.y + 0.5); float seed = vA.z;
  float d = length(uv);
  vec3 W = vec3(1.0);
  vec3 col = vC1; float a = 0.0;
  if (kind == 0) { // brilho
    float g = 1.0 - smoothstep(0.0, 1.0, d); a = g * g;
    col = mix(vC1, W, (1.0 - smoothstep(0.0, 0.5, d)) * 0.85);
  } else if (kind == 1) { // fumaça de desenho animado
    float n = noise(uv * 2.2 + seed * 13.0);
    float sd = d - (0.8 + (n - 0.5) * 0.32);
    vec3 N = normalize(vec3(uv, sqrt(max(0.0, 1.0 - min(d * d, 1.0)))));
    float l = dot(N, normalize(vec3(-0.45, 0.65, 0.6)));
    col = mix(vC2, vC1, smoothstep(0.16, 0.24, l));
    col = mix(col, mix(vC1, W, 0.55), smoothstep(0.8, 0.86, l) * 0.85);
    col = mix(col, vC2 * 0.72, 1.0 - fill(sd + 0.08));
    float dn = noise(uv * 3.0 + seed * 29.0 + 7.0);
    float cut = smoothstep(0.3, 1.0, life) * 1.08;
    a = fill(sd) * fill(cut - dn);
  } else if (kind == 2) { // faísca esticada (y = direção)
    float w = max(0.001, (1.0 - uv.y * uv.y) * (0.45 + 0.55 * (uv.y * 0.5 + 0.5)));
    float x = abs(uv.x);
    a = 1.0 - smoothstep(w * 0.25, w, x);
    col = mix(vC1, W, (1.0 - smoothstep(0.0, w * 0.5, x)) * 0.9);
  } else if (kind == 3) { // estrela
    float sx = exp(-abs(uv.x) * 14.0) * max(0.0, 1.0 - abs(uv.y));
    float sy = exp(-abs(uv.y) * 14.0) * max(0.0, 1.0 - abs(uv.x));
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * uv;
    float dx = exp(-abs(q.x) * 18.0) * max(0.0, 1.0 - abs(q.y) * 1.6);
    float dy = exp(-abs(q.y) * 18.0) * max(0.0, 1.0 - abs(q.x) * 1.6);
    float core = exp(-d * d * 18.0);
    a = clamp(max(max(sx, sy), max(dx, dy) * 0.6) + core, 0.0, 1.0);
    col = mix(vC1, W, clamp(core * 1.2 + max(sx, sy) * 0.35, 0.0, 1.0));
  } else if (kind == 4) { // onda de choque
    float th = mix(0.3, 0.035, life);
    float rr = 1.0 - th;
    float band = 1.0 - smoothstep(0.0, th, abs(d - rr));
    float inner = smoothstep(0.0, rr, d) * step(d, rr) * 0.3 * (1.0 - life);
    a = band + inner;
    col = mix(vC1, W, pow(band, 3.0) * 0.75);
  } else if (kind == 5) { // explosão estrelada
    float ang = atan(uv.y, uv.x);
    float k = 6.0 + floor(seed * 4.0);
    float f = ang / 6.2831853 * k + seed * 3.0;
    float tri = abs(fract(f) - 0.5) * 2.0;
    float len = 0.72 + 0.28 * hash(vec2(floor(f), seed * 9.0));
    float R = 0.46 + (len - 0.46) * (1.0 - tri);
    float sd = d - R;
    float hole = smoothstep(0.4, 1.0, life) * 1.05;
    a = fill(sd) * fill(hole - d);
    col = mix(vC1, mix(vC1, W, 0.85), fill(d - R * 0.5));
    col = mix(col, vC2, 1.0 - fill(sd + 0.07));
  } else if (kind == 6) { // cristal
    float sd = (abs(uv.x) * 2.0 + abs(uv.y) - 1.0) * 0.55;
    float facet = step(0.0, uv.x);
    col = mix(vC1, vC2, facet * 0.55);
    col = mix(col, W, (1.0 - smoothstep(0.0, 0.07, abs(uv.x + 0.04))) * 0.6 * (1.0 - facet));
    col = mix(col, vC2 * 0.7, 1.0 - fill(sd + 0.05));
    a = fill(sd);
  } else if (kind == 7) { // folha
    float w = max(0.0, 1.0 - uv.y * uv.y) * 0.5;
    float sd = (abs(uv.x) - w) * 0.8;
    col = mix(vC1, vC2, step(0.0, uv.x) * 0.45);
    col = mix(col, vC2 * 0.8, 1.0 - smoothstep(0.0, 0.05, abs(uv.x)));
    col = mix(col, vC2 * 0.65, 1.0 - fill(sd + 0.05));
    a = fill(sd);
  } else if (kind == 8) { // gota (ponta para trás da velocidade)
    vec2 p = vec2(uv.x, -uv.y);
    float circ = length(p - vec2(0.0, -0.25)) - 0.62;
    float coneW = 0.62 * clamp((0.95 - p.y) / 1.2, 0.0, 1.0);
    float cone = max(abs(p.x) - coneW, p.y - 0.95);
    float sd = p.y > -0.25 ? min(circ, cone) : circ;
    col = mix(vC1, vC2, clamp(p.x * 0.5 + 0.5, 0.0, 1.0) * 0.6);
    col = mix(col, W, 1.0 - smoothstep(0.08, 0.16, length(p - vec2(-0.22, -0.32))));
    col = mix(col, vC2 * 0.75, 1.0 - fill(sd + 0.07));
    a = fill(sd);
  } else { // orbe de energia
    float n = noise(vec2(atan(uv.y, uv.x) * 2.0 + seed * 10.0, d * 3.0 - uTime * 5.0));
    float edge = 0.72 + (n - 0.5) * 0.4;
    float body = 1.0 - smoothstep(edge * 0.55, edge, d);
    float halo = 1.0 - smoothstep(0.0, 1.0, d);
    a = max(body, halo * halo * 0.7);
    col = mix(vC1, W, 1.0 - smoothstep(0.08, 0.42, d));
  }
  gl_FragColor = vec4(col, a * vA.w);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

const LINE_VERT = /* glsl */ `
attribute vec2 aUv; attribute vec3 aCol; attribute vec2 aA;
varying vec2 vUv; varying vec3 vC; varying vec2 vA;
void main() { vUv = aUv; vC = aCol; vA = aA; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;

const LINE_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv; varying vec3 vC; varying vec2 vA;
void main() {
  float v = abs(vUv.y);
  int mode = int(vA.y + 0.5);
  float a; float core;
  if (mode == 0) {
    float wv = 0.55 + 0.45 * sin(vUv.x * 34.0 - uTime * 24.0 + vUv.y * 2.5);
    core = 1.0 - smoothstep(0.0, 0.38, v);
    a = (1.0 - smoothstep(0.5, 1.0, v)) * mix(wv, 1.0, core);
  } else if (mode == 1) {
    core = 1.0 - smoothstep(0.0, 0.45, v);
    a = 1.0 - smoothstep(0.35, 1.0, v);
  } else {
    // meia-lua sólida: gume branco do lado de fora (+y), corpo na cor, borda nítida
    float s = vUv.y * 0.5 + 0.5;
    float w = fwidth(vUv.y) * 1.5 + 1e-3;
    a = 1.0 - smoothstep(1.0 - w, 1.0, v);
    core = smoothstep(0.62, 0.7, s);
    vec3 body = mix(vC * 0.82, vC, smoothstep(0.0, 0.6, s));
    gl_FragColor = vec4(mix(body, vec3(1.0), core * 0.92), a * vA.x);
    if (gl_FragColor.a < 0.004) discard;
    #include <colorspace_fragment>
    return;
  }
  gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.88), a * vA.x);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

const CAP = VfxStore.CAP;
const MAXV = 6000;

function partGeo() {
  const g = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
  const att = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(CAP * n), n).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iPos', att(3)); g.setAttribute('iVel', att(3)); g.setAttribute('iA', att(4)); g.setAttribute('iB', att(4));
  g.setAttribute('iC1', att(3)); g.setAttribute('iC2', att(3));
  g.instanceCount = 0;
  return g;
}

function fill(g: THREE.InstancedBufferGeometry, ps: Particle[], add: boolean) {
  const A = (n: string) => g.getAttribute(n) as THREE.InstancedBufferAttribute;
  const P = A('iPos').array as Float32Array, V = A('iVel').array as Float32Array, IA = A('iA').array as Float32Array, IB = A('iB').array as Float32Array;
  const C1 = A('iC1').array as Float32Array, C2 = A('iC2').array as Float32Array;
  let n = 0;
  for (const p of ps) {
    if (p.add !== add || p.alphaNow <= 0.003) continue;
    const i3 = n * 3, i4 = n * 4;
    P[i3] = p.x; P[i3 + 1] = p.y; P[i3 + 2] = p.z;
    V[i3] = p.vx; V[i3 + 1] = p.vy; V[i3 + 2] = p.vz;
    IA[i4] = p.size; IA[i4 + 1] = p.rot; IA[i4 + 2] = Math.min(1, p.age / p.life); IA[i4 + 3] = p.k;
    IB[i4] = p.flat ? 1 : 0; IB[i4 + 1] = p.stretch; IB[i4 + 2] = p.seed; IB[i4 + 3] = p.alphaNow;
    C1[i3] = p.c1.r; C1[i3 + 1] = p.c1.g; C1[i3 + 2] = p.c1.b; C2[i3] = p.c2.r; C2[i3 + 1] = p.c2.g; C2[i3 + 2] = p.c2.b;
    n++;
  }
  g.instanceCount = n;
  for (const k of ['iPos', 'iVel', 'iA', 'iB', 'iC1', 'iC2']) { const a = A(k); a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
}

/** fixedDt: passo fixo por quadro (lab/testes), em vez do tempo real. */
export function VfxLayer({ store, fixedDt, timeScale = 1, warm, lights }: { store: VfxStore; fixedDt?: number; timeScale?: number; warm?: string[]; lights?: boolean }) {
  const crystalMesh = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const { gN, gA, gL, mN, mA, mL } = useMemo(() => {
    const mk = (add: boolean) => new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms, transparent: true, depthWrite: false, depthTest: !add, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
    const gL = new THREE.BufferGeometry();
    gL.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3).setUsage(THREE.DynamicDrawUsage));
    gL.setAttribute('aUv', new THREE.BufferAttribute(new Float32Array(MAXV * 2), 2).setUsage(THREE.DynamicDrawUsage));
    gL.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3).setUsage(THREE.DynamicDrawUsage));
    gL.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(MAXV * 2), 2).setUsage(THREE.DynamicDrawUsage));
    gL.setIndex(new THREE.BufferAttribute(new Uint32Array(MAXV * 3), 1).setUsage(THREE.DynamicDrawUsage));
    gL.setDrawRange(0, 0);
    const mL = new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false });
    return { gN: partGeo(), gA: partGeo(), gL, mN: mk(false), mA: mk(true), mL };
  }, [uniforms]);
  useEffect(() => () => { gN.dispose(); gA.dispose(); gL.dispose(); mN.dispose(); mA.dispose(); mL.dispose(); }, [gN, gA, gL, mN, mA, mL]);
  const tmp = useMemo(() => ({ T: new THREE.Vector3(), V: new THREE.Vector3(), S: new THREE.Vector3() }), []);

  useFrame((state, dtRaw) => {
    const dt = fixedDt ?? Math.min(dtRaw, 0.05) * timeScale;
    store.update(dt);
    uniforms.uTime.value = store.time;
    if (crystalMesh.current) {
      const mesh = crystalMesh.current;
      mesh.count = store.crystals.length;
      store.crystals.forEach((c, i) => {
        const grow = Math.min(1, c.age / 0.22), fade = Math.min(1, (c.life - c.age) / 0.4);
        const h = c.size * Math.max(0.001, grow * fade);
        transform.position.copy(c.at).add(new THREE.Vector3(0, h * 0.5, 0));
        transform.rotation.set(0.12 * Math.sin(c.yaw), c.yaw, 0.18 * Math.cos(c.yaw));
        transform.scale.set(h * 0.22, h, h * 0.22); transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, c.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    fill(gN, store.parts, false);
    fill(gA, store.parts, true);
    // fitas viradas para a câmera
    const pos = gL.getAttribute('position').array as Float32Array, uv = gL.getAttribute('aUv').array as Float32Array;
    const cl = gL.getAttribute('aCol').array as Float32Array, aa = gL.getAttribute('aA').array as Float32Array, idx = gL.index!.array as Uint32Array;
    const cam = state.camera.position, { T, V, S } = tmp;
    let v = 0, ix = 0;
    for (const L of store.lines) {
      const n = L.pts.length;
      if (n < 2 || v + n * 2 > MAXV) continue;
      const la = lineAlpha(L);
      if (la <= 0) continue;
      const v0 = v;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), p = L.pts[i];
        T.subVectors(L.pts[Math.min(n - 1, i + 1)], L.pts[Math.max(0, i - 1)]);
        if (T.lengthSq() < 1e-10) T.set(0, 0, 1);
        V.subVectors(cam, p);
        S.crossVectors(T, V).normalize().multiplyScalar(L.w * 0.5 * L.profile(u));
        const al = la * L.alphaAt(u, L);
        for (let s = -1; s <= 1; s += 2) {
          pos[v * 3] = p.x + S.x * s; pos[v * 3 + 1] = p.y + S.y * s; pos[v * 3 + 2] = p.z + S.z * s;
          uv[v * 2] = u; uv[v * 2 + 1] = s;
          cl[v * 3] = L.color.r; cl[v * 3 + 1] = L.color.g; cl[v * 3 + 2] = L.color.b;
          aa[v * 2] = al; aa[v * 2 + 1] = L.mode;
          v++;
        }
      }
      for (let i = 0; i < n - 1; i++) {
        const a = v0 + i * 2;
        idx[ix++] = a; idx[ix++] = a + 1; idx[ix++] = a + 2;
        idx[ix++] = a + 1; idx[ix++] = a + 3; idx[ix++] = a + 2;
      }
    }
    for (const k of ['position', 'aUv', 'aCol', 'aA']) gL.getAttribute(k).needsUpdate = true;
    gL.index!.needsUpdate = true;
    gL.setDrawRange(0, ix);
  });

  return (
    <group>
      <CatalogueRenderer store={store} timeScale={timeScale} warm={warm} lights={lights} />
      <instancedMesh ref={crystalMesh} args={[undefined, undefined, 192]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial color="#ffffff" metalness={0.25} roughness={0.2} flatShading />
      </instancedMesh>
      <mesh geometry={gL} material={mL} frustumCulled={false} renderOrder={10} />
      <mesh geometry={gN} material={mN} frustumCulled={false} renderOrder={11} />
      <mesh geometry={gA} material={mA} frustumCulled={false} renderOrder={12} />
    </group>
  );
}
