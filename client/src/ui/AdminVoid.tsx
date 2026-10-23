/**
 * Tela de quem abre /#/admin sem ser administrador: fundo preto, o título "O Administrador" e uma partícula grande
 * branco-azulada feita de milhares de pontinhos. O mouse (ou o dedo) empurra as partículas; clicar, tocar, rolar ou
 * apertar uma tecla faz tudo pulsar. Nada do painel aparece aqui.
 * `onLogin`: conta sem login — um link discreto abre o formulário (para o ADM entrar).
 */
import { useEffect, useRef } from 'react';

interface P { ox: number; oy: number; x: number; y: number; vx: number; vy: number; r: number; tw: number; hue: number }

export function AdminVoid({ onLogin }: { onLogin?: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const c = cv.current!, ctx = c.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, R = 0, dpr = 1, ps: P[] = [];
    const mouse = { x: -1e4, y: -1e4, on: false };
    let pulse = 0, raf = 0, t0 = performance.now();
    const build = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(w, h) * 0.26;
      const n = Math.round(Math.min(2600, (w * h) / 420));
      ps = Array.from({ length: n }, () => {
        // mais denso no centro (núcleo), espalhado na borda (halo)
        const a = Math.random() * Math.PI * 2, d = R * Math.pow(Math.random(), 0.65) * (Math.random() < 0.12 ? 1.45 : 1);
        const ox = Math.cos(a) * d, oy = Math.sin(a) * d;
        return { ox, oy, x: ox, y: oy, vx: 0, vy: 0, r: 0.5 + Math.random() * 1.7, tw: Math.random() * Math.PI * 2, hue: 195 + Math.random() * 30 };
      });
    };
    build();
    const kick = (k = 1) => {
      pulse = Math.min(1.6, pulse + 0.7 * k);
      for (const p of ps) { const d = Math.hypot(p.x, p.y) || 1; p.vx += (p.x / d) * 6 * k * Math.random(); p.vy += (p.y / d) * 6 * k * Math.random(); }
    };
    const move = (e: PointerEvent) => { mouse.x = e.clientX - w / 2; mouse.y = e.clientY - h / 2; mouse.on = true; };
    const leave = () => { mouse.on = false; mouse.x = mouse.y = -1e4; };
    const down = (e: PointerEvent) => { move(e); kick(1); };
    const key = () => kick(0.6);
    const wheel = () => kick(0.35);
    addEventListener('pointermove', move); addEventListener('pointerdown', down); addEventListener('pointerleave', leave);
    addEventListener('keydown', key); addEventListener('wheel', wheel, { passive: true }); addEventListener('resize', build);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      const time = now / 1000;
      pulse *= Math.pow(0.25, dt);
      const breath = 1 + Math.sin(time * 1.6) * 0.035 + pulse * 0.18;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(0, 0, w, h); // rastro curto
      ctx.save(); ctx.translate(w / 2, h / 2);
      // brilho do núcleo
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.5 * breath);
      g.addColorStop(0, `rgba(235,246,255,${0.55 + pulse * 0.3})`); g.addColorStop(0.25, `rgba(150,205,255,${0.22 + pulse * 0.2})`); g.addColorStop(1, 'rgba(40,80,160,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.5 * breath, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const rot = reduce ? 0 : time * 0.06, cs = Math.cos(rot), sn = Math.sin(rot);
      for (const p of ps) {
        // volta para o lugar (girando devagar e respirando), e foge do mouse
        const tx = (p.ox * cs - p.oy * sn) * breath, ty = (p.ox * sn + p.oy * cs) * breath;
        p.vx += (tx - p.x) * 3.2 * dt * 10; p.vy += (ty - p.y) * 3.2 * dt * 10;
        if (mouse.on) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy, rr = R * 0.55;
          if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1, f = (1 - d / rr) * 140 * dt * 10; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
        }
        p.vx *= 0.86; p.vy *= 0.86;
        p.x += p.vx * dt * 6; p.y += p.vy * dt * 6;
        const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 2.2 + p.tw)) + pulse * 0.3;
        ctx.fillStyle = `hsla(${p.hue},100%,${82 + pulse * 10}%,${Math.min(1, a)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + pulse * 0.6), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (title.current) title.current.style.textShadow = `0 0 ${12 + pulse * 30}px rgba(150,210,255,${0.55 + pulse * 0.4})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move); removeEventListener('pointerdown', down); removeEventListener('pointerleave', leave);
      removeEventListener('keydown', key); removeEventListener('wheel', wheel); removeEventListener('resize', build);
    };
  }, []);
  return (
    <div className="admin-void">
      <canvas ref={cv} aria-hidden="true" />
      <h1 ref={title}>O Administrador</h1>
      {onLogin && <button className="admin-void-login" onClick={onLogin}>entrar</button>}
    </div>
  );
}
