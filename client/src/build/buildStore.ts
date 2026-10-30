/**
 * Constelação Viva no cliente: a build aplicada (vem do servidor), o rascunho em edição e os perfis.
 * O rascunho é só prévia; aplicar passa pelo servidor (ou pela simulação offline), que valida orçamento e momento.
 * Uma troca pedida em combate/coleta/oficina fica PENDENTE e é aplicada sozinha quando der (ou cancelada).
 */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  DEFAULT_BALANCE, deriveStats, emptyAllocation, progressionStage, budget, usedPoints, applyBlockers,
  type AttrKey, type AttributeAllocation, type DerivedStats, type ResonanceKey, type SpeciesKey, type StatKey,
} from '@rules';
import { useGame } from '../store';
import { useEcos } from '../ecos/ecosStore';
import { usePacto, uuid } from '../pacto/pactoStore';
import { useSkillData } from '../ui/skillState';
import { combat, inCombat, setCombatStats } from './combatStats';
import { setMaxima } from '../scene/vitals';
import type { BuildReply, BuildView } from './types';

interface Draft { alloc: AttributeAllocation; resonance: ResonanceKey | null }
interface BuildStore {
  view: BuildView | null;
  draft: Draft | null;
  history: Draft[];          // desfazer
  busy: string | null;
  error: string | null;
  notice: string | null;
  call(action: string, body?: Record<string, unknown>): Promise<BuildReply | null>;
  refresh(): Promise<void>;
  setPoint(k: StatKey, v: number): void;
  setResonance(r: ResonanceKey | null): void;
  loadDraft(d: Draft): void;
  undo(): void;
  discard(): void;
  apply(): Promise<void>;
  clear(): void;
}

/** O que impede aplicar agora, do ponto de vista deste aparelho (o servidor confere de novo). */
export function localBlockers() {
  return applyBlockers({ inCombat: inCombat(), gathering: !!useEcos.getState().run, crafting: !!usePacto.getState().view?.jobs.length });
}
const flags = () => ({ inCombat: inCombat(), gathering: !!useEcos.getState().run, crafting: !!usePacto.getState().view?.jobs.length });

export const useBuild = create<BuildStore>((set, get) => ({
  view: null, draft: null, history: [], busy: null, error: null, notice: null,
  async call(action, body = {}) {
    const b = useGame.getState().backend;
    if (!b?.build) return null;
    set({ busy: action, error: null });
    try {
      const v = get().view;
      const r = await b.build(action, { ...flags(), ...(action === 'build.state' ? {} : { request: uuid(), version: v?.version }), ...body });
      set({ busy: null, ...(r.build ? { view: r.build } : {}) });
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro';
      set({ busy: null, error: msg });
      if (/mudou em outro lugar/.test(msg)) void get().refresh();
      return null;
    }
  },
  async refresh() { const b = useGame.getState().backend; if (!b?.build) return; try { const r = await b.build('build.state', flags()); if (r.build) set({ view: r.build }); } catch { /* tenta depois */ } },
  setPoint(k, v) {
    const view = get().view; if (!view) return;
    const cur = get().draft ?? view.active;
    const next = { ...cur.alloc, [k]: Math.max(0, Math.floor(v) || 0) };
    const over = usedPoints(next) - view.budget;
    if (over > 0) next[k] = Math.max(0, next[k] - over); // nunca passa do orçamento
    set({ history: [...get().history, cur].slice(-30), draft: { ...cur, alloc: next } });
  },
  setResonance(r) { const view = get().view; if (!view) return; const cur = get().draft ?? view.active; set({ history: [...get().history, cur].slice(-30), draft: { ...cur, resonance: r } }); },
  loadDraft(d) { const view = get().view; if (!view) return; set({ history: [...get().history, get().draft ?? view.active].slice(-30), draft: { alloc: { ...d.alloc }, resonance: d.resonance } }); },
  undo() { const h = get().history; if (!h.length) return; set({ draft: h[h.length - 1], history: h.slice(0, -1) }); },
  discard() { set({ draft: null, history: [] }); },
  async apply() {
    const d = get().draft ?? get().view?.active; if (!d) return;
    const r = await get().call('build.apply', { alloc: d.alloc, resonance: d.resonance });
    if (r?.applied) set({ draft: null, history: [], notice: r.repeat ? 'Já estava aplicada.' : 'Build aplicada.' });
    else if (r?.pending) set({ draft: null, history: [], notice: `Fica pendente: ${r.reason ?? 'aplica assim que der'}` });
  },
  clear() { set({ error: null, notice: null }); },
}));

