/**
 * Baús de drop e a reconstrução de Áster no cliente.
 *  - baús: o monstro derrotado deixa um baú fechado onde caiu (some em 3 min). Tocar abre na hora, de onde estiver: Lumes e cristais vão na hora, os itens aparecem e vão para a bolsa no que couber (o servidor confere a
 *    distância e entrega uma vez só). O que não couber fica no baú aberto, com ouro, por 2 min; vazio, ele some em 10 s.
 *  - cidade: o estado de Áster (normal/destruída) e o progresso da reconstrução, lidos do banco (todos veem igual).
 */
import { create } from 'zustand';
import { fetchGameConfig } from '../backend/catalog';
import { onExtra, sendExtra } from '../net/presence';
import { CHEST_REACH, CHEST_EMPTY_MS, CHEST_OPEN_TTL_MS, CHEST_CARRY_LIMIT, CRYSTAL_LABEL, resolveAster, cleanProgress, DEFAULT_ASTER, bagEntries, readChestOpened, readSharedChest, type AsterConfig, type ChestContents, type ChestState, type ChestTier, type CityRebuild } from '@rules';
import { carryNow } from '../ui/bag';
import { useGame } from '../store';
import { supabase } from '../backend/online';
import { companionFocus, moveRequest } from '../scene/world';

export interface ChestDrop { key: string; label: string; qty: number; category: string }
export interface ChestView { id: string; tier: ChestTier; x: number; z: number; expiresAt: number; crystals: number; state: ChestState; drops: ChestDrop[] }
/** O que acabou de sair do baú (para mostrar em cima dele): itens e quando abriu. */
export interface ChestReveal { id: string; at: number; items: { label: string; qty: number; kept: boolean }[]; lumes: number; crystals: number }
export interface ChestsReply {
  chests?: ChestView[];
  opened?: ChestContents | null;
  given?: { accepted: number; done: boolean };
  took?: { taken: { key: string; qty: number; label: string }[]; left: ChestDrop[] } | null;
  city?: CityRebuild;
  bond?: { xp: number; levelUp: number | null } | null;
}

interface Store {
  chests: ChestView[];
  /** baú que o Companion está indo abrir */
  going: { id: string; move: number } | null;
  /** baú abrindo agora (a animação começa no clique de abrir, o servidor responde em paralelo) */
  opening: { id: string; at: number } | null;
  reveal: ChestReveal | null;
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
  chests: [], going: null, opening: null, reveal: null, busy: false, city: null, aster: DEFAULT_ASTER, error: null,
  async call(action, body = {}) {
    const b = useGame.getState().backend;
    if (!b?.chests) return null;
    set({ busy: true, error: null });
    try {
      const r = await b.chests(action, body);
      // baús vazios ficam só no cliente (a animação de sumir): o servidor já não os lista
      if (r.chests) set({ chests: [...r.chests, ...get().chests.filter((c) => c.state === 'vazio' && !r.chests!.some((x) => x.id === c.id))] });
      if (r.city) set({ city: r.city });
      return r;
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Não deu certo.' }); return null; } finally { set({ busy: false }); }
  },
  add(c) { set({ chests: [c, ...get().chests.filter((x) => x.id !== c.id)].slice(0, 30) }); },
  // com a posição, o servidor devolve os baús de todos os jogadores por perto (um baú para todos)
  async refresh() { await get().call('chest.list', { x: companionFocus.x, z: companionFocus.z }); },
  open(id) {
    const c = get().chests.find((x) => x.id === id); if (!c || c.state === 'vazio' || get().opening?.id === id) return;
    if (Math.hypot(companionFocus.x - c.x, companionFocus.z - c.z) <= CHEST_REACH - 1) { void openNow(c); return; }
    // longe demais (raro: só aparece dentro do alcance): vai até ele e abre na chegada (outro clique de andar cancela)
    const dx = companionFocus.x - c.x, dz = companionFocus.z - c.z, d = Math.hypot(dx, dz) || 1;
    moveRequest.point.set(c.x + (dx / d) * 1.2, 0, c.z + (dz / d) * 1.2); moveRequest.id++;
    set({ going: { id, move: moveRequest.id } });
  },
  tick() {
    // vencidos somem (fechado em 3 min, aberto em 2 min, vazio em 10 s)
    const now = Date.now();
    if (get().chests.some((c) => c.expiresAt <= now)) set({ chests: get().chests.filter((c) => c.expiresAt > now) });
    const g = get().going; if (!g) return;
    const c = get().chests.find((x) => x.id === g.id);
    if (!c || moveRequest.id !== g.move) { set({ going: null }); return; }
    if (Math.hypot(companionFocus.x - c.x, companionFocus.z - c.z) <= CHEST_REACH - 1) { set({ going: null }); void openNow(c); }
  },
  async loadCity() {
    try {
      const [cr, gc] = await Promise.all([
        supabase().from('city_rebuild').select('state,round,progress,destroyed_at,rebuilt_at').eq('city', 'aster').maybeSingle(),
        fetchGameConfig(),
      ]);
      if (cr.data) set({ city: { state: cr.data.state === 'destruida' ? 'destruida' : 'normal', round: Number(cr.data.round) || 0, progress: cleanProgress(cr.data.progress), destroyedAt: cr.data.destroyed_at ?? null, rebuiltAt: cr.data.rebuilt_at ?? null } });
      set({ aster: resolveAster((gc as { aster?: unknown } | null)?.aster) });
    } catch { /* sem rede: fica como está */ }
  },
}));

