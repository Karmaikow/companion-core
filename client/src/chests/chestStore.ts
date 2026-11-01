/**
 * Baús de drop e a reconstrução de Áster no cliente.
 *  - baús: o monstro derrotado deixa um baú onde caiu; tocar faz o Companion ir até ele e abrir (o servidor confere
 *    a distância e entrega o conteúdo uma vez só). Baú esquecido se abre sozinho no servidor.
 *  - cidade: o estado de Áster (normal/destruída) e o progresso da reconstrução, lidos do banco (todos veem igual).
 */
import { create } from 'zustand';
import { CHEST_REACH, CRYSTAL_LABEL, resolveAster, cleanProgress, DEFAULT_ASTER, type AsterConfig, type ChestContents, type ChestTier, type CityRebuild } from '@rules';
import { useGame } from '../store';
import { supabase } from '../backend/online';
import { companionFocus, moveRequest } from '../scene/world';

export interface ChestView { id: string; tier: ChestTier; x: number; z: number; expiresAt: number; crystals: number }
export interface ChestsReply {
  chests?: ChestView[];
  opened?: ChestContents | null;
  given?: { accepted: number; done: boolean };
  city?: CityRebuild;
  bond?: { xp: number; levelUp: number | null } | null;
}

interface Store {
  chests: ChestView[];
  /** baú que o Companion está indo abrir */
  going: { id: string; move: number } | null;
  busy: boolean;
  city: CityRebuild | null;
  aster: AsterConfig;
  error: string | null;
  call(action: string, body?: Record<string, unknown>): Promise<ChestsReply | null>;
  add(c: ChestView): void;
  refresh(): Promise<void>;
  open(id: string): void;
  tick(): void;
  loadCity(): Promise<void>;
}

export const useChests = create<Store>((set, get) => ({
  chests: [], going: null, busy: false, city: null, aster: DEFAULT_ASTER, error: null,
  async call(action, body = {}) {
    const b = useGame.getState().backend;
    if (!b?.chests) return null;
    set({ busy: true, error: null });
    try {
      const r = await b.chests(action, body);
      if (r.chests) set({ chests: r.chests });
      if (r.city) set({ city: r.city });
      return r;
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Não deu certo.' }); return null; } finally { set({ busy: false }); }
  },
  add(c) { set({ chests: [c, ...get().chests.filter((x) => x.id !== c.id)].slice(0, 30) }); },
  async refresh() { await get().call('chest.list'); },
  open(id) {
    const c = get().chests.find((x) => x.id === id); if (!c) return;
    if (Math.hypot(companionFocus.x - c.x, companionFocus.z - c.z) <= CHEST_REACH - 1) { void openNow(c); return; }
    // vai até o baú e abre na chegada (outro clique de andar cancela)
    const dx = companionFocus.x - c.x, dz = companionFocus.z - c.z, d = Math.hypot(dx, dz) || 1;
    moveRequest.point.set(c.x + (dx / d) * 1.2, 0, c.z + (dz / d) * 1.2); moveRequest.id++;
    set({ going: { id, move: moveRequest.id } });
  },
  tick() {
    const g = get().going; if (!g) return;
    const c = get().chests.find((x) => x.id === g.id);
    if (!c || moveRequest.id !== g.move) { set({ going: null }); return; }
    if (Math.hypot(companionFocus.x - c.x, companionFocus.z - c.z) <= CHEST_REACH - 1) { set({ going: null }); void openNow(c); }
  },
  async loadCity() {
    try {
      const [cr, gc] = await Promise.all([
        supabase().from('city_rebuild').select('state,round,progress,destroyed_at,rebuilt_at').eq('city', 'aster').maybeSingle(),
        supabase().from('game_config').select('values').eq('id', 1).maybeSingle(),
      ]);
      if (cr.data) set({ city: { state: cr.data.state === 'destruida' ? 'destruida' : 'normal', round: Number(cr.data.round) || 0, progress: cleanProgress(cr.data.progress), destroyedAt: cr.data.destroyed_at ?? null, rebuiltAt: cr.data.rebuilt_at ?? null } });
      set({ aster: resolveAster((gc.data?.values as { aster?: unknown } | null)?.aster) });
    } catch { /* sem rede: fica como está */ }
  },
}));

async function openNow(c: ChestView) {
  const r = await useChests.getState().call('chest.open', { id: c.id, x: companionFocus.x, z: companionFocus.z });
  const got = r?.opened;
  if (!got) { if (useChests.getState().error) useGame.getState().toast(useChests.getState().error!, 'warn'); return; }
  const parts = [...got.drops.map((d) => `${d.qty}× ${d.label}`), got.lumes ? `${got.lumes} Lumes` : '', got.crystals ? `${got.crystals}× ${CRYSTAL_LABEL}` : ''].filter(Boolean);
  useGame.getState().toast(parts.length ? `Baú: ${parts.join(' · ')}` : 'O baú estava vazio.', got.crystals ? 'gold' : 'soft');
  if (got.crystals) useGame.getState().celebrate({ kind: 'secret', eyebrow: 'Cristal Ápice', title: `+${got.crystals} ${CRYSTAL_LABEL}`, subtitle: 'Leve à Torre Central de Áster quando a cidade precisar ser reconstruída.' });
  void useGame.getState().run((b) => b.state());
}

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __chests: unknown }).__chests = useChests;
