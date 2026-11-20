import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cameraFrustum, cullInstances, instanceSphere } from './instanceCulling';

/** câmera do jogo: alta, atrás, olhando para baixo na direção -z */
function gameCamera() {
  const cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.3, 140);
  cam.position.set(0, 9, 13); cam.lookAt(0, 0, 0);
  return cam;
}
const unit = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 0.6);

describe('cullInstances', () => {
  it('mantém o que está na frente da câmera e tira o que está atrás e longe dos lados', () => {
    const f = cameraFrustum(gameCamera());
    const spheres = [
      instanceSphere(unit, 0, 0, 0, 2, false),     // no centro da tela
      instanceSphere(unit, 0, 0, 40, 2, false),    // atrás da câmera
      instanceSphere(unit, 60, 0, 0, 2, false),    // muito para o lado
      instanceSphere(unit, -3, 0, -6, 2, false),   // na tela, um pouco à esquerda
    ];
    const out: number[] = [];
    const n = cullInstances(spheres, f, out);
    expect(out.slice(0, n)).toEqual([0, 3]);
  });

  it('árvore logo fora da tela fica se faz sombra (a sombra cai dentro)', () => {
    const f = cameraFrustum(gameCamera());
    // logo à direita da borda da tela, no plano do chão
    const x = 12.5;
    const semSombra = instanceSphere(unit, x, 0, 0, 4, false), comSombra = instanceSphere(unit, x, 0, 0, 4, true);
    const out: number[] = [];
    expect(cullInstances([semSombra], f, out)).toBe(0);
    expect(cullInstances([comSombra], f, out)).toBe(1);
  });

  it('pula as cópias escondidas por outro motivo', () => {
    const f = cameraFrustum(gameCamera());
    const s = instanceSphere(unit, 0, 0, 0, 1, false);
    const out: number[] = [];
    expect(cullInstances([s, s, s], f, out, [false, true, false])).toBe(2);
    expect(out.slice(0, 2)).toEqual([0, 2]);
  });
});
