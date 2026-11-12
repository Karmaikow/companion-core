/**
 * Resolução adaptativa: quando o jogo não segura a taxa de quadros, desenha com menos pixels (a tela fica um pouco
 * menos nítida, mas fluida); quando sobra folga, volta a subir. O custo da cena e dos efeitos cresce quase em linha
 * com o número de pixels, então esta é a alavanca que mais devolve quadros em aparelho fraco e em tela grande.
 *
 * Mede em janelas de ~0,75 s (ignora os primeiros segundos, que são de carregamento, e a aba oculta). Depois de
 * baixar, guarda um teto por um tempo para não ficar subindo e descendo sem parar.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

const LOW_FPS = 42, VERY_LOW_FPS = 28, GOOD_FPS = 56;

export function AdaptiveResolution({ high }: { high: boolean }) {
  const setDpr = useThree((s) => s.setDpr);
  // mesmos limites do Canvas: no modo alto até 1,75; no baixo até 1. O piso é o quanto aceitamos perder de nitidez.
  const max = Math.min(high ? 1.75 : 1, Math.max(high ? 1 : 0.75, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  const min = high ? 0.75 : 0.6;
  const st = useRef({ dpr: max, acc: 0, n: 0, good: 0, warm: 3, ceiling: max, ceilingFor: 0 });
  useEffect(() => { st.current = { dpr: max, acc: 0, n: 0, good: 0, warm: 3, ceiling: max, ceilingFor: 0 }; }, [max]);
  useFrame((state, dt) => {
    const s = st.current;
    // o Canvas reaplica a própria `dpr` sempre que a cena re-renderiza (troca de clima, de hora...): mantém a nossa
    if (s.dpr < max - 0.01 && Math.abs(state.viewport.dpr - s.dpr) > 0.01) setDpr(s.dpr);
    // voltou de uma pausa (aba em segundo plano, travada longa de carregamento): não conta. O limite é alto de
    // propósito: a 2–3 quadros por segundo cada quadro leva ~0,4 s, e é justamente aí que mais precisa baixar.
    if (document.hidden || dt > 2) { s.acc = 0; s.n = 0; return; }
    if (s.warm > 0) { s.warm -= dt; return; }
    s.acc += dt; s.n++;
    if (s.acc < 0.75) return;
    const fps = s.n / s.acc;
    s.ceilingFor -= s.acc; s.acc = 0; s.n = 0;
    if (s.ceilingFor <= 0) s.ceiling = max;
    if (fps < LOW_FPS && s.dpr > min + 0.01) {
      // este nível não segurou: por 20 s não volta a ele
      s.ceiling = Math.max(min, s.dpr - 0.05); s.ceilingFor = 20;
      s.dpr = Math.max(min, s.dpr - (fps < VERY_LOW_FPS ? 0.3 : 0.15)); s.good = 0;
      setDpr(s.dpr);
    } else if (fps > GOOD_FPS) {
      const top = Math.min(max, s.ceiling);
      if (++s.good >= 4 && s.dpr < top - 0.01) { s.dpr = Math.min(top, s.dpr + 0.1); s.good = 0; setDpr(s.dpr); }
    } else s.good = 0;
  });
  return null;
}
