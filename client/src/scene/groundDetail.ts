/**
 * Textura de detalhe do chão (em teste, ligada em Ajustes → "Chão detalhado" ou com `?chao=detalhado`).
 *
 * Ideia vinda do PR antigo #15 (grama, terra e rocha por ruído, sem arquivos externos), refeita para a cena atual:
 * as cores grandes do chão continuam as de hoje (bioma de cada região, trilhas de terra, rocha nas encostas, sombra da
 * mata — tudo nas cores por vértice). Por cima entra UMA textura de detalhe, a mesma para o mapa todo, que só
 * clareia e escurece: fiapos de grama, grão de terra e pedrinhas. Nada de cor nova, então cada bioma continua com a
 * paleta dele.
 *
 * Custo: uma textura de 256×256 gerada uma vez (não uma por pedaço do mapa), repetida a cada `GROUND_DETAIL_PERIOD`
 * metros pelas coordenadas do mundo — os pedaços emendam sem costura.
 */
import * as THREE from 'three';

/** a textura se repete a cada tantos metros */
export const GROUND_DETAIL_PERIOD = 5;
const SIZE = 256;

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ramp = (a: number, b: number, v: number) => smooth(Math.min(1, Math.max(0, (v - a) / (b - a))));

/** ruído de valor que se repete a cada `px` × `pz` células (a textura emenda nas bordas) */
function tileNoise(seed: number, px: number, pz = px) {
  const n = (a: number, b: number) => {
    a = ((a % px) + px) % px; b = ((b % pz) + pz) % pz;
    let v = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
  };
  return (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
    return mix(mix(n(ix, iz), n(ix + 1, iz), fx), mix(n(ix, iz + 1), n(ix + 1, iz + 1), fx), fz);
  };
}

// cada camada tem um número inteiro de células por volta, para emendar na borda da textura
const patch = tileNoise(11, 4), grain = tileNoise(23, 64), blades = tileNoise(37, 72, 40), pebble = tileNoise(51, 40);
/**
 * Valor de claridade (≈0,7 a 1) de um ponto da textura, com u,v em [0,1). Puro: os testes conferem que emenda
 * nas bordas e que a média fica perto de 1 depois da compensação.
 */
export function groundDetailAt(u: number, v: number): number {
  const soil = ramp(0.55, 0.78, patch(u * 4, v * 4));                       // manchas onde a grama rareia
  const fio = 0.9 + 0.1 * blades(u * 72, v * 40);                            // fiapos de grama (pouco esticados)
  const grao = 0.92 + 0.08 * grain(u * 64, v * 64);                          // grão fino
  const pedra = ramp(0.84, 0.92, pebble(u * 40, v * 40));                    // pedrinhas esparsas
  const base = mix(fio, 0.9, soil) * grao;
  return Math.max(0, Math.min(1, mix(base, 0.78, pedra * 0.5)));
}

let cached: { tex: THREE.DataTexture; mean: number } | null = null;
/** A textura (uma só, compartilhada) e a média dela, para compensar o escurecimento. */
export function groundDetailTexture(): { tex: THREE.DataTexture; mean: number } {
  if (cached) return cached;
  const data = new Uint8Array(SIZE * SIZE * 4);
  let sum = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const val = groundDetailAt((x + 0.5) / SIZE, (y + 0.5) / SIZE), b = Math.round(val * 255), i = (y * SIZE + x) * 4;
    data[i] = b; data[i + 1] = b; data[i + 2] = b; data[i + 3] = 255; sum += val;
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  cached = { tex, mean: sum / (SIZE * SIZE) };
  return cached;
}

/** Ligado? Ajustes, ou `?chao=detalhado` / `?chao=liso` na URL (para comparar). */
export function groundDetailOn(setting: boolean): boolean {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('chao');
  return q === 'detalhado' ? true : q === 'liso' ? false : setting;
}
