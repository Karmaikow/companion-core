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

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'specularMap'] as const;

function shrink(t: THREE.Texture, max: number) {
  const prev = done.get(t);
  if (prev !== undefined && prev <= max) return;
  const img = t.image as { width?: number; height?: number } | undefined;
  if (!img || !img.width || !img.height || Math.max(img.width, img.height) <= max) { done.set(t, max); return; }
  let s = scaled.get(img);
  if (!s || s.max !== max) {
    const k = max / Math.max(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * k)); canvas.height = Math.max(1, Math.round(img.height * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    s = { max, source: new THREE.Source(canvas) };
    scaled.set(img, s);
  }
  // origem nova: se a textura já tinha ido para a placa, o three reserva o espaço do tamanho novo (não reaproveita o antigo)
  t.source = s.source; t.needsUpdate = true;
  done.set(t, max);
}

/** Reduz as texturas de todos os materiais do objeto para no máximo `max` px no lado maior. */
export function fitTextures(root: THREE.Object3D, max = 1024) {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      const r = m as unknown as Record<string, THREE.Texture | null | undefined>;
      for (const k of MAP_KEYS) if (r[k]?.isTexture) shrink(r[k]!, max);
    }
  });
  return root;
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
