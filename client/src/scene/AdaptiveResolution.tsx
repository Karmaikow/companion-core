/**
 * Resolução adaptativa: quando o jogo não segura a taxa de quadros, desenha com menos pixels; quando sobra folga,
 * volta a subir. O custo da cena cresce quase em linha com o número de pixels, então esta é a alavanca que mais
 * devolve quadros em aparelho fraco e em tela grande.
 *
 * Mede em janelas de ~0,75 s (ignora os primeiros segundos, que são de carregamento, e a aba oculta). Depois de
 * baixar, guarda um teto por um tempo para não ficar subindo e descendo sem parar.
 *
 * No computador (modo alto) nunca desenha abaixo de 1 pixel por pixel da tela: abaixo disso o navegador estica a
 * imagem e os modelos ficam borrados e serrilhados. Medido numa AMD integrada a 1500×780: 1,0 custa ~20 ms por
 * quadro (~50 fps) e 0,75 custa ~13 ms — a diferença não pagava o borrão.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

const LOW_FPS = 42, VERY_LOW_FPS = 28;
/**
 * Acima disto volta a subir. Era 56: com a tela a 60 Hz o jogo quase nunca passa disso, e depois de uma queda (um
 * carregamento, uma tempestade) a resolução ficava presa lá embaixo para sempre.
 */
const GOOD_FPS = 50;

/** Teto e piso da resolução (pixels desenhados por pixel da tela). */
export function resolutionLimits(high: boolean, deviceRatio: number, coarse: boolean): { max: number; min: number } {
  const max = Math.min(high ? 1.75 : 1, Math.max(high ? 1 : 0.75, deviceRatio || 1));
  // celular (tela pequena e densa) aguenta perder nitidez; no computador, abaixo de 1 a imagem borra
  const min = high ? (coarse ? 0.75 : 1) : 0.6;
  return { max, min: Math.min(min, max) };
}

export function AdaptiveResolution({ high }: { high: boolean }) {
  const setDpr = useThree((s) => s.setDpr);
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const { max, min } = resolutionLimits(high, typeof window === 'undefined' ? 1 : window.devicePixelRatio, coarse);
  const st = useRef({ dpr: max, acc: 0, n: 0, good: 0, warm: 3, ceiling: max, ceilingFor: 0 });
  useEffect(() => { st.current = { dpr: max, acc: 0, n: 0, good: 0, warm: 3, ceiling: max, ceilingFor: 0 }; }, [max]);
  // `?dpr=1.25` na URL fixa a resolução (para comparar nitidez e custo sem o ajuste automático no meio)
  const fixed = typeof location === 'undefined' ? NaN : Number(new URLSearchParams(location.search).get('dpr') || NaN);
  useFrame((state, dt) => {
    // em desenvolvimento, `window.__dpr` faz o mesmo sem recarregar (comparação lado a lado)
    const pin = import.meta.env.DEV ? Number((window as { __dpr?: number }).__dpr) || fixed : fixed;
    if (pin > 0) { if (Math.abs(state.viewport.dpr - pin) > 0.01) setDpr(pin); return; }
    const s = st.current;
    // o Canvas reaplica a própria `dpr` sempre que a cena re-renderiza (troca de clima, de hora...): mantém a nossa
    if (Math.abs(state.viewport.dpr - s.dpr) > 0.01) setDpr(s.dpr);
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
