/**
 * Contador de combo e nota de Estilo (D Desperto → S Soberano), no canto direito durante a luta; o nome da técnica
 * pisca no meio ("Lançador · Perfeito!"). Embaixo do nome, a Cadência em andamento: os toques já dados e o que
 * continua daqui. Some sozinho quando o combo esfria.
 */
import { useEffect, useState } from 'react';
import { STYLE_MAX, STYLE_RANKS, type CadenceToken } from '@rules';
import { cadenceView, combo, styleNow } from '../scene/comboState';

const TOKEN: Record<CadenceToken, { text: string; label: string }> = {
  B: { text: '⚔', label: 'golpe básico' }, H1: { text: '1', label: 'habilidade 1' }, H2: { text: '2', label: 'habilidade 2' }, H3: { text: '3', label: 'habilidade 3' },
};

export function ComboHud() {
  const [, setVer] = useState(0);
  useEffect(() => {
    let raf = 0, seen = -1, flashOn = false, cadOn = 0;
    const tick = () => {
      const fl = !!combo.flash && performance.now() - combo.flash.at < 1300;
      const cad = cadenceView().tokens.length; // a cadência também some sozinha quando o tempo passa
      if (combo.ver !== seen || fl !== flashOn || cad !== cadOn) { seen = combo.ver; flashOn = fl; cadOn = cad; setVer((n) => n + 1); }
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
  const cad = cadenceView();
  // o mesmo toque pode levar a mais de uma técnica: mostra cada toque uma vez, com a primeira técnica a que leva
  const hints = cad.next.filter((n, i) => cad.next.findIndex((x) => x.token === n.token) === i);
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
      {cad.tokens.length > 1 && (
        <div className="cadence-hud" role="status" aria-label={`Cadência: ${cad.tokens.map((t) => TOKEN[t].label).join(', ')}`}>
          <span className="cd-done">{cad.tokens.map((t, i) => <b key={i} className={t === 'B' ? 'b' : 'h'}>{TOKEN[t].text}</b>)}</span>
          {hints.length > 0 && (
            <span className="cd-next">
              {hints.map((n) => <i key={n.token} title={n.name}><b className={n.token === 'B' ? 'b' : 'h'}>{TOKEN[n.token].text}</b>{n.name}</i>)}
            </span>
          )}
        </div>
      )}
    </>
  );
}
