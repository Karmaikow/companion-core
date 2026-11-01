/**
 * Cursores do jogo: com o mouse sobre um monstro, a seta vira uma espadinha que balança ("clique para atacar");
 * sobre um prédio que abre um painel (loja, escola, Casa dos Ecos), vira uma portinha dourada ("clique para
 * entrar"). Seguem o mouse por RAF (sem re-render a cada movimento).
 */
import { useEffect, useRef } from 'react';
import { mousePx } from '../scene/Combat';
import { attackPick, buildingHover } from '../scene/world';

export function AttackCursor() {
  const el = useRef<HTMLDivElement>(null), door = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const sword = !!attackPick.hover && mousePx.inside;
      const enter = !sword && buildingHover.on && mousePx.inside;
      for (const [d, on] of [[el.current, sword], [door.current, enter]] as const) {
        if (!d) continue;
        d.style.opacity = on ? '1' : '0';
        if (on) d.style.transform = `translate(${mousePx.x}px, ${mousePx.y}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div ref={el} className="attack-cursor" aria-hidden="true">
        <svg className="ac-sword" viewBox="0 0 24 24" width="22" height="22">
          <path d="M3 3 L14 14" className="ac-blade" />
          <path d="M3 3 L7 3.6 L14.6 11.2 L11.2 14.6 L3.6 7 Z" className="ac-blade-fill" />
          <path d="M11 17 L17 11" className="ac-guard" />
          <path d="M15.5 15.5 L20 20" className="ac-grip" />
          <circle cx="20.6" cy="20.6" r="1.6" className="ac-pommel" />
        </svg>
      </div>
      <div ref={door} className="attack-cursor enter-cursor" aria-hidden="true">
        <svg className="ec-door" viewBox="0 0 26 28" width="24" height="26">
          {/* ponta da seta no canto (onde o clique acontece) */}
          <path d="M1 1 L8 3.2 L3.2 8 Z" className="ec-tip" />
          <path d="M8 26 V13.5 a6.5 6.5 0 0 1 13 0 V26 Z" className="ec-frame" />
          <path d="M10.6 26 V14 a3.9 3.9 0 0 1 7.8 0 V26 Z" className="ec-glow" />
          <circle cx="16.6" cy="20.4" r="0.95" className="ec-knob" />
          <path d="M6 26.2 H23" className="ec-step" />
        </svg>
      </div>
    </>
  );
}
