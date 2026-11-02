/**
 * Cursores do jogo, no estilo de ícone dourado com contorno escuro: seta (padrão), mão apontando (botões, lojas e
 * prédios), espada (monstro), mão aberta que fecha no clique (baús), machado / picareta / foice (coleta com a
 * ferramenta certa) e a mesma ferramenta com o sinal de proibido quando falta a ferramenta.
 * São cursores nativos (SVG em data URI nas variáveis --cur-*), sem atraso para seguir o mouse.
 */
import { attackPick } from '../scene/world';

export type CursorKind =
  | 'seta' | 'apontar' | 'atacar' | 'pegar' | 'segurar' | 'proibido'
  | 'machado' | 'picareta' | 'faca' | 'machado-x' | 'picareta-x' | 'faca-x';

const OUT = '#2a1c0e';
const DEFS = `<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset=".5" stop-color="#e6cb88"/><stop offset="1" stop-color="#a97f40"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4ab6c"/><stop offset="1" stop-color="#7a5026"/></linearGradient>
</defs>`;

type Part = { d: string; fill?: 'b' | 'w' } | { c: [number, number, number]; fill?: 'b' | 'w' };
interface Icon { parts: Part[]; lines?: string; shine?: string; hot: [number, number] }

const ICONS: Record<'seta' | 'apontar' | 'atacar' | 'pegar' | 'segurar' | 'machado' | 'picareta' | 'faca', Icon> = {
  seta: { parts: [{ d: 'M4 3 L26 15.5 L15.5 17.5 L10 28 Z' }], lines: 'M4 3 L15.5 17.5', shine: 'M6.6 7.4 L11.4 23', hot: [4, 3] },
  apontar: {
    parts: [{ d: 'M11 4.5 C11 2.6 14 2.6 14 4.5 L14 13.5 C14 11.9 17 11.9 17 13.5 L17 14.5 C17 12.9 20 12.9 20 14.5 L20 15.5 C20 13.9 23 13.9 23 15.5 L23 22 C23 26.2 20.4 29 16.6 29 L14 29 C11.2 29 9.6 27.8 8.2 25.6 L4.6 20 C3.6 18.4 5.4 16.6 7.1 17.8 L11 21 Z' }],
    lines: 'M14 13.5 V17.2 M17 14.5 V17.8 M20 15.5 V18.4', shine: 'M12.2 5 V12', hot: [12, 3],
  },
  pegar: {
    parts: [{ d: 'M8 16.5 V8 C8 6.4 10.6 6.4 10.6 8 V14 V5.5 C10.6 3.9 13.2 3.9 13.2 5.5 V14 V5 C13.2 3.4 15.8 3.4 15.8 5 V14 V7 C15.8 5.4 18.4 5.4 18.4 7 V17 L20.6 14.8 C21.9 13.4 24.1 15 22.9 16.8 L19 23 C17.5 26.5 15 28.2 12.4 28.2 C9.8 28.2 8 26 8 23 Z' }],
    lines: 'M10.6 14 V16 M13.2 14 V16 M15.8 14 V16', shine: 'M9.1 9 V15', hot: [13, 14],
  },
  segurar: {
    parts: [{ d: 'M7.5 15 C7.5 12.6 10.4 12.3 10.7 14 C10.9 11.8 13.6 11.6 14 13.6 C14.4 11.6 17.1 11.6 17.4 13.8 C17.9 12 20.6 12.5 20.6 14.6 V20.6 C20.6 25.4 17.7 28.2 13.8 28.2 C10.1 28.2 7.5 25.6 7.5 21.8 Z' }],
    lines: 'M10.7 14 V16.6 M14 13.6 V16.6 M17.4 13.8 V16.8 M8 18.2 C10 17.4 12 17.6 13.2 18.6', shine: 'M8.8 15 V20', hot: [14, 18],
  },
  atacar: {
    parts: [
      { d: 'M3 3 L9 4.2 L20.5 15.7 L15.7 20.5 L4.2 9 Z' },
      { d: 'M18.6 20.4 L20.4 18.6 L25.6 23.8 L23.8 25.6 Z', fill: 'w' },
      { d: 'M12.8 21.6 L21.6 12.8 L24 15.2 L15.2 24 Z' },
      { c: [26.4, 26.4, 2.6] },
    ],
    lines: 'M5 5 L17.2 17.2', shine: 'M5.4 4.4 L8.4 5', hot: [3, 3],
  },
  machado: {
    parts: [
      { d: 'M10.2 6.2 L12.8 4.8 L28 26 L25.4 27.6 Z', fill: 'w' },
      { d: 'M13.5 3 L15.6 7.6 L10.2 11.2 C8.2 14 6.6 16 5 17.2 C2.4 13 2.6 7 5.6 3.6 C7.4 5.2 10 4.6 13.5 3 Z' },
    ],
    lines: 'M6.2 6 C5 9 5 12 6 14.4', hot: [4, 10],
  },
  picareta: {
    parts: [
      { d: 'M14.6 6.8 L18 6.2 L9.4 28.6 L6.4 27.6 Z', fill: 'w' },
      { d: 'M3 12.5 C8 5 17 2.5 28 4 L28.6 7.2 C19 6.8 11 9 6.2 15 Z' },
    ],
    shine: 'M6 11 C11 6.4 18 4.6 25.4 5', hot: [3, 13],
  },
  faca: {
    parts: [
      { d: 'M21.5 20.5 L24.5 23 L13 30 L11 27.4 Z', fill: 'w' },
      { d: 'M5 9 C9 3 20 1.5 26.5 8 C30 12 28.5 19 23.5 22.5 C25.5 16 23.5 10.5 18 8.6 C13.5 7 8.8 8 5 9 Z' },
    ],
    shine: 'M9 5.8 C14 3.6 21 3.8 25 8.4', hot: [5, 9],
  },
};

