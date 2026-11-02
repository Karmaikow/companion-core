/**
 * Cursores do jogo, no estilo cozy de desenho animado: contorno grosso arroxeado, formas gordinhas e arredondadas,
 * cores chapadas com um brilho branco. Seta (padrão), luva branca apontando (botões, lojas e prédios), espada
 * (monstro), luva aberta que fecha no clique (baús), machado / picareta / foice (coleta com a ferramenta certa) e a
 * mesma ferramenta com o sinal de proibido quando falta a ferramenta.
 * São cursores nativos (SVG em data URI nas variáveis --cur-*), sem atraso para seguir o mouse.
 */
import { attackPick } from '../scene/world';

export type CursorKind =
  | 'seta' | 'apontar' | 'atacar' | 'pegar' | 'segurar' | 'proibido'
  | 'machado' | 'picareta' | 'faca' | 'machado-x' | 'picareta-x' | 'faca-x';

const OUT = '#3a2440';
type Fill = 'luva' | 'metal' | 'madeira' | 'ouro' | 'azul' | 'vermelho';
const GRAD: Record<Fill, [string, string]> = {
  luva: ['#ffffff', '#e6e0f0'], metal: ['#f6faff', '#aebcd6'], madeira: ['#d79a5e', '#8f5832'],
  ouro: ['#ffe68a', '#f0a63a'], azul: ['#9dbcff', '#5574cf'], vermelho: ['#ff9a8f', '#e0525a'],
};
const DEFS = '<defs>' + (Object.keys(GRAD) as Fill[]).map((k) => `<linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GRAD[k][0]}"/><stop offset="1" stop-color="${GRAD[k][1]}"/></linearGradient>`).join('') + '</defs>';

type Part = { d: string; fill?: Fill } | { c: [number, number, number]; fill?: Fill };
interface Icon { parts: Part[]; lines?: string; shine?: string; hot: [number, number] }

// punho da luva (o "babado" no pulso), usado nas três mãos
const cuff = (y: number, x0 = 7, x1 = 23): Part => ({ d: `M${x0 + 1.6} ${y} H${x1 - 1.6} C${x1 - 0.2} ${y} ${x1 + 0.6} ${y + 0.9} ${x1 + 0.6} ${y + 2.4} C${x1 + 0.6} ${y + 3.9} ${x1 - 0.2} ${y + 4.8} ${x1 - 1.6} ${y + 4.8} H${x0 + 1.6} C${x0 + 0.2} ${y + 4.8} ${x0 - 0.6} ${y + 3.9} ${x0 - 0.6} ${y + 2.4} C${x0 - 0.6} ${y + 0.9} ${x0 + 0.2} ${y} ${x0 + 1.6} ${y} Z`, fill: 'luva' });
// dedo gordinho arredondado (de x a x+3,8, da ponta `top` até a base y=15)
const finger = (x: number, top: number): Part => ({ d: `M${x} 15 V${top + 1.9} C${x} ${top - 0.6} ${x + 3.8} ${top - 0.6} ${x + 3.8} ${top + 1.9} V15 Z`, fill: 'luva' });

