/**
 * Orçamento fixo de luzes pontuais.
 *
 * O three monta o shader de cada material iluminado para um número exato de luzes. Quando uma luz entra ou sai da
 * cena, TODOS os materiais iluminados do mundo precisam de um shader novo — e compilar dezenas de shaders trava o
 * jogo por até ~1 s. No mundo aberto isso acontecia o tempo todo: o baú que cai quando um monstro morre (com luz),
 * gemas e pedras com runas que aparecem e somem ao andar, marcos descobertos, recursos lendários... Medido: o
 * mesmo material de folha chegou a 10 shaders (de 3 a 8 luzes na cena), com travadas de 0,7–1,3 s.
 *
 * Aqui a cena tem sempre `count` luzes. Quem quer luz (`<BudgetLight />`, no lugar de `<pointLight />`) só faz um
 * pedido; a cada quadro as luzes vão para os pedidos mais perto do Companion e as que sobram ficam com intensidade
 * 0 — continuam contando para o shader, então nada recompila.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { companionFocus } from './world';

interface LightReq { obj: THREE.Object3D; color: THREE.Color; intensity: number; distance: number; decay: number }
const requests = new Set<LightReq>();

/** Quantas luzes cada cena reserva (fixo durante a cena inteira). */
export const LIGHT_BUDGET = { high: 4, low: 2 } as const;

/** Pede uma luz pontual neste ponto (mesmas props do pointLight). Só acende se houver um `<LightBudget />` na cena. */
export function BudgetLight({ position = [0, 0, 0], color = '#ffffff', intensity = 1, distance = 0, decay = 2 }: { position?: [number, number, number]; color?: THREE.ColorRepresentation; intensity?: number; distance?: number; decay?: number }) {
  const ref = useRef<THREE.Group>(null);
  const req = useMemo<LightReq>(() => ({ obj: new THREE.Object3D(), color: new THREE.Color(), intensity: 0, distance: 0, decay: 2 }), []);
  req.color.set(color); req.intensity = intensity; req.distance = distance; req.decay = decay;
  useEffect(() => {
    if (!ref.current) return;
    req.obj = ref.current;
    requests.add(req);
    return () => { requests.delete(req); };
  }, [req]);
  return <group ref={ref} position={position} />;
}

/** Ordena os pedidos pela distância (ao quadrado) até `from`, os mais perto primeiro; devolve só os `n` primeiros. */
export function nearestRequests<T extends { at: { x: number; y: number; z: number } }>(list: T[], from: { x: number; y: number; z: number }, n: number): T[] {
  const d = (p: T['at']) => (p.x - from.x) ** 2 + (p.y - from.y) ** 2 + (p.z - from.z) ** 2;
  return list.map((r) => ({ r, d: d(r.at) })).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.r);
}

/** As `count` luzes da cena. Montar uma vez por cena (o número não pode mudar enquanto a cena existe). */
export function LightBudget({ count }: { count: number }) {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  useFrame(() => {
    const list: { req: LightReq; at: THREE.Vector3 }[] = [];
    requests.forEach((req) => { if (req.obj.parent) list.push({ req, at: req.obj.getWorldPosition(new THREE.Vector3()) }); });
    const pick = nearestRequests(list, companionFocus, count);
    for (let i = 0; i < count; i++) {
      const l = lights.current[i];
      if (!l) continue;
      const p = pick[i];
      if (!p) { l.intensity = 0; continue; }
      l.position.copy(p.at); l.color.copy(p.req.color);
      l.intensity = p.req.intensity; l.distance = p.req.distance; l.decay = p.req.decay;
    }
  });
  return <>{Array.from({ length: count }, (_, i) => <pointLight key={i} ref={(el) => { lights.current[i] = el; }} position={[0, -1000, 0]} intensity={0} />)}</>;
}
