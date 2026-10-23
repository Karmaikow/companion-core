/** Balão de fala que acompanha o Companion na cena (texto em HTML, preso a um ponto 3D). */
import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { useGame } from '../store';

export function SpeechBubble({ text, position }: { text: string | null; position: [number, number, number] }) {
  const utterance = useGame((s) => s.playerSpeech);
  const [player, setPlayer] = useState<string | null>(null);
  useEffect(() => {
    setPlayer(utterance?.text ?? null);
    if (!utterance) return;
    const timer = window.setTimeout(() => setPlayer(null), Math.min(12000, Math.max(5000, utterance.text.length * 65)));
    return () => window.clearTimeout(timer);
  }, [utterance]);
  if (!text && !player) return null;
  return (
    <Html position={position} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="speech-stack">
        {text && <div className="speech" key={text}>{text}</div>}
        {player && <div className="speech speech-player" key={utterance?.id}>{player}</div>}
      </div>
    </Html>
  );
}

