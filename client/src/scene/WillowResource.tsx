import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NODE_KINDS } from '@rules';
import { useEcos } from '../ecos/ecosStore';

class ModelFallback extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Transform clones share cached geometry and textures across all trees. */
function Asset({ url, size, nodeId }: { url: string; size: number; nodeId?: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const obj = scene.clone(true);
    const box = new THREE.Box3().setFromObject(obj), extent = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size / Math.max(extent.x, extent.y, extent.z, 0.001);
    obj.scale.setScalar(scale);
    obj.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    obj.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    return obj;
  }, [scene, size]);
  const pieces = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    model.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
    return meshes.sort((a, b) => new THREE.Box3().setFromObject(b).max.y - new THREE.Box3().setFromObject(a).max.y);
  }, [model]);
  useFrame(() => {
    const run = useEcos.getState().run;
    const active = !!run && run.node === nodeId && run.approach === 'cortar' && ['coletando', 'confirmando'].includes(run.phase) && run.started > 0;
    const progress = active ? Math.min(0.95, Math.max(0, (Date.now() - run.started) / (run.seconds * 1000))) : 0;
    pieces.forEach((piece, i) => { piece.visible = i >= Math.floor(progress * (pieces.length - 1)); });
  });
  return <primitive object={model} dispose={null} />;
}

export function WillowResource({ id, amount, glow, fallback }: { id: string; amount: number; glow: boolean; fallback: ReactNode }) {
  const tree = useRef<THREE.Group>(null), bar = useRef<THREE.Group>(null);
  const fill = useRef<THREE.Mesh>(null);
  const cutCost = NODE_KINDS.salgueiro.approaches.find((a) => a.id === 'cortar')!.cost;
  // A full cut leaves two units. Show a stump until another cut is available.
  const stump = amount < cutCost;
  useFrame(() => {
    const run = useEcos.getState().run;
    const active = run?.node === id && run.approach === 'cortar' && run.phase === 'coletando';
    const elapsed = active ? Math.max(0, (Date.now() - run.started) / 1000) : 0;
    const swing = Math.sin(elapsed * Math.PI * 2 / 0.7);
    if (tree.current) tree.current.rotation.z = active ? Math.max(0, swing) * 0.025 : 0;
    if (bar.current) bar.current.visible = active;
    if (fill.current) {
      const remaining = active ? Math.max(0, 1 - elapsed / run.seconds) : 1;
      fill.current.scale.x = remaining;
      fill.current.position.x = -(1 - remaining) * 0.6;
    }
  });
  return <group>
    <group ref={tree}>
      {stump ? <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.2, 0.3, 0.5, 8]} /><meshLambertMaterial color="#6d5a45" /></mesh> :
        <ModelFallback fallback={fallback}><Suspense fallback={fallback}><Asset url="/ecos_salgueiro.glb" size={3.2} nodeId={id} /></Suspense></ModelFallback>}
      {glow && !stump && <mesh position={[0.18, 0.9, 0.05]}><boxGeometry args={[0.04, 1.2, 0.08]} /><meshBasicMaterial color="#7fd6ff" toneMapped={false} /></mesh>}
    </group>
    <group ref={bar} visible={false} position={[0, 3.5, 0]}>
      <mesh><boxGeometry args={[1.3, 0.14, 0.08]} /><meshBasicMaterial color="#28352c" /></mesh>
      <mesh ref={fill} position={[0, 0, 0.05]}><boxGeometry args={[1.2, 0.08, 0.04]} /><meshBasicMaterial color="#b6df86" /></mesh>
    </group>
  </group>;
}
