import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { IdentityContractV1 } from '@rules';
import { drawCompanion } from './companionSprite';
import { ParticleCore } from './ParticleCore';

export function FirstForm({ contract, pulseKey }: { contract: IdentityContractV1; pulseKey: number }) {
  const sprite = useRef<THREE.Mesh>(null);
  const textures = useMemo(() => {
    const open = new THREE.CanvasTexture(drawCompanion(contract, 512, false));
    const closed = new THREE.CanvasTexture(drawCompanion(contract, 512, true));
    for (const t of [open, closed]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
    return { open, closed };
  }, [contract]);
  useEffect(() => () => { textures.open.dispose(); textures.closed.dispose(); }, [textures]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: textures.open, transparent: true, alphaTest: 0.05 }), [textures]);
  const blink = useRef(0);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (!sprite.current) return;
    // personagem 2D sempre de frente para a câmera (HD-2D)
    sprite.current.quaternion.copy(state.camera.quaternion);
    sprite.current.position.y = 0.95 + Math.abs(Math.sin(t * 1.6)) * 0.08;
    const squash = 1 + Math.sin(t * 3.2) * 0.015;
    sprite.current.scale.set(1.7 / squash, 1.7 * squash, 1);
    blink.current -= dt;
    if (blink.current < -0.14) blink.current = 2.5 + Math.random() * 3;
    mat.map = blink.current < 0 ? textures.closed : textures.open;
  });

  return (
    <group>
      <mesh ref={sprite} material={mat} castShadow>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.45, 32]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} />
      </mesh>
      <ParticleCore color={contract.palette.primary} glow={contract.palette.glow} element={contract.element.key} energy={0.4} pulseKey={pulseKey} count={420} spread={1.9} position={[0, 1.0, 0]} showCore={false} />
    </group>
  );
}
