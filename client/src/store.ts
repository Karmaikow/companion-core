import { create } from 'zustand';
import { QUESTS, QUEST_REWARDS, SECRET_BY_KEY, SECRET_XP, SECRET_BOOST_TURNS, ELEMENTS, type QuestKey, type SecretKey } from '@rules';
import type { Backend, Snapshot } from './backend/types';

export type Tab = 'chat' | 'memories' | 'diary' | 'quests' | 'inventory' | 'recipes' | 'skills' | 'bond';

export interface Toast { id: number; text: string; tone: 'gold' | 'soft' | 'warn' }

/** Momento de comemoração mostrado no centro da tela. */
export interface Celebration { id: number; kind: 'quest' | 'secret' | 'recipe'; eyebrow: string; title: string; subtitle?: string; item?: string }

interface State {
  backend: Backend | null;
  snap: Snapshot | null;
  tab: Tab | null;
  busy: boolean;
  error: string | null;
  mood: string;
  lastReply: string | null;
  pulse: number; // incrementa a cada descoberta — dispara o efeito no núcleo
  burst: number; // incrementa em conquistas grandes (segredo, despertar pronto)
  toasts: Toast[];
  celebrations: Celebration[];
  awakenCall: boolean;
  setBackend(b: Backend | null): void;
  setTab(t: Tab | null): void;
  run(fn: (b: Backend) => Promise<Snapshot>): Promise<void>;
  toast(text: string, tone?: Toast['tone']): void;
  celebrate(c: Omit<Celebration, 'id'>): void;
  dismissCelebration(): void;
  dismissAwakenCall(): void;
}

let seq = 0;
const awakenSeenKey = (id: string) => 'companion-core:awaken-call:' + id;

export const useGame = create<State>((set, get) => ({
  backend: null,
  snap: null,
  tab: 'chat',
  busy: false,
  error: null,
  mood: 'curiosa',
  lastReply: null,
  pulse: 0,
  burst: 0,
  toasts: [],
  celebrations: [],
  awakenCall: false,
  setBackend: (backend) => set({ backend, snap: null, error: null, lastReply: null, celebrations: [], awakenCall: false }),
  setTab: (tab) => set({ tab }),
  toast: (text, tone = 'soft') => {
    const t = { id: ++seq, text, tone };
    set({ toasts: [...get().toasts, t].slice(-4) });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), 4200);
  },
  celebrate: (c) => set({ celebrations: [...get().celebrations, { ...c, id: ++seq }] }),
  dismissCelebration: () => set({ celebrations: get().celebrations.slice(1) }),
  dismissAwakenCall: () => {
    const id = get().snap?.companion?.id;
    if (id) try { localStorage.setItem(awakenSeenKey(id), '1'); } catch { /* sem armazenamento */ }
    set({ awakenCall: false });
  },
  run: async (fn) => {
    const b = get().backend;
    if (!b || get().busy) return;
    set({ busy: true, error: null });
    try {
      const snap = await fn(b);
      const prevStage = get().snap?.companion?.stage;
      set({ snap });
      const d = snap.companion?.discoveries ?? {};
      const t = snap.turn;
      if (t) {
        set({ mood: t.mood, lastReply: t.reply });
        for (const k of t.completed) {
          const q = QUESTS.find((x) => x.key === k);
          const value = k === 'color' ? d.colorName : k === 'species' ? d.species : k === 'bond' ? d.playerAddress : k === 'dream' ? d.dream
            : k === 'essence' && d.element ? ELEMENTS[d.element].label : k === 'identity' ? d.name : undefined;
          get().celebrate({ kind: 'quest', eyebrow: 'Descoberta', title: q?.title ?? k, subtitle: value ? String(value) : undefined, item: QUEST_REWARDS[k as QuestKey]?.item });
        }
        if (t.completed.length) set({ pulse: get().pulse + 1 });
        if (t.renamed) get().celebrate({ kind: 'quest', eyebrow: 'Novo nome', title: t.renamed });
        for (const r of t.recipes ?? []) get().celebrate({ kind: 'recipe', eyebrow: 'Livro de receitas', title: r, subtitle: 'Anotada! Os ingredientes esperam lá fora.' });
        if (t.levelUp) get().toast(`Vínculo nível ${t.levelUp}`, 'gold');
        if (t.xp?.boosted) get().toast('Impulso: XP em dobro nesta conversa', 'soft');
      }
      for (const k of [...(t?.secrets ?? []), ...(snap.dream?.secrets ?? [])]) {
        const s = SECRET_BY_KEY[k as SecretKey];
        if (!s) continue;
        get().celebrate({ kind: 'secret', eyebrow: 'Quest secreta!', title: s.title, subtitle: `${s.story} +${SECRET_XP} de vínculo, e as próximas ${SECRET_BOOST_TURNS} conversas valem o dobro.`, item: s.item.item });
        set({ burst: get().burst + 1, pulse: get().pulse + 1 });
      }
      if (snap.dream) get().toast(snap.dream.dreamed ? 'Uma nova página no diário' : snap.dream.reason ?? '', snap.dream.dreamed ? 'gold' : 'soft');
      // chamada do despertar: uma vez por Companion, quando tudo fica pronto
      const c = snap.companion;
      if (c && c.stage === 'particles' && snap.awakening?.ready && !get().awakenCall) {
        let seen = false;
        try { seen = localStorage.getItem(awakenSeenKey(c.id)) === '1'; } catch { /* ignore */ }
        if (!seen) set({ awakenCall: true, burst: get().burst + 1 });
      }
      if (prevStage === 'particles' && c?.stage === 'awakened') set({ pulse: get().pulse + 1, burst: get().burst + 1, tab: null, awakenCall: false });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ busy: false });
    }
  },
}));
