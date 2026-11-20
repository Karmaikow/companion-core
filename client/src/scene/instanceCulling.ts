/**
 * Corte por câmera das cópias instanciadas (árvores, pedras, tufos).
 *
 * Uma malha instanciada é desenhada inteira ou não é desenhada: o three não testa cópia por cópia. A vegetação do
 * mundo aberto cobre 9×9 pedaços em volta do Companion e a câmera olha para baixo, então quase tudo ficava fora da
 * tela — medido no mundo: 754 cópias, ~799 mil triângulos por quadro, dos quais só ~10,6 mil apareciam. Aqui cada
 * quadro separa as cópias que tocam a visão da câmera e só elas vão para a placa (o resto nem é enviado).
 *
 * Cada cópia é uma esfera que a envolve inteira, com folga para o vento e, se ela faz sombra, para a sombra que cai
 * dentro da tela vindo de uma árvore logo fora dela.
 */
import * as THREE from 'three';

export interface CullSphere { x: number; y: number; z: number; r: number }

/**
 * Esfera de uma cópia: `bounds` é a esfera do modelo com 1 m de altura (pé na origem); `h` a altura da cópia.
 * O centro do modelo pode estar fora do eixo, e a cópia gira em y: a distância ao eixo entra no raio.
 */
export function instanceSphere(bounds: THREE.Sphere, x: number, y: number, z: number, h: number, shadows: boolean): CullSphere {
  const off = Math.hypot(bounds.center.x, bounds.center.z);
  // vento: o topo balança alguns centímetros por metro; sombra: o sol (alto, de lado) projeta mais ou menos a altura
  const margin = h * (0.15 + (shadows ? 1.1 : 0));
  return { x, y: y + bounds.center.y * h, z, r: (bounds.radius + off) * h + margin };
}

const tmp = new THREE.Sphere();
/**
 * Índices das cópias visíveis em `out` (na ordem original); devolve quantas são. `skip` marca as que já estão
 * escondidas por outro motivo (ex.: árvore na frente do Companion).
 */
export function cullInstances(spheres: readonly CullSphere[], frustum: THREE.Frustum, out: number[], skip?: readonly boolean[]): number {
  let n = 0;
  for (let i = 0; i < spheres.length; i++) {
    if (skip?.[i]) continue;
    const s = spheres[i];
    tmp.center.set(s.x, s.y, s.z); tmp.radius = s.r;
    if (frustum.intersectsSphere(tmp)) out[n++] = i;
  }
  return n;
}

/** Frustum da câmera (com as matrizes do quadro). */
export function cameraFrustum(camera: THREE.Camera, into = new THREE.Frustum(), m = new THREE.Matrix4()): THREE.Frustum {
  camera.updateMatrixWorld();
  return into.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
