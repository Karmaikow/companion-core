/**
 * Pacto das Cinco no cliente: estado (Lumes, peças, trabalhos, encomendas), chamadas ao servidor e a ponte com o
 * equipamento. O cliente só ANTECIPA (barra de tempo, previsão): o servidor confirma tudo. Reconexão: o mesmo
 * request_id é reenviado e o servidor devolve o resultado guardado (nada duplica).
 */
import { create } from 'zustand';
import { DEFAULT_ITEMS, instanceSlug, blueprintById, type ItemDef, type ItemType, type MarkConfig } from '@rules';
import { useGame } from '../store';
import { useEcos, classSource } from '../ecos/ecosStore';
import type { EquipmentView, PactoReply, PactoView } from './types';

const NET_ERR = /não respondeu|failed to fetch|network|conex/i;
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

interface PactoStore {
  view: PactoView | null;
  error: string | null;
  busy: string | null;
  notice: string | null;
  conn: 'ok' | 'perdida';
  call(action: string, body?: Record<string, unknown>): Promise<PactoReply | null>;
  refresh(): Promise<void>;
  tick(): void;
  clear(): void;
}

let finishing = new Set<string>();

export const usePacto = create<PactoStore>((set, get) => ({
  view: null, error: null, busy: null, notice: null, conn: 'ok',
  async call(action, body = {}) {
    const b = useGame.getState().backend;
    if (!b?.pacto) { set({ error: 'O Pacto não está disponível neste modo.' }); return null; }
    set({ busy: action, error: null });
    try {
      const r = await b.pacto(action, body);
      set({ conn: 'ok', busy: null, ...(r.pacto ? { view: r.pacto } : {}) });
      if (action !== 'pacto.state' && action !== 'pacto.job.finish') void useEcos.getState().refresh();
      if (r.job?.ok && !r.job.repeat) { void useEcos.getState().refresh(); set({ notice: `${r.job.kind === 'forja' ? '🔨' : '✶'} Pronto: ${r.job.label}` }); }
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro';
      if (NET_ERR.test(msg)) { set({ conn: 'perdida', busy: null }); return null; }
      set({ error: msg, busy: null });
      return null;
    }
  },
  async refresh() { const b = useGame.getState().backend; if (!b?.pacto) return; try { const r = await b.pacto('pacto.state'); if (r.pacto) set({ view: r.pacto, conn: 'ok' }); } catch { set({ conn: 'perdida' }); } },
  tick() {
    const v = get().view; if (!v) return;
    const now = Date.now() + (v.serverNow ? 0 : 0);
    for (const j of v.jobs) {
      if (finishing.has(j.request)) continue;
      if (now - j.startedAt >= j.seconds * 1000 + 600) {
        finishing.add(j.request);
        void get().call('pacto.job.finish', { request: j.request }).finally(() => setTimeout(() => finishing.delete(j.request), 3000));
      }
    }
  },
  clear() { set({ error: null, notice: null }); },
}));

// ---------------------------------------------------------------------------
// Peças forjadas → itens equipáveis (visual emprestado do arsenal do mesmo tipo)
// ---------------------------------------------------------------------------

const instIds = new Map<string, string>();
export const ownsInstance = (slug: string) => instIds.has(slug);
export const instanceOf = (slug: string | undefined): EquipmentView | null => { const id = slug && instIds.get(slug); return (id && usePacto.getState().view?.equipment.find((e) => e.id === id)) || null; };

function toItem(e: EquipmentView, base: ItemDef[]): ItemDef | null {
  if (e.kind !== 'equipamento' || !e.itemType) return null;
  const like = base.find((i) => i.type === e.itemType) ?? DEFAULT_ITEMS.find((i) => i.type === e.itemType);
  if (!like) return null;
  const bp = blueprintById(e.blueprint);
  const sig = e.signature ? ` Forjado por ${e.signature.artisanName}.` : '';
  return {
    ...like, slug: instanceSlug(e.id), name: e.name ?? bp?.name ?? like.name, type: e.itemType as ItemType, rarity: e.rarity ?? 'comum', essence: e.affinity ?? null,
    stats: e.stats ?? {}, starter: false, obtain: 'Forja Primordial',
    description: `${bp?.description ?? ''}${e.mark ? ` Marca: ${e.mark.label}.` : ''} Durabilidade ${e.durability}/${e.maxDurability}.${sig}`.trim(),
  };
}

/** Injeta as peças no catálogo do jogo (o resto do equipamento funciona igual). Peça quebrada (0) não equipa. */
function syncItems(v: PactoView | null) {
  const game = useGame.getState();
  const base = game.items.filter((i) => !i.slug.startsWith('inst-'));
  instIds.clear();
  const inst: ItemDef[] = [];
  for (const e of v?.equipment ?? []) {
    const it = toItem(e, base);
    if (it && e.durability > 0) { inst.push(it); instIds.set(it.slug, e.id); }
  }
  const same = game.items.filter((i) => i.slug.startsWith('inst-')).map((i) => i.slug + i.description).join() === inst.map((i) => i.slug + i.description).join();
  if (!same) useGame.setState({ items: [...base, ...inst] });
}
classSource.get = () => usePacto.getState().view?.cls.effective ?? null;
usePacto.subscribe((s, prev) => { if (s.view !== prev.view) syncItems(s.view); });

/** Marca do que está na mão secundária (ex.: Barreira Breve do Guardião). */
export function offhandMark(): MarkConfig | null {
  const slug = useGame.getState().equipped.offhand;
  return instanceOf(slug)?.mark ?? null;
}
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __pacto: unknown }).__pacto = usePacto;
