/** Barras de HP, SP, Stamina e Vínculo sob o nome do Companion, e os botões de pulo/defesa/sentar no celular. */
import { reviveCompanion, useVitals, INVULN_SECONDS } from '../scene/vitals';
import { moveInput } from '../scene/Combat';

export function VitalsBars({ bondRatio, bondLevel }: { bondRatio: number; bondLevel: number }) {
  const v = useVitals();
  const row = (cls: string, label: string, cur: number, max: number, title: string, pct = false) => (
    <div className={'vbar ' + cls} title={title}>
      <span>{label}</span>
      <div className="bar"><i style={{ width: Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100)) + '%' }} /></div>
      <small>{pct ? `${cur}%` : `${cur}/${max}`}</small>
    </div>
  );
  return (
    <div className={'vitals' + (v.down ? ' down' : '')} key={v.hitId ? 'h' + (v.hitId % 2) : 'h'}>
      {row('hp', 'HP', v.hp, v.hpMax, 'Vida: cai com os golpes das criaturas; zerou, desmaia um pouco')}
      {row('sp', 'SP', v.sp, v.spMax, 'Energia das habilidades da barra (1–9)')}
      {row('st', 'ST', v.st, v.stMax, 'Stamina: pulo, golpe e defesa')}
      {(v.shield > 0 || v.shieldCd > 0) && <div className={'vshield' + (v.shield > 0 ? ' on' : '')} role="status">{v.shield > 0 ? `🛡 Barreira Breve · ${v.shield}s` : `Barreira em recarga · ${v.shieldCd}s`}</div>}
      {v.invuln > 0 && <div className="vshield on invuln" role="status">✦ Invencível · {v.invuln}s</div>}
      {row('bond', 'VÍN', Math.round(bondRatio * 100), 100, `Vínculo ${bondLevel}: % até o próximo nível`, true)}
    </div>
  );
}

/**
 * Desmaiado: aviso no centro com a contagem (a stamina enchendo). Terminada, ele continua deitado e a pessoa escolhe:
 * levantar ali mesmo (metade da vida) ou voltar ao Refúgio (vida cheia). Nos dois casos fica invencível por um tempo.
 */
export function FaintCounter({ onReturn }: { onReturn?: () => void }) {
  const down = useVitals((v) => v.down), wake = useVitals((v) => v.wake), st = useVitals((v) => v.st), stMax = useVitals((v) => v.stMax), ready = useVitals((v) => v.ready);
  if (!down) return null;
  return (
    <div className={'faint-counter' + (ready ? ' ready' : '')} role={ready ? 'dialog' : 'status'} aria-live="polite" aria-label="Desmaiou">
      <b>Desmaiou</b>
      {ready ? (
        <>
          <small>Os monstros se afastaram. Ao levantar, fica {INVULN_SECONDS}s invencível.</small>
          <div className="faint-actions">
            <button className="primary" autoFocus onClick={() => reviveCompanion(false)}>Levantar e continuar</button>
            {onReturn && <button onClick={() => { if (reviveCompanion(true)) onReturn(); }}>Retornar para o Refúgio</button>}
          </div>
        </>
      ) : (
        <>
          <span className="faint-num">{wake}</span>
          <small>recuperando as forças…</small>
          <div className="bar"><i style={{ width: Math.round((st / Math.max(1, stMax)) * 100) + '%' }} /></div>
        </>
      )}
    </div>
  );
}

/** Pulo, defesa e sentar para toque (no PC: Espaço, E e C). */
export function TouchMoves() {
  return (
    <div className="touch-moves">
      <button aria-label="Pular" onPointerDown={(e) => { e.preventDefault(); moveInput.jumpId++; }}>⤒<small>pular</small></button>
      <button aria-label="Defender (segure)" onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); moveInput.block = true; }}
        onPointerUp={() => { moveInput.block = false; }} onPointerCancel={() => { moveInput.block = false; }} onContextMenu={(e) => e.preventDefault()}>🛡<small>defender</small></button>
      <button aria-label="Sentar" onPointerDown={(e) => { e.preventDefault(); moveInput.sitId++; }}>⌄<small>sentar</small></button>
    </div>
  );
}