/** Peso de uma unidade do item (o mesmo cálculo da bolsa). */
function unitWeight(d: ChestDrop): number {
  return bagEntries([{ item_key: d.key, qty: 1, meta: {} }], useGame.getState().items)[0]?.unitWeight ?? 0.5;
}
/** O que cabe na bolsa agora (até CHEST_CARRY_LIMIT vezes a capacidade), na ordem do baú. */
function fitting(drops: ChestDrop[]): { key: string; qty: number }[] {
  let room = carryNow.capacity * CHEST_CARRY_LIMIT - carryNow.carried;
  const out: { key: string; qty: number }[] = [];
  for (const d of drops) {
    const w = Math.max(0.01, unitWeight(d)), q = Math.min(d.qty, Math.floor(room / w));
    if (q > 0) { out.push({ key: d.key, qty: q }); room -= q * w; }
  }
  return out;
}
/**
 * Atualiza o baú na tela. Se a resposta do servidor já o tirou da lista (vazio, ou só com Lumes), põe de volta: ele
 * precisa ficar para mostrar o que saiu e sumir sozinho em 10 s — antes ele sumia na hora, como se não tivesse nada.
 */
const setChest = (c: ChestView, patch: Partial<ChestView>) => {
  const list = useChests.getState().chests;
  useChests.setState({ chests: list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) : [...list, { ...c, ...patch }] });
};

/** Pega o que couber do baú aberto; vazio, ele some em 10 s. Devolve os itens que ficaram. */
async function takeNow(c: ChestView, drops: ChestDrop[]): Promise<ChestDrop[]> {
  if (!drops.length) { setChest(c, { state: 'vazio', drops: [], expiresAt: Date.now() + CHEST_EMPTY_MS }); return []; }
  const items = fitting(drops);
  if (!items.length) { useGame.getState().toast('Sem espaço: a bolsa está pesada demais. O que ficou espera no baú por 2 min.', 'warn'); return drops; }
  const r = await useChests.getState().call('chest.take', { id: c.id, items, x: companionFocus.x, z: companionFocus.z });
  const left = r?.took?.left ?? drops;
  if (r?.took) sendExtra('chest-open', { id: c.id, left: left.length > 0 }); // os outros jogadores veem o que sobrou (ou o baú sumir)
  if (!left.length) setChest(c, { state: 'vazio', drops: [], expiresAt: Date.now() + CHEST_EMPTY_MS });
  else { setChest(c, { state: 'aberto', drops: left }); useGame.getState().toast(`Sem espaço para tudo: ${left.map((d) => `${d.qty}× ${d.label}`).join(', ')} ficou no baú (2 min).`, 'warn'); }
  if (r?.took?.taken.length) void useGame.getState().run((b) => b.state());
  return left;
}

