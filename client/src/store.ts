import { create } from 'zustand';
import { ALL_CATALOG_ITEMS, type Equipped, type ItemDef } from '@rules';
import { QUESTS, QUEST_REWARDS, SECRET_BY_KEY, SECRET_XP, SECRET_BOOST_TURNS, ELEMENTS, type QuestKey, type SecretKey } from '@rules';
import type { Backend, Snapshot } from './backend/types';

export type Tab = 'chat' | 'memories' | 'diary' | 'quests' | 'missoes' | 'inventory' | 'recipes' | 'skills' | 'bond' | 'ecos' | 'pacto' | 'forja' | 'social' | 'settings';

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
  /** última fala da pessoa (aparece num balão perto do Companion) */
  playerSpeech: { id: number; text: string } | null;
  sayPlayer(text: string): void;
  pulse: number; // incrementa a cada descoberta — dispara o efeito no núcleo
  burst: number; // incrementa em conquistas grandes (segredo, despertar pronto)
  toasts: Toast[];
  celebrations: Celebration[];
  awakenCall: boolean;
  /** Arsenal publicado (ou o inicial) e o que está equipado. Teste: ?arsenal dá todos os itens e materiais. */
  items: ItemDef[];
  equipped: Equipped;
  setItems(items: ItemDef[]): void;
  setEquipped(e: Equipped): void;
  setBackend(b: Backend | null): void;
  setTab(t: Tab | null): void;
  run(fn: (b: Backend) => Promise<Snapshot>): Promise<void>;
  toast(text: string, tone?: Toast['tone']): void;
  celebrate(c: Omit<Celebration, 'id'>): void;
  /** fala curta da Companion no jogo (balão; sem IA) */
  bark: { id: number; text: string; ms?: number } | null;
  /** `ms`: quanto tempo o balão fica (nos encontros, só até a próxima fala) */
  sayBark(text: string, ms?: number): void;
  /** Criatura derrotada: registra no bestiário (sem travar a conversa) e comemora o que for novo. */
  recordKill(slug: string, level: number, pos?: { x: number; z: number }, loot?: 'own' | 'none' | 'only'): Promise<import('./backend/types').CombatResult | null>;
  /** Bolsa: jogar fora um item ou (ADM) pôr um item do catálogo. Devolve a mensagem de erro, se houver. */
  bagAction(action: 'inventory.discard' | 'inventory.grant', body: Record<string, unknown>): Promise<string | null>;
  dismissCelebration(): void;
  dismissAwakenCall(): void;
  openAwakenCall(): void;
}

let seq = 0;
const awakenSeenKey = (id: string) => 'companion-core:awaken-call:' + id;

export const useGame = create<State>((set, get) => ({
  backend: null,
  snap: null,
  tab: null,
  busy: false,
  error: null,
  mood: 'curiosa',
  lastReply: null,
  playerSpeech: null,
  sayPlayer: (text) => set({ playerSpeech: { id: ++seq, text } }),
  pulse: 0,
  burst: 0,
  toasts: [],
  bark: null,
  sayBark: (text, ms) => set({ bark: { id: ++seq, text, ms } }),
  celebrations: [],
  awakenCall: false,
  items: ALL_CATALOG_ITEMS,
  equipped: {},
  setItems: (items) => set((s) => ({ items: [...items.filter((i) => !i.slug.startsWith('inst-')), ...s.items.filter((i) => i.slug.startsWith('inst-'))] })),
  setEquipped: (equipped) => set({ equipped }),
  setBackend: (backend) => set({ backend, snap: null, tab: null, error: null, lastReply: null, playerSpeech: null, celebrations: [], awakenCall: false }),
  setTab: (tab) => set({ tab }),
  toast: (text, tone = 'soft') => {
    const t = { id: ++seq, text, tone };
    set({ toasts: [...get().toasts, t].slice(-4) });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), 4200);
  },
  celebrate: (c) => set({ celebrations: [...get().celebrations, { ...c, id: ++seq }] }),
  recordKill: async (slug, level, pos, loot) => {
    const b = get().backend;
    if (!b?.combatKill || !get().snap?.companion) return null;
    try {
      const snap = await b.combatKill(slug, level, pos, loot);
      // mantém a resposta da conversa em andamento; só troca bestiário e memórias
      const cur = get().snap;
      // mantém a conversa; troca bestiário, memórias, vínculo (XP da luta) e o progresso do despertar
      set({ snap: cur ? { ...cur, bestiary: snap.bestiary, memories: snap.memories, inventory: snap.inventory ?? cur.inventory, companion: snap.companion ?? cur.companion, awakening: snap.awakening ?? cur.awakening } : snap });
      const r = snap.combat ?? null;
      if (r?.lumes) get().toast(`+${r.lumes} ✧ Lumes`, 'gold');
      if (r?.levelUp) get().toast(`Vínculo nível ${r.levelUp}`, 'gold');
      if (r?.lootOnly) return r; // só o baú: não houve derrota contada para este Companion
      if (r?.first) get().toast(`Memória de Combate: ${r.entry.name}`, 'soft');
      if (r?.analyzed) get().celebrate({ kind: 'quest', eyebrow: 'Análise de Partículas', title: r.entry.name, subtitle: 'Análise completa: fraquezas, atributos e o que solta estão no Bestiário (Memórias).' });
      if (r?.milestone) get().celebrate({ kind: 'secret', eyebrow: 'Quest: Análise de Partículas', title: `${r.milestone} espécie${r.milestone > 1 ? 's' : ''} analisada${r.milestone > 1 ? 's' : ''}`, subtitle: 'As partículas da Bruma contam quem são as criaturas do mundo.' });
      return r;
    } catch { return null; }
  },
  bagAction: async (action, body) => {
    const b = get().backend;
    if (!b?.inventory) return 'Não disponível neste modo.';
    try {
      const snap = await b.inventory(action, body);
      const cur = get().snap;
      set({ snap: cur ? { ...cur, inventory: snap.inventory ?? cur.inventory } : snap });
      return null;
    } catch (e) { return e instanceof Error ? e.message : 'Não deu.'; }
  },
  dismissCelebration: () => set({ celebrations: get().celebrations.slice(1) }),
  dismissAwakenCall: () => {
    const id = get().snap?.companion?.id;
    if (id) try { localStorage.setItem(awakenSeenKey(id), '1'); } catch { /* sem armazenamento */ }
    set({ awakenCall: false });
  },
  openAwakenCall: () => set({ awakenCall: true }),
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
        get().celebrate({ kind: 'secret', eyebrow: 'Quest secreta!', title: s.title, subtitle: `${s.story} +${SECRET_XP} de vínculo, +1 ponto de habilidade, e as próximas ${SECRET_BOOST_TURNS} conversas valem o dobro.${(snap.secrets?.length ?? 0) > 0 && (snap.secrets?.length ?? 0) % 10 === 0 ? ' E +10 pontos de Constelação!' : ''}`, item: s.item.item });
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
