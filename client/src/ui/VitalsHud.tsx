/** Barras de HP, SP, Stamina e Vínculo sob o nome do Companion, e os botões de pulo/defesa/sentar no celular. */
import { reviveCompanion, useVitals, INVULN_SECONDS } from '../scene/vitals';
import { moveInput } from '../scene/combatInput';

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

/** Ícones dos botões de toque (traço dourado, preenchimento suave). */
function MoveIcon({ kind }: { kind: 'pular' | 'defender' | 'sentar' }) {
  const stroke = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className="tm-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {kind === 'pular' && <>
        <path d="M7 12.5 12 7.5l5 5" {...stroke} />
        <path d="M7 7.5 12 2.5l5 5" {...stroke} opacity=".55" />
        <ellipse cx="12" cy="19.5" rx="6" ry="1.6" fill="currentColor" opacity=".35" />
        <path d="M12 8v8.5" {...stroke} />
      </>}
      {kind === 'defender' && <>
        <path d="M12 2.8 19.5 5.6v5.6c0 5-3.4 8.6-7.5 10-4.1-1.4-7.5-5-7.5-10V5.6L12 2.8Z" fill="currentColor" fillOpacity=".18" {...stroke} />
        <path d="M12 6.5v11M8.2 10.5h7.6" {...stroke} strokeWidth={1.6} opacity=".85" />
      </>}
      {kind === 'sentar' && <>
        <circle cx="9.5" cy="4.6" r="2.1" fill="currentColor" />
        <path d="M9.5 8v6.2h5.3l.9 5.6" {...stroke} />
        <path d="M9.5 10.4l3.6 1.6" {...stroke} />
        <path d="M4.5 17h8" {...stroke} opacity=".55" />
      </>}
    </svg>
  );
}

/** Pulo, defesa e sentar para toque (no PC: Espaço, E e C). */
export function TouchMoves() {
  return (
    <div className="touch-moves">
      <button aria-label="Pular" onPointerDown={(e) => { e.preventDefault(); moveInput.jumpId++; }}><MoveIcon kind="pular" /><small>pular</small></button>
      <button aria-label="Defender (segure)" onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); moveInput.block = true; }}
        onPointerUp={() => { moveInput.block = false; }} onPointerCancel={() => { moveInput.block = false; }} onContextMenu={(e) => e.preventDefault()}><MoveIcon kind="defender" /><small>defender</small></button>
      <button aria-label="Sentar" onPointerDown={(e) => { e.preventDefault(); moveInput.sitId++; }}><MoveIcon kind="sentar" /><small>sentar</small></button>
    </div>
  );
}