async function openNow(c: ChestView) {
  // baú já aberto (voltou depois de liberar espaço): só pega o que ficou
  if (c.state === 'aberto') { await takeNow(c, c.drops); return; }
  useChests.setState({ opening: { id: c.id, at: performance.now() } });
  const r = await useChests.getState().call('chest.open', { id: c.id, x: companionFocus.x, z: companionFocus.z });
  const got = r?.opened;
  if (!got) {
    useChests.setState({ opening: null });
    if (useChests.getState().error) useGame.getState().toast(useChests.getState().error!, 'warn');
    // outro Companion abriu primeiro: a lista que voltou já traz o baú aberto (com o que sobrou) ou sem ele
    else if (r?.chests && !r.chests.some((x) => x.id === c.id)) useGame.getState().toast('Outro Companion abriu este baú primeiro.', 'soft');
    return;
  }
  sendExtra('chest-open', { id: c.id, left: got.drops.length > 0 });
  // a animação de abrir dura ~0,9 s: os itens aparecem quando a tampa "estoura"
  const wait = Math.max(0, 900 - (performance.now() - (useChests.getState().opening?.at ?? 0)));
  await new Promise((ok) => setTimeout(ok, wait));
  setChest(c, { state: 'aberto', drops: got.drops, expiresAt: Date.now() + CHEST_OPEN_TTL_MS });
  useChests.setState({ opening: null });
  const left = await takeNow({ ...c, state: 'aberto', drops: got.drops }, got.drops);
  useChests.setState({ reveal: { id: c.id, at: Date.now(), items: got.drops.map((d) => ({ label: d.label, qty: d.qty, kept: left.some((l) => l.key === d.key) })), lumes: got.lumes, crystals: got.crystals } });
  if (got.crystals) useGame.getState().celebrate({ kind: 'secret', eyebrow: 'Cristal Ápice', title: `+${got.crystals} ${CRYSTAL_LABEL}`, subtitle: 'Leve à Torre Central de Áster quando a cidade precisar ser reconstruída.' });
  void useGame.getState().run((b) => b.state());
}

// ---------------------------------------------------------------------------
// Um baú para todos (mundo compartilhado)
// ---------------------------------------------------------------------------

/** Este jogo criou o baú (simulava o monstro que caiu): avisa os outros jogadores do mapa para desenharem o mesmo. */
export function shareChest(c: ChestView) {
  sendExtra('chest', { id: c.id, tier: c.tier, x: c.x, z: c.z, expiresAt: c.expiresAt, crystals: c.crystals });
}

// Avisos dos outros jogadores. Servem só para desenhar: abrir e pegar são conferidos no servidor.
onExtra('chest', (d) => {
  const c = readSharedChest(d, Date.now());
  if (c && !useChests.getState().chests.some((x) => x.id === c.id)) useChests.getState().add(c);
});
let refreshAt = 0;
onExtra('chest-open', (d) => {
  const o = readChestOpened(d), S = useChests.getState();
  const c = o ? S.chests.find((x) => x.id === o.id) : null;
  if (!o || !c || S.opening?.id === o.id) return;
  if (!o.left) { setChest(c, { state: 'vazio', drops: [], expiresAt: Date.now() + CHEST_EMPTY_MS }); return; }
  // sobrou coisa dentro: pede ao servidor o que ficou (no máximo uma consulta a cada 2 s)
  if (performance.now() - refreshAt > 2000) { refreshAt = performance.now(); void S.refresh(); }
});

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __chests: unknown }).__chests = useChests;
