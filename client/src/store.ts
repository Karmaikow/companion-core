import { create } from 'zustand';
import type { Backend, Snapshot } from './backend/types';

export type Tab = 'chat' | 'memories' | 'diary' | 'quests' | 'inventory' | 'bond';

export interface Toast { id: number; text: string; tone: 'gold' | 'soft' | 'warn' }

interface State {
  backend: Backend | null;
  snap: Snapshot | null;
  tab: Tab | null;
  busy: boolean;
  error: string | null;
  mood: string;
  lastReply: string | null;
  pulse: number; // incrementa a cada descoberta — dispara o efeito no núcleo
  toasts: Toast[];
  setBackend(b: Backend | null): void;
  setTab(t: Tab | null): void;
  run(fn: (b: Backend) => Promise<Snapshot>): Promise<void>;
  toast(text: string, tone?: Toast['tone']): void;
}

let toastSeq = 0;

export const useGame = create<State>((set, get) => ({
  backend: null,
  snap: null,
  tab: 'chat',
  busy: false,
  error: null,
  mood: 'curiosa',
  lastReply: null,
  pulse: 0,
  toasts: [],
  setBackend: (backend) => set({ backend, snap: null, error: null, lastReply: null }),
  setTab: (tab) => set({ tab }),
  toast: (text, tone = 'soft') => {
    const t = { id: ++toastSeq, text, tone };
    set({ toasts: [...get().toasts, t].slice(-4) });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), 4200);
  },
  run: async (fn) => {
    const b = get().backend;
    if (!b || get().busy) return;
    set({ busy: true, error: null });
    try {
      const snap = await fn(b);
      const prevStage = get().snap?.companion?.stage;
      set({ snap });
      const t = snap.turn;
      if (t) {
        set({ mood: t.mood, lastReply: t.reply });
        const labels: Record<string, string> = { identity: 'Quem sou eu?', color: 'Minha cor', traits: 'O que sinto?', species: 'Que criatura serei?', essence: 'Minha essência', bond: 'Primeiro laço', dream: 'Primeiro sonho' };
        for (const k of t.completed) get().toast(`Descoberta: ${labels[k] ?? k}`, 'gold');
        if (t.completed.length) set({ pulse: get().pulse + 1 });
        if (t.levelUp) get().toast(`Vínculo nível ${t.levelUp}`, 'gold');
        if (t.renamed) get().toast(`Novo nome: ${t.renamed}`, 'gold');
        if (t.awakeningReady && snap.companion?.stage === 'particles') get().toast('Algo está pronto para despertar…', 'gold');
      }
      if (snap.dream) get().toast(snap.dream.dreamed ? 'Uma nova página no diário' : snap.dream.reason ?? '', snap.dream.dreamed ? 'gold' : 'soft');
      if (prevStage === 'particles' && snap.companion?.stage === 'awakened') set({ pulse: get().pulse + 1, tab: null });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ busy: false });
    }
  },
}));
