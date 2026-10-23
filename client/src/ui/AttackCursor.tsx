/**
 * Cursor de ataque: com o mouse sobre um monstro, a seta vira uma espadinha que balança, dizendo "clique para
 * atacar". Segue o mouse por RAF (sem re-render a cada movimento).
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
        
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={el} className="attack-cursor" aria-hidden="true">
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