/** Rascunho atual (ou a build ativa, se não há edição). */
export function useDraft(): Draft | null {
  const view = useBuild((s) => s.view), draft = useBuild((s) => s.draft);
  return draft ?? view?.active ?? null;
}

/** Entradas comuns do cálculo (classe, estágio, árvore, equipamento) para comparar atual × prévia. */
export function useDeriveInput() {
  const c = useGame((s) => s.snap?.companion);
  const { fx, species, essence } = useSkillData();
  const equip = useBuildEquip((s) => s.bonus);
  const view = useBuild((s) => s.view);
  const stage = progressionStage(c?.bond.level ?? 1);
  return { species, stage, tree: fx?.bonus ?? {}, equipment: equip, lineage: !!fx?.lineage, cfg: view?.config ?? DEFAULT_BALANCE, essence };
}

/** Bônus dos equipamentos (o App atualiza; aqui só guardamos para o cálculo). */
export const useBuildEquip = create<{ bonus: Partial<Record<AttrKey, number>>; set(b: Partial<Record<AttrKey, number>>): void }>((set) => ({ bonus: {}, set: (bonus) => set({ bonus }) }));

export function derive(d: Draft, inp: ReturnType<typeof useDeriveInput>): DerivedStats {
  return deriveStats({ alloc: d.alloc, stage: inp.stage, species: inp.species, resonance: d.resonance, tree: inp.tree, equipment: inp.equipment, cfg: inp.cfg });
}

/** Usar uma vez (App): carrega a build, mantém os números de combate e os máximos de HP/SP/ST em dia, aplica pendências. */
export function useBuildSync(equipment: Partial<Record<AttrKey, number>>) {
  const backend = useGame((s) => s.backend);
  const cid = useGame((s) => s.snap?.companion?.id);
  const bond = useGame((s) => s.snap?.companion?.bond.level ?? 1);
  const view = useBuild((s) => s.view);
  useEffect(() => { useBuildEquip.getState().set(equipment); }, [equipment]);
  useEffect(() => { useBuild.setState({ view: null, draft: null, history: [] }); }, [cid, backend]);
  useEffect(() => { if (cid && backend?.build) void useBuild.getState().refresh(); }, [cid, backend, bond]);
  const inp = useDeriveInput();
  const active = view?.active ?? { alloc: emptyAllocation(), resonance: null };
  const d = useMemo(() => derive(active, inp), [active, inp.species, inp.stage, inp.tree, inp.equipment, inp.cfg, inp.essence]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCombatStats({ d, alloc: active.alloc, resonance: active.resonance, species: inp.species, essence: inp.essence, lineage: inp.lineage, cfg: inp.cfg });
    setMaxima(d);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  // pendência: tenta de novo quando sair do combate/coleta/oficina
  useEffect(() => {
    if (!view?.pending) return;
    const t = window.setInterval(() => {
      const st = useBuild.getState();
      if (st.busy || !st.view?.pending || localBlockers().length) return;
      void st.call('build.apply', { alloc: st.view.pending.alloc, resonance: st.view.pending.resonance }).then((r) => { if (r?.applied) useBuild.setState({ notice: 'A troca pendente foi aplicada.' }); });
    }, 2500);
    return () => window.clearInterval(t);
  }, [view?.pending]);
  return d;
}

export const freePoints = (view: BuildView | null, d: Draft | null) => (view && d ? view.budget - usedPoints(d.alloc) : 0);
export { budget, combat };
