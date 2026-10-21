/** Balão de fala que acompanha o Companion na cena (texto em HTML, preso a um ponto 3D). */
import { Html } from '@react-three/drei';

export function SpeechBubble({ text, position }: { text: string | null; position: [number, number, number] }) {
  if (!text) return null;
  return (
    <Html position={position} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="speech" key={text}>{text}</div>
    </Html>
  );
}