const ICONS: Record<'seta' | 'apontar' | 'atacar' | 'pegar' | 'segurar' | 'machado' | 'picareta' | 'faca', Icon> = {
  seta: {
    parts: [{ d: 'M5 3 L5 23.5 L10.4 19.2 L13.9 26.6 C14.5 27.9 15.6 28.2 16.6 27.7 L18.4 26.9 C19.5 26.4 19.8 25.3 19.2 24.1 L15.8 17.4 L22.6 17.4 Z', fill: 'luva' }],
    shine: 'M7.4 7.4 V16.6', hot: [5, 3],
  },
  apontar: {
    parts: [
      { d: 'M10 14 V5 C10 2.4 15 2.4 15 5 V11.5 C16.2 10.4 18.4 10.8 18.8 12.4 C20 11.4 22.2 12 22.4 13.8 C23.8 13.4 25 14.6 24.8 16.2 L24.4 21 C24.1 23.8 22 25.4 19.2 25.4 H13 C10 25.4 8 23.6 7.6 21 L7 17.6 C6.7 15.6 8.4 14 10 14 Z', fill: 'luva' },
      cuff(24.2, 8, 24),
    ],
    lines: 'M15 11.8 V15.8 M18.8 12.6 V16.2 M22.4 14 V17', shine: 'M11.8 5.2 V10.4', hot: [12.5, 3],
  },
  pegar: {
    parts: [
      finger(7.2, 7), finger(10.4, 4.4), finger(13.6, 3.6), finger(16.8, 5.4),
      { d: 'M19.4 18.6 L22.2 15.4 C23.5 14 25.7 15.6 24.6 17.4 L21.4 22 Z', fill: 'luva' },
      { d: 'M7.6 13.6 H20.4 V20.4 C20.4 23.4 18.2 25.2 15.2 25.2 H12.8 C9.8 25.2 7.6 23.4 7.6 20.4 Z', fill: 'luva' },
      cuff(24.2, 7.4, 21),
    ],
    shine: 'M9.2 8.6 V12.4', hot: [14, 14],
  },
  segurar: {
    parts: [
      { d: 'M7.6 16 C7.6 13.6 9.6 12.2 11.6 12.6 C12.2 11 14.6 10.6 15.8 12 C16.8 10.8 19.2 10.9 19.9 12.6 C21.6 12.2 23.6 13.4 23.6 15.6 V20.4 C23.6 23.4 21.4 25.2 18.4 25.2 H13 C10 25.2 7.6 23.4 7.6 20.4 Z', fill: 'luva' },
      cuff(24.2, 8, 23.4),
    ],
    lines: 'M11.6 12.6 C11.4 14 11.6 15.4 12.2 16.4 M15.8 12 C15.6 13.6 15.8 15 16.4 16 M19.9 12.6 C19.7 14 19.9 15.2 20.4 16.2 M8.4 18.8 C10.8 17.6 13.4 17.8 15 19', shine: 'M9.4 15 V18', hot: [15, 17],
  },
  atacar: {
    parts: [
      { d: 'M3.5 3.5 L10 5 L21 16 L16 21 L5 10 Z', fill: 'metal' },
      { d: 'M18.4 21 L21 18.4 L25.6 23 L23 25.6 Z', fill: 'azul' },
      { d: 'M12.4 21.8 C11.6 21 11.6 19.8 12.4 19 L19 12.4 C19.8 11.6 21 11.6 21.8 12.4 L22.6 13.2 C23.4 14 23.4 15.2 22.6 16 L16 22.6 C15.2 23.4 14 23.4 13.2 22.6 Z', fill: 'ouro' },
      { c: [26.2, 26.2, 2.8], fill: 'vermelho' },
    ],
    lines: 'M5.8 5.8 L17 17', shine: 'M5.6 4.8 L8.6 5.4', hot: [3.5, 3.5],
  },
  machado: {
    parts: [
      { d: 'M11 7 L13.6 5.6 L28 26 C28.4 26.6 28.2 27.2 27.6 27.6 L26.4 28.2 C25.8 28.6 25.2 28.4 24.8 27.8 Z', fill: 'madeira' },
      { d: 'M13.8 3.2 C15 3.2 16.2 4.6 15.8 6 L15.2 8 L10.4 11.2 C8.8 13.6 7.4 15.4 5.6 16.8 C2.6 13.2 2.6 7.4 5.6 3.8 C8.2 5 11 4.2 13.8 3.2 Z', fill: 'metal' },
    ],
    shine: 'M6.4 6.4 C5.4 8.6 5.4 11 6.2 13', hot: [4, 10],
  },
  picareta: {
    parts: [
      { d: 'M14.8 7.4 L18 6.8 L9.6 28.6 C9.4 29.2 8.8 29.4 8.2 29.2 L7.2 28.8 C6.6 28.6 6.4 28 6.6 27.4 Z', fill: 'madeira' },
      { d: 'M3 13 C7.6 5.4 17.4 2.4 28.2 4 C29.4 4.2 29.6 5.6 28.8 6.4 L28.4 6.8 C19 6.6 11 9 6.2 15.2 C5.2 16.4 3 15.6 3 14 Z', fill: 'metal' },
    ],
    shine: 'M6.4 10.8 C11 6.6 17.6 4.8 24.6 5', hot: [3, 13],
  },
  faca: {
    parts: [
      { d: 'M21.5 20.5 L24.5 23 L13.2 30 C12.4 30.4 11.4 30 11 29.2 L10.8 28.6 C10.6 27.8 11 27 11.8 26.6 Z', fill: 'madeira' },
      { d: 'M5 9 C9 3 20 1.5 26.5 8 C30 12 28.5 19 23.5 22.5 C25.5 16 23.5 10.5 18 8.6 C13.5 7 8.8 8 5 9 Z', fill: 'metal' },
    ],
    shine: 'M9 5.8 C14 3.6 21 3.8 25 8.4', hot: [5, 9],
  },
};

const NO = `<circle cx="24" cy="24" r="6.6" fill="#fff" stroke="#e0444a" stroke-width="2.6"/><path d="M19.6 19.6 L28.4 28.4" stroke="#e0444a" stroke-width="2.8" stroke-linecap="round"/>`;

function shape(p: Part, attrs: string) {
  return 'd' in p ? `<path d="${p.d}" ${attrs}/>` : `<circle cx="${p.c[0]}" cy="${p.c[1]}" r="${p.c[2]}" ${attrs}/>`;
}

function draw(icon: Icon, no = false): string {
  // sombra macia arroxeada, contorno grosso e redondo, brilho branco
  const shadow = icon.parts.map((p) => shape(p, `fill="#2a1a3a" fill-opacity=".32" stroke="#2a1a3a" stroke-opacity=".32" stroke-width="2" stroke-linejoin="round"`)).join('');
  const body = icon.parts.map((p) => shape(p, `fill="url(#${p.fill ?? 'luva'})" stroke="${OUT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${DEFS}`
    + `<g transform="translate(0.8 1.4)">${shadow}</g>${body}`
    + (icon.lines ? `<path d="${icon.lines}" fill="none" stroke="#a99cc0" stroke-width="1.2" stroke-linecap="round"/>` : '')
    + (icon.shine ? `<path d="${icon.shine}" fill="none" stroke="#ffffff" stroke-opacity=".95" stroke-width="1.5" stroke-linecap="round"/>` : '')
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
