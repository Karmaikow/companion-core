/**
 * Cursor de ataque: com o mouse sobre um monstro, a seta some e aparece um alvozinho girando com uma espadinha que
 * balança, dizendo "clique para atacar". Segue o mouse por RAF (sem re-render a cada movimento).
 */
import { useEffect, useRef } from 'react';
import { mousePx } from '../scene/Combat';
import { attackPick } from '../scene/world';

export function AttackCursor() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const d = el.current;
      if (d) {
        const on = !!attackPick.hover && mousePx.inside;
        d.style.opacity = on ? '1' : '0';
        if (on) d.style.transform = `translate(${mousePx.x}px, ${mousePx.y}px)`;
        d.classList.toggle('locked', on && attackPick.hover === attackPick.focus);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={el} className="attack-cursor" aria-hidden="true">
      <svg className="ac-target" viewBox="-20 -20 40 40" width="40" height="40">
        <g className="ac-spin">
          {[0, 90, 180, 270].map((a) => <path key={a} d="M 0 -16 A 16 16 0 0 1 11.3 -11.3" transform={`rotate(${a})`} />)}
        </g>
        <circle r="5" className="ac-core" />
        <circle r="1.6" className="ac-dot" />
      </svg>
      <svg className="ac-sword" viewBox="0 0 24 24" width="22" height="22">
        <path d="M3 3 L14 14" className="ac-blade" />
        <path d="M3 3 L7 3.6 L14.6 11.2 L11.2 14.6 L3.6 7 Z" className="ac-blade-fill" />
        <path d="M11 17 L17 11" className="ac-guard" />
        <path d="M15.5 15.5 L20 20" className="ac-grip" />
        <circle cx="20.6" cy="20.6" r="1.6" className="ac-pommel" />
      </svg>
    </div>
  );
}
