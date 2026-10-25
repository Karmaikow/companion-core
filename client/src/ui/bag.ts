/**
 * Bolsa do Companion no cliente: o que ele carrega (itens da bolsa do servidor, materiais da mochila do Vale dos Ecos e
 * as peças forjadas) e a carga contra a capacidade (Força, Vitalidade e mochila equipada). O App usa a carga para o
 * passo e a agilidade; o painel do inventário mostra tudo.
 */
import { useMemo } from 'react';
import {
  bagEntries, carryCapacity, loadState, itemWeight, MATERIALS, RES_WEIGHT, CATEGORIES,
  type BagEntry, type ItemDef,
} from '@rules';
import { useGame } from '../store';
import { useEcos, bagBatches, batchLabel } from '../ecos/ecosStore';
import { useBuild } from '../build/buildStore';
import { ownsInstance } from '../pacto/pactoStore';

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('arsenal');

/** Itens que o Companion tem: na bolsa, forjados (peças da Oficina), os de evento — e, no modo de teste, todos. */
export const ownsItem = (slug: string) => TEST || ownsInstance(slug)
  || (useGame.getState().snap?.inventory ?? []).some((r) => r.item_key === slug && r.qty > 0)
  || !!useGame.getState().items.find((i) => i.slug === slug)?.starter;

/** Material da mochila do Vale (lotes com faixas de qualidade), como entrada da bolsa. */
export interface ValeEntry { key: string; label: string; icon: string; qty: number; unitWeight: number }

export interface Carry {
  entries: BagEntry[];
  /** peças forjadas (Oficina) que o Companion tem */
  forged: ItemDef[];
  vale: ValeEntry[];
  carried: number;
  capacity: number;
  load: ReturnType<typeof loadState>;
}

export function useCarry(): Carry {
  const inv = useGame((s) => s.snap?.inventory);
  const items = useGame((s) => s.items);
  const equipped = useGame((s) => s.equipped);
  const ecosView = useEcos((s) => s.view);
  const alloc = useBuild((s) => s.view?.active.alloc);
  return useMemo(() => {
    const entries = bagEntries((inv ?? []).map((r) => ({ item_key: r.item_key, qty: r.qty, meta: r.meta })), items);
    const forged = items.filter((i) => i.slug.startsWith('inst-') && ownsInstance(i.slug));
    const vale: ValeEntry[] = bagBatches(ecosView).map((b) => {
      const m = MATERIALS[b.material];
      return { key: b.key, label: batchLabel(b.key), icon: m ? CATEGORIES[m.category].icon : '•', qty: b.qty, unitWeight: m ? RES_WEIGHT[m.category] : 0.5 };
    });
    const carried = Math.round((
      entries.reduce((t, e) => t + e.qty * e.unitWeight, 0)
      + forged.reduce((t, i) => t + itemWeight(i), 0)
      + vale.reduce((t, v) => t + v.qty * v.unitWeight, 0)
    ) * 10) / 10;
    const capacity = carryCapacity(alloc ?? {}, equipped, items);
    return { entries, forged, vale, carried, capacity, load: loadState(carried, capacity) };
  }, [inv, items, equipped, ecosView, alloc]);
}
