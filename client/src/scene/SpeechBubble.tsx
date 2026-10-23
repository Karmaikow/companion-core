/** Balões que acompanham o Companion na cena: a fala dele e, logo abaixo, a última fala da pessoa. */
import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { useGame } from '../store';

export function SpeechBubble({ text, position }: { text: string | null; position: [number, number, number] }) {
  const said = useGame((s) => s.playerSpeech);
  const [player, setPlayer] = useState<string | null>(null);
  useEffect(() => {
    setPlayer(said?.text ?? null);
    if (!said) return;
    const t = window.setTimeout(() => setPlayer(null), Math.min(12000, Math.max(5000, said.text.length * 65)));
    return () => window.clearTimeout(t);
  }, [said]);
  if (!text && !player) return null;
  return (
    <Html position={position} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="speech-stack">
        {text && <div className="speech" key={text}>{text}</div>}
        {player && <div className="speech speech-player" key={said?.id}><b>Você</b>{player}</div>}
      </div>
    </Html>
  );
}