const NO = `<circle cx="24" cy="24" r="6.3" fill="#fff" stroke="#b3121b" stroke-width="2.4"/><path d="M19.8 19.8 L28.2 28.2" stroke="#b3121b" stroke-width="2.4"/>`;

function shape(p: Part, attrs: string) {
  return 'd' in p ? `<path d="${p.d}" ${attrs}/>` : `<circle cx="${p.c[0]}" cy="${p.c[1]}" r="${p.c[2]}" ${attrs}/>`;
}

function draw(icon: Icon, no = false): string {
  const shadow = icon.parts.map((p) => shape(p, 'fill="#000" fill-opacity=".45"')).join('');
  const body = icon.parts.map((p) => shape(p, `fill="url(#${p.fill ?? 'b'})" stroke="${OUT}" stroke-width="1.7" stroke-linejoin="round"`)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${DEFS}`
    + `<g transform="translate(1 1.4)">${shadow}</g>${body}`
    + (icon.lines ? `<path d="${icon.lines}" fill="none" stroke="#9a7238" stroke-width="1" stroke-linecap="round"/>` : '')
    + (icon.shine ? `<path d="${icon.shine}" fill="none" stroke="#fffbea" stroke-opacity=".85" stroke-width="1.1" stroke-linecap="round"/>` : '')
    + (no ? NO : '') + '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${icon.hot[0]} ${icon.hot[1]}`;
}

const FALLBACK: Record<CursorKind, string> = {
  seta: 'default', apontar: 'pointer', atacar: 'crosshair', pegar: 'grab', segurar: 'grabbing', proibido: 'not-allowed',
  machado: 'pointer', picareta: 'pointer', faca: 'pointer', 'machado-x': 'not-allowed', 'picareta-x': 'not-allowed', 'faca-x': 'not-allowed',
};
const VALUE = {} as Record<CursorKind, string>;
for (const k of Object.keys(FALLBACK) as CursorKind[]) {
  const [base, x] = k.split('-') as [keyof typeof ICONS | 'proibido', string?];
  VALUE[k] = `${base === 'proibido' ? draw(ICONS.seta, true) : draw(ICONS[base], !!x)}, ${FALLBACK[k]}`;
}

const state = { object: null as CursorKind | null, held: false };
let shown = '';
function apply() {
  const k: CursorKind | null = attackPick.hover ? 'atacar' : state.held && state.object === 'pegar' ? 'segurar' : state.object;
  const v = k ? VALUE[k] : 'var(--cur-seta)';
  if (v === shown) return;
  shown = v;
  document.documentElement.style.setProperty('--cur-canvas', v);
}

/** Cursor de um objeto da cena sob o mouse (null ao sair). */
export function hoverCursor(kind: CursorKind | null) { state.object = kind; apply(); }
/** O alvo de ataque sob o mouse mudou (a espada tem prioridade). */
export function refreshCursor() { apply(); }

/** Põe os cursores nas variáveis CSS e faz a mão fechar no clique. Chamar uma vez. */
export function installCursors() {
  const root = document.documentElement.style;
  for (const k of Object.keys(VALUE) as CursorKind[]) root.setProperty(`--cur-${k}`, VALUE[k]);
  apply();
  let t = 0;
  window.addEventListener('pointerdown', () => {
    if (state.object !== 'pegar') return;
    state.held = true; apply(); window.clearTimeout(t);
    t = window.setTimeout(() => { state.held = false; apply(); }, 320);
  }, true);
}
