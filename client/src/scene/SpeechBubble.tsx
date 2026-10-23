/**
 * Balão da fala do Companion na cena. A fala da pessoa NÃO aparece aqui (parecia que era ele falando): ela surge
 * junto da caixa de conversa (ChatComposer). Quando a pessoa fala, o balão antigo do Companion some até ele responder.
 */
import { Html } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';

export function SpeechBubble({ text, position }: { text: string | null; position: [number, number, number] }) {
  const said = useGame((s) => s.playerSpeech);
  const textRef = useRef(text);
  textRef.current = text;
  const [stale, setStale] = useState<string | null>(null);
  useEffect(() => { if (said) setStale(textRef.current); }, [said]);
  const show = text && text !== stale ? text : null;
  if (!show) return null;
  return (
    <Html position={position} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="speech-stack">
        <div className="speech" key={show}>{show}</div>
      </div>
    </Html>
  );
}
