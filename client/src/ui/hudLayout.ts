/**
 * Posição dos botões de ação no celular deitado (ataque, pular/defender/sentar e as 9 habilidades).
 * Cada botão guarda o CENTRO a partir do canto de baixo à direita (px). Sem ajuste da pessoa, vale o arco padrão:
 * duas voltas de habilidades em volta do ataque, com folga entre os botões. O CSS lê tudo por variáveis
 * (--ui-<id>-r, --ui-<id>-b, --ui-s), então o jogo não precisa re-renderizar para mover um botão.
 */
import { create } from 'zustand';

export const HUD_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type HudId = 'attack' | 'jump' | 'block' | 'sit' | `s${(typeof HUD_SLOTS)[number]}`;
export const HUD_IDS: HudId[] = ['attack', 'jump', 'block', 'sit', ...HUD_SLOTS.map((n) => `s${n}` as HudId)];

/** Tamanho (px, antes do ajuste de tamanho) e nome de cada botão. */
export const HUD_SIZE: Record<HudId, number> = {
  attack: 64, jump: 42, block: 42, sit: 42,
  s1: 44, s2: 44, s3: 44, s4: 44, s5: 44, s6: 44, s7: 44, s8: 44, s9: 44,
};
export const HUD_LABEL: Record<HudId, string> = {
  attack: 'Atacar', jump: 'Pular', block: 'Defender', sit: 'Sentar',
  s1: '1', s2: '2', s3: '3', s4: '4', s5: '5', s6: '6', s7: '7', s8: '8', s9: '9',
};

export interface HudPos { r: number; b: number }
export const SIZE_MIN = 0.8, SIZE_MAX = 1.4;
const KEY = 'companion-core:hud:v1';

interface Saved { pos: Partial<Record<HudId, HudPos>>; size: number }
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object') {
      const pos: Saved['pos'] = {};
      for (const id of HUD_IDS) { const p = v.pos?.[id]; if (p && Number.isFinite(p.r) && Number.isFinite(p.b)) pos[id] = { r: p.r, b: p.b }; }
      const size = Number.isFinite(v.size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, v.size)) : 1;
      return { pos, size };
    }
  } catch { /* padrão */ }
  return { pos: {}, size: 1 };
}

/** Arco padrão: o ataque no canto; 4 habilidades na volta de dentro, 5 na de fora; pular/defender/sentar embaixo. */
export function defaultPos(id: HudId, h = typeof innerHeight === 'number' ? innerHeight : 400): HudPos {
  const k = Math.min(1, Math.max(0.66, (h - 70) / 300)); // telas baixas apertam o arco
  const cx = 54, cy = 52; // centro do ataque
  if (id === 'attack') return { r: cx, b: cy };
  if (id === 'jump') return { r: 330, b: 28 };
  if (id === 'block') return { r: 276, b: 28 };
  if (id === 'sit') return { r: 222, b: 28 };
  const n = Number(id.slice(1));
  const inner = n <= 4;
  const i = inner ? n - 1 : n - 5;
  const radius = (inner ? 116 : 182) * k;
  const deg = inner ? 5 + i * 28 : 10 + i * 20;
  const a = (deg * Math.PI) / 180;
  return { r: Math.round(cx + radius * Math.cos(a)), b: Math.round(cy + radius * Math.sin(a)) };
}

interface HudState extends Saved {
  /** editor de posição aberto */
  editing: boolean;
  setPos: (id: HudId, p: HudPos, save?: boolean) => void;
  setSize: (n: number) => void;
  edit: (on: boolean) => void;
  reset: () => void;
  persist: () => void;
}

export const useHud = create<HudState>((set, get) => ({
  ...load(),
  editing: false,
  setPos: (id, p, save = false) => { set({ pos: { ...get().pos, [id]: p } }); if (save) get().persist(); },
  setSize: (n) => { set({ size: Math.min(SIZE_MAX, Math.max(SIZE_MIN, n)) }); get().persist(); },
  edit: (on) => set({ editing: on }),
  reset: () => { set({ pos: {}, size: 1 }); try { localStorage.removeItem(KEY); } catch { /* ok */ } },
  persist: () => { try { const { pos, size } = get(); localStorage.setItem(KEY, JSON.stringify({ pos, size })); } catch { /* só nesta sessão */ } },
}));

/** Posição de agora de um botão (a da pessoa ou a padrão). */
export const hudPos = (id: HudId, pos: Saved['pos'] = useHud.getState().pos): HudPos => pos[id] ?? defaultPos(id);

/** Escreve as variáveis de CSS na raiz. */
function apply() {
  if (typeof document === 'undefined') return;
  const st = document.documentElement.style, { pos, size } = useHud.getState();
  for (const id of HUD_IDS) { const p = hudPos(id, pos); st.setProperty(`--ui-${id}-r`, p.r + 'px'); st.setProperty(`--ui-${id}-b`, p.b + 'px'); }
  st.setProperty('--ui-s', String(size));
}
apply();
useHud.subscribe(apply);
if (typeof window !== 'undefined') window.addEventListener('resize', apply);
