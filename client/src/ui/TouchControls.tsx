/**
 * Celular deitado (paisagem): joystick virtual à esquerda (perto da borda corre, perto do centro anda) e o pedido
 * de girar o celular quando ele está em pé. "Jogar deitado" entra em tela cheia e trava em paisagem (Android; no
 * iPhone o navegador não deixa travar, então só pede para girar).
 */
import { useEffect, useRef, useState } from 'react';
import { moveInput } from '../scene/combatInput';

/** Celular/tablet com toque deitado (layout de jogo com joystick). */
export function useTouchLandscape() {
  const q = '(pointer: coarse) and (orientation: landscape) and (max-height: 600px)';
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), f = () => setOn(m.matches);
    m.addEventListener('change', f); return () => m.removeEventListener('change', f);
  }, []);
  return on;
}
/** Celular em pé (para o aviso de girar). */
export function useTouchPortrait() {
  const q = '(pointer: coarse) and (orientation: portrait) and (max-width: 600px)';
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), f = () => setOn(m.matches);
    m.addEventListener('change', f); return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

export async function goLandscape() {
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (!document.fullscreenElement) await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch { /* o navegador não deixa travar: a pessoa gira na mão */ }
}

export function RotateHint() {
  const portrait = useTouchPortrait();
  const [skip, setSkip] = useState(() => { try { return sessionStorage.getItem('cc-rotate-skip') === '1'; } catch { return false; } });
  if (!portrait || skip) return null;
  return (
    <div className="rotate-hint" role="dialog" aria-label="Girar o celular">
      <div className="rotate-phone" aria-hidden="true" />
      <p><b>Gire o celular</b>Deitado o jogo tem joystick, atalhos e mais espaço para ver o mundo.</p>
      <div className="rotate-actions">
        <button className="primary" onClick={() => void goLandscape()}>Jogar deitado</button>
        <button onClick={() => { setSkip(true); try { sessionStorage.setItem('cc-rotate-skip', '1'); } catch { /* ok */ } }}>Continuar em pé</button>
      </div>
    </div>
  );
}

/** Joystick: arrastar a partir de qualquer ponto da área de baixo à esquerda (ele aparece onde o dedo tocou). */
export function Joystick() {
  const zone = useRef<HTMLDivElement>(null), base = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null);
  const R = 52;
  useEffect(() => {
    const z = zone.current!;
    let id: number | null = null, cx = 0, cy = 0;
    const show = (x: number, y: number) => { const b = base.current!; b.style.left = x + 'px'; b.style.top = y + 'px'; b.classList.add('on'); };
    const move = (x: number, y: number) => {
      let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
      moveInput.stick.x = dx / R; moveInput.stick.y = -dy / R; moveInput.stick.on = true;
    };
    const end = () => {
      id = null; moveInput.stick.on = false; moveInput.stick.x = moveInput.stick.y = 0;
      knob.current!.style.transform = ''; base.current!.classList.remove('on');
      const r = z.getBoundingClientRect(); const b = base.current!; b.style.left = r.width * 0.5 + 'px'; b.style.top = r.height * 0.55 + 'px';
    };
    const down = (e: PointerEvent) => {
      if (id !== null) return;
      id = e.pointerId; z.setPointerCapture(e.pointerId); e.preventDefault();
      const r = z.getBoundingClientRect(); cx = e.clientX - r.left; cy = e.clientY - r.top; show(cx, cy); move(cx, cy);
      cx = e.clientX - r.left; cy = e.clientY - r.top;
    };
    const mv = (e: PointerEvent) => { if (e.pointerId !== id) return; const r = z.getBoundingClientRect(); move(e.clientX - r.left, e.clientY - r.top); };
    const up = (e: PointerEvent) => { if (e.pointerId === id) end(); };
    z.addEventListener('pointerdown', down); z.addEventListener('pointermove', mv); z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
    end();
    return () => { z.removeEventListener('pointerdown', down); z.removeEventListener('pointermove', mv); z.removeEventListener('pointerup', up); z.removeEventListener('pointercancel', up); moveInput.stick.on = false; };
  }, []);
  return (
    <div ref={zone} className="joy-zone" aria-label="Joystick: arraste para andar; perto da borda corre" role="application">
      <div ref={base} className="joy-base"><div ref={knob} className="joy-knob" /></div>
    </div>
  );
}
