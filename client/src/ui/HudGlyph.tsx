import { useId } from 'react';

/** Small vector illustrations: no extra image requests on the game HUD. */
export function HudGlyph({ kind, className = '' }: { kind: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const paths: Record<string, string> = {
    agua: 'M24 5C20 14 11 20 11 29a13 13 0 0 0 26 0C37 20 28 14 24 5ZM17 29c0 5 3 8 7 8',
    gotas: 'M24 5C20 14 11 20 11 29a13 13 0 0 0 26 0C37 20 28 14 24 5ZM17 29c0 5 3 8 7 8',
    fogo: 'M25 4c3 13-12 12-13 25-1 10 8 16 16 13 16-6 8-23 5-26 0 8-7 10-8 4 0-5 3-10 0-16Z',
    chamas: 'M25 4c3 13-12 12-13 25-1 10 8 16 16 13 16-6 8-23 5-26 0 8-7 10-8 4 0-5 3-10 0-16Z',
    gelo: 'M24 4 12 18l4 21 8 5 9-6 4-20L24 4Zm0 0v40M12 18l12 6 13-6M24 24l-8 15m8-15 9 14',
    folhas: 'M25 42V18m0 10C10 29 7 20 8 11c13 1 18 6 17 17Zm0 7c13 1 17-10 16-19-12 1-17 8-16 19Z',
    natureza: 'M25 42V18m0 10C10 29 7 20 8 11c13 1 18 6 17 17Zm0 7c13 1 17-10 16-19-12 1-17 8-16 19Z',
    raios: 'M29 3 11 27h12l-4 18 19-26H26L29 3Z',
    raio: 'M29 3 11 27h12l-4 18 19-26H26L29 3Z',
    vento: 'M6 18h24c10 0 10-12 2-12-4 0-6 3-5 5M5 25h32c8 0 8 12 0 12-4 0-5-3-5-5M10 32h12c8 0 8 11 0 11',
    defesa: 'M24 5 9 12v12c0 10 15 19 15 19s15-9 15-19V12L24 5Zm0 8v22',
    ataque: 'm10 6 29 29-4 4L6 10V6h4Zm28 2L24 22m-9 9L7 41m27-11 9 9m-14-5 10 10M6 35l7 7',
    poder: 'm10 6 29 29-4 4L6 10V6h4Zm28 2L24 22m-9 9L7 41m27-11 9 9m-14-5 10 10M6 35l7 7',
    sintonia: 'M24 5 29 19l14 5-14 5-5 14-5-14-14-5 14-5L24 5Z',
    impacto: 'M24 5 29 19l14 5-14 5-5 14-5-14-14-5 14-5L24 5Z',
    vida: 'M24 42V19m0 11C9 30 6 21 8 11c12 1 17 7 16 19Zm0 6c13 0 17-9 16-19-11 1-17 7-16 19Z',
    energia: 'M9 29c8-14 23 11 30-5M9 21c8-14 23 11 30-5M24 6v36',
    agilidade: 'M9 34c12-26 31-24 31-24S42 32 13 37m0 0 17-15',
    mic: 'M19 8a5 5 0 0 1 10 0v17a5 5 0 0 1-10 0V8Zm-6 14v3a11 11 0 0 0 22 0v-3M24 36v8m-8 0h16',
    send: 'm5 21 38-16-12 38-7-16-19-6Zm19 6L43 5',
    sun: 'M24 14a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM24 2v6m0 32v6M2 24h6m32 0h6M8 8l5 5m22 22 5 5M8 40l5-5M35 13l5-5',
    moon: 'M33 5a20 20 0 1 0 10 29A18 18 0 0 1 33 5Z',
  };
  return <svg className={'hud-glyph ' + className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff3c4"/><stop offset="1" stopColor="currentColor"/></linearGradient></defs>
    <path d={paths[kind] ?? paths.sintonia} stroke={'url(#' + id + ')'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15" />
  </svg>;
}
