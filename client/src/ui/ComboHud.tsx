/**
 * Contador de combo e nota de Estilo (D Desperto → S Soberano), no canto direito durante a luta; o nome do
 * finalizador pisca no meio ("Lançador · Perfeito!"). Some sozinho quando o combo esfria.
 */
import { useEffect, useState } from 'react';
import { STYLE_MAX, STYLE_RANKS } from '@rules';
import { combo, styleNow } from '../scene/comboState';

export function ComboHud() {
  const [, setVer] = useState(0);
  useEffect(() => {
    let raf = 0, seen = -1, flashOn = false;
    const tick = () => {
      const fl = !!combo.flash && performance.now() - combo.flash.at < 1300;
      if (combo.ver !== seen || fl !== flashOn) { seen = combo.ver; flashOn = fl; setVer((n) => n + 1); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rank = styleNow();
  const show = combo.points > 0 || combo.hits > 1;
  const next = STYLE_RANKS[STYLE_RANKS.indexOf(rank) + 1];
  const pct = next ? (combo.points - rank.min) / (next.min - rank.min) : combo.points / STYLE_MAX;
  const flash = combo.flash && performance.now() - combo.flash.at < 1300 ? combo.flash : null;
  return (
    <>
      {show && (
        <div className="combo-hud" style={{ ['--rk' as string]: rank.color }} aria-live="polite">
          <b key={rank.letter} className="ch-letter">{rank.letter}</b>
          <span className="ch-label">{rank.label}</span>
          <i className="ch-bar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%` }} /></i>
          {combo.hits > 1 && <span key={combo.hits} className="ch-hits">{combo.hits} golpes</span>}
        </div>
      )}
      {flash && <div key={flash.at} className={'combo-flash' + (flash.perfect ? ' perfect' : '')}>{flash.text}</div>}
    </>
  );
}
