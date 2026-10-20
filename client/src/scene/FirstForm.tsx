import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { IdentityContractV1 } from '@rules';
import { ParticleBody } from './ParticleBody';
import { ParticleCore } from './ParticleCore';

/**
 * Primeira forma. Enquanto a Fábrica de Companions não aprova a arte final,
 * o Companion aparece como um corpo de partículas na silhueta da criatura.
 * Com a arte aprovada, o sprite final entra no lugar (sempre de frente, HD-2D).
 */
export function FirstForm({ contract, pulseKey, artUrl }: { contract: IdentityContractV1; pulseKey: number; artUrl?: string }) {
  const [art, setArt] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!artUrl) { setArt(null); return; }
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(artUrl, (t) => { if (!alive) return t.dispose(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; setArt(t); }, undefined, () => setArt(null));
    return () => { alive = false; };
  }, [artUrl]);

  if (!art) return <ParticleBody contract={contract} pulseKey={pulseKey} />;
  return <ArtSprite texture={art} contract={contract} pulseKey={pulseKey} />;
}

function ArtSprite({ texture, contract, pulseKey }: { texture: THREE.Texture; contract: IdentityContractV1; pulseKey: number }) {
  const sprite = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.05 }), [texture]);
  useEffect(() => () => { mat.dispose(); texture.dispose(); }, [mat, texture]);
  const img = texture.image as { width?: number; height?: number } | undefined;
  const aspect = (img?.width ?? 1) / (img?.height ?? 1);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!sprite.current) return;
    sprite.current.quaternion.copy(state.camera.quaternion);
    sprite.current.position.y = 0.95 + Math.abs(Math.sin(t * 1.6)) * 0.08;
    const squash = 1 + Math.sin(t * 3.2) * 0.015;
    sprite.current.scale.set((1.8 * aspect) / squash, 1.8 * squash, 1);
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
