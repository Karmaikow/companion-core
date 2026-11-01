/**
 * Missões no cliente: a lista (disponíveis, em andamento, prontas para receber, concluídas), aceitar, largar, entregar
 * materiais e receber os prêmios. O progresso vem do servidor (ele conta só o que registrou).
 */
import { create } from 'zustand';
import { unlockText, type MissionDef } from '@rules';
import { useEcos } from '../ecos/ecosStore';
import { useGame } from '../store';

export type MissionStatus = 'disponivel' | 'bloqueada' | 'ativa' | 'pronta' | 'concluida';
export interface MissionEntry { def: MissionDef; period: string; status: MissionStatus; progress: number[]; acceptedAt: string | null; completedAt?: string | null; block: string | null }
export interface MissionsView { serverNow: number; missions: MissionEntry[]; active: number; maxActive: number }
export interface MissionsReply {
  missions?: MissionsView;
  delivered?: { accepted: number };
  claimed?: { mission: string; name: string; rewards: MissionDef['rewards'] };
  bond?: { xp: number; levelUp: number | null } | null;
}

interface MissionsStore {
  view: MissionsView | null;
  busy: string | null;
  error: string | null;
  call(action: string, body?: Record<string, unknown>): Promise<MissionsReply | null>;
  refresh(): Promise<void>;
}

export const useMissions = create<MissionsStore>((set, get) => ({
  view: null, busy: null, error: null,
  async call(action, body = {}) {
    const b = useGame.getState().backend;
    if (!b?.missions) { set({ error: 'As missões funcionam só conectado (online).' }); return null; }
    set({ busy: String(body.mission ?? action), error: null });
    try {
      const r = await b.missions(action, body);
      if (r.missions) set({ view: r.missions });
      if (r.claimed) {
        const rw = r.claimed.rewards;
        useGame.getState().celebrate({ kind: 'quest', eyebrow: 'Missão concluída', title: r.claimed.name, subtitle: [rw.lumes ? `${rw.lumes} Lumes` : '', rw.bond ? `+${rw.bond} de vínculo` : '', rw.materials.length || rw.items.length ? 'materiais e itens na bolsa' : '', rw.unlock ? unlockText(rw.unlock) : ''].filter(Boolean).join(' · ') || 'Bom trabalho!' });
        if (rw.unlock) void useEcos.getState().refresh();
        if (r.bond?.levelUp) useGame.getState().toast(`Vínculo nível ${r.bond.levelUp}`, 'gold');
        void useGame.getState().run((x) => x.state());
      }
      return r;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Não deu certo.' });
      return null;
    } finally { set({ busy: null }); }
  },
  async refresh() { await get().call('missions.state'); },
}));
