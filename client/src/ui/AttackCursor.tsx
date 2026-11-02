/**
 * Cursores do jogo: com o mouse sobre um monstro, a seta vira uma espadinha que balança ("clique para atacar");
 * sobre um baú ou um prédio que abre um painel (loja, escola, Casa dos Ecos), vira uma mão que fecha no clique
 * ("pegar"). Seguem o mouse por RAF (sem re-render a cada movimento).
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
    let shut = 0;
    const down = () => {
      const d = door.current;
      if (!d || !buildingHover.on) return;
      d.classList.add('grab'); window.clearTimeout(shut);
      shut = window.setTimeout(() => d.classList.remove('grab'), 320);
    };
    window.addEventListener('pointerdown', down, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointerdown', down, true); window.clearTimeout(shut); };
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
      <div ref={door} className="attack-cursor grab-cursor" aria-hidden="true">
        <svg className="gc-hand" viewBox="0 0 24 28" width="24" height="28">
          {/* aberta: dedos esticados */}
          <g className="gc-open">
            <path className="gc-glove" d="M7 21 C5 18 3.2 15.8 2.6 14.2 C2.1 12.9 3.6 12 4.7 13 L7 15.4 V5.2 C7 3.6 9.4 3.6 9.4 5.2 V12 V3.6 C9.4 2 11.9 2 11.9 3.6 V12 V4.6 C11.9 3 14.4 3 14.4 4.6 V12.4 V6.4 C14.4 4.9 16.8 4.9 16.8 6.4 V15.5 C16.8 18.6 15.6 20.6 14.4 21.6 Z" />
            <path className="gc-line" d="M9.4 12 V9.5 M11.9 12 V9.2 M14.4 12.4 V10" />
          </g>
          {/* fechada: o punho */}
          <g className="gc-closed">
            <path className="gc-glove" d="M6.6 21 C5 19.4 4.4 17.4 4.6 15.4 C4.8 13.6 5.8 12.4 7.2 12 C7.4 10.6 8.8 10 9.9 10.6 C10.4 9.5 12.1 9.3 12.9 10.4 C13.6 9.6 15.2 9.8 15.6 11 C16.8 11 17.4 12 17.3 13.4 L17 17.4 C16.8 19.2 15.8 20.6 14.6 21.6 Z" />
            <path className="gc-line" d="M9.9 10.6 V12.8 M12.9 10.4 V12.8 M15.6 11 V13" />
          </g>
          <path className="gc-cuff" d="M6.6 20.6 H15.2 L15 25.2 H6.8 Z" />
        </svg>
      </div>
    </>
  );
}
