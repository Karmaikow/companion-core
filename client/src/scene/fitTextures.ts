/**
 * Texturas dos modelos .glb no tamanho que o jogo precisa. Os modelos do Tripo vêm com texturas de 2048 px (cada uma
 * ~22 MB de memória de vídeo com os mipmaps), e o cache do carregador segura todas as que já apareceram. Numa placa
 * integrada (que divide a RAM com o resto do PC), explorar o mundo enchia a memória até o navegador derrubar o 3D
 * ("O 3D parou neste navegador"). Reduzir para 1024 corta 4× sem diferença visível na distância de jogo.
 *
 * Roda uma vez por textura (as cópias de um modelo dividem as mesmas texturas) e antes do primeiro desenho.
 */
import * as THREE from 'three';

const done = new WeakMap<THREE.Texture, number>();
/** a mesma imagem de origem vira a mesma imagem reduzida (o carregador divide imagens entre texturas) */
const scaled = new WeakMap<object, { max: number; source: THREE.Source<HTMLCanvasElement> }>();
/**
 * Originais já liberados, com o tamanho que tinham (depois de `close()` a imagem diz 0×0). O GLTFLoader guarda no
 * cache dele a imagem decodificada de cada textura (ImageBitmap, que o navegador não libera sozinho): depois de
 * reduzida, a de 2048 px continuava ocupando ~16,7 MB sem uso. Medido no mundo: 28 delas, ~470 MB.
 */
const closed = new WeakMap<object, { width: number; height: number }>();

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'specularMap'] as const;

/** Tamanho original da imagem, mesmo se ela já foi liberada. */
function sizeOf(img: { width?: number; height?: number }): { width: number; height: number } {
  return closed.get(img) ?? { width: img.width ?? 0, height: img.height ?? 0 };
}

/** Libera a imagem decodificada original (só ImageBitmap: as outras o coletor de lixo libera sozinho). */
function releaseOriginal(img: object) {
  if (typeof ImageBitmap === 'undefined' || !(img instanceof ImageBitmap) || closed.has(img)) return;
  closed.set(img, { width: img.width, height: img.height });
  img.close();
}

function shrink(t: THREE.Texture, max: number) {
  const prev = done.get(t);
  if (prev !== undefined && prev <= max) return;
  const img = t.image as { width?: number; height?: number } | undefined;
  if (!img) return;
  const { width, height } = sizeOf(img);
  if (!width || !height || Math.max(width, height) <= max) { done.set(t, max); return; }
  let s = scaled.get(img);
  const gone = closed.has(img);
  // original já liberado: só dá para reduzir a partir da cópia que sobrou (e não dá para voltar a aumentar)
  if (!s || (s.max !== max && !(gone && s.max < max))) {
    const from = gone ? s?.source.data : (img as CanvasImageSource);
    if (!from) return;
    const k = max / Math.max(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * k)); canvas.height = Math.max(1, Math.round(height * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(from, 0, 0, canvas.width, canvas.height);
    s = { max, source: new THREE.Source(canvas) };
    scaled.set(img, s);
    // só no tamanho do jogo (1024): quem reduz mais (itens, recursos a 512) pode dividir o arquivo com quem quer 1024
    if (max >= 1024) releaseOriginal(img);
  }
  // origem nova: se a textura já tinha ido para a placa, o three reserva o espaço do tamanho novo (não reaproveita o antigo)
  t.source = s.source; t.needsUpdate = true;
  done.set(t, max);
}

/**
 * Filtro anisotrópico: a câmera do jogo olha o chão e os modelos de lado, e sem ele a placa usa a versão reduzida
 * (mipmap) da textura nessa inclinação — a textura fica borrada. 8 amostras custam quase nada numa placa de hoje
 * (o three limita ao máximo que a placa aceita).
 */
export const MODEL_ANISOTROPY = 8;

function eachTexture(root: THREE.Object3D, fn: (t: THREE.Texture) => void) {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      const r = m as unknown as Record<string, THREE.Texture | null | undefined>;
      for (const k of MAP_KEYS) if (r[k]?.isTexture) fn(r[k]!);
    }
  });
}

/** Liga o filtro anisotrópico nas texturas do modelo (antes do primeiro desenho; depois disso precisa reenviar). */
export function sharpTextures(root: THREE.Object3D, anisotropy = MODEL_ANISOTROPY) {
  eachTexture(root, (t) => {
    if (t.anisotropy >= anisotropy) return;
    t.anisotropy = anisotropy; t.needsUpdate = true;
  });
  return root;
}

/** Reduz as texturas de todos os materiais do objeto para no máximo `max` px no lado maior (e liga o filtro anisotrópico). */
export function fitTextures(root: THREE.Object3D, max = 1024) {
  eachTexture(root, (t) => shrink(t, max));
  return sharpTextures(root);
}

/**
 * Solta o que uma cópia de modelo criou só para ela: a textura de ossos de cada esqueleto (SkeletonUtils.clone dá um
 * esqueleto novo por cópia) e, se `materials`, os materiais clonados. Malhas e texturas são do arquivo (cache) e ficam.
 * Sem isto, cada monstro que aparecia e sumia deixava a textura de ossos na placa.
 */
export function releaseClone(root: THREE.Object3D, materials = false) {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    const sk = (o as THREE.SkinnedMesh).isSkinnedMesh ? (o as THREE.SkinnedMesh).skeleton : null;
    if (sk) skeletons.add(sk);
    if (materials) {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.dispose();
    }
  });
  skeletons.forEach((s) => s.dispose());
}
