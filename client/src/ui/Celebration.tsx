import { useEffect } from 'react';
import { useGame } from '../store';
import { ItemIcon } from './itemIcons';

/** Cartão de conquista no centro da tela, com faíscas. Um de cada vez, em fila. */
export function Celebration({ tint }: { tint: string }) {
  const c = useGame((s) => s.celebrations[0]);
  const dismiss = useGame((s) => s.dismissCelebration);
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(dismiss, c.kind === 'secret' ? 5200 : 3400);
    return () => clearTimeout(t);
  }, [c, dismiss]);
  if (!c) return null;
  return (
    <div className={'celebration ' + c.kind} key={c.id} role="status" aria-live="assertive" onClick={dismiss}>
      <div className="sparks" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--a': `${(i / 14) * 360}deg`, '--d': `${(i % 3) * 0.08}s` } as React.CSSProperties} />)}</div>
      <div className="celebration-card">
        {c.item && <div className="celebration-item"><ItemIcon item={c.item} tint={tint} size={64} /></div>}
        <small>{c.eyebrow}</small>
        <strong>{c.title}</strong>
        {c.subtitle && <p>{c.subtitle}</p>}
      </div>
    </div>
  );
}

/** Chamada grande quando o Companion está pronto para ganhar a primeira forma. */
export function AwakenCall({ name, he }: { name: string; he: boolean }) {
  const open = useGame((s) => s.awakenCall);
  const busy = useGame((s) => s.busy);
  const run = useGame((s) => s.run);
  const dismiss = useGame((s) => s.dismissAwakenCall);
  if (!open) return null;
  return (
    <div className="awaken-call" role="dialog" aria-modal="true" aria-labelledby="awaken-title">
      <div className="rays" aria-hidden="true" />
      <div className="awaken-card">
        <small>O círculo mágico está brilhando</small>
        <h2 id="awaken-title">{name} está {he ? 'pronto' : 'pronta'} para despertar</h2>
        <p>Todas as descobertas foram feitas e o vínculo está forte. As partículas querem virar um corpo de verdade.</p>
        <button className="awaken" disabled={busy} onClick={() => { dismiss(); void run((b) => b.awaken()); }}>Despertar a primeira forma</button>
        <button className="link" onClick={dismiss}>Ainda não — quero aproveitar mais um pouco</button>
      </div>
    </div>
  );
}
