/** Tinta de tela do clima (escurece na chuva, alaranja na areia, aquece no sol) e o clarão do relâmpago. */
import { useEffect, useRef } from 'react';
import { weatherNow } from '../scene/Weather';

const TINT: Record<string, [number, number, number, number]> = {
  limpo: [0, 0, 0, 0], sol: [255, 205, 130, 0.2], chuva: [35, 45, 65, 0.36], tempestade: [20, 25, 45, 0.52],
  nevoa: [235, 238, 246, 0.4], neve: [215, 232, 255, 0.28], areia: [205, 135, 60, 0.5],
};

export function WeatherOverlay() {
  const tint = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, kind = '', tintOp = '', flashOp = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // o degradê só é desenhado quando o clima muda; a força entra pela opacidade (sem repintar a tela)
      if (tint.current && weatherNow.kind !== kind) {
        kind = weatherNow.kind;
        const [r, g, b, a] = TINT[kind] ?? TINT.limpo;
        tint.current.style.background = `radial-gradient(ellipse at 50% 40%, rgba(${r},${g},${b},${a * 0.6}) 0%, rgba(${r},${g},${b},${a}) 100%)`;
      }
      const t = weatherNow.k.toFixed(2), f = (weatherNow.flash * 0.75).toFixed(2);
      if (tint.current && t !== tintOp) tint.current.style.opacity = tintOp = t;
      if (flash.current && f !== flashOp) flash.current.style.opacity = flashOp = f;
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div ref={tint} className="weather-tint" aria-hidden />
      <div ref={flash} className="weather-flash" aria-hidden />
    </>
  );
}
