/**
 * Cinto de ferramentas: quais ferramentas o Companion leva para a coleta (Inventário → Ferramentas). Ter a ferramenta
 * é o que o servidor confere (comprada na Loja de Equipamentos ou forjada por uma Taurina); o cinto decide se ela vai
 * para a mão. Ferramenta nova entra equipada; tirar do cinto vale até equipar de novo. Fica salvo neste aparelho.
 */
import { create } from 'zustand';
import { TOOLS, type ToolKey } from '@rules';
import { toolBelt } from '../ecos/ecosStore';
import { usePacto } from '../pacto/pactoStore';
import type { EquipmentView } from '../pacto/types';

export const TOOL_ORDER: ToolKey[] = ['machado', 'picareta', 'faca', 'cinzel'];
/** Para que serve e onde conseguir (o texto do espaço vazio). */
export const TOOL_INFO: Record<ToolKey, { use: string; where: string }> = {
  machado: { use: 'Cortar árvores inteiras (muita madeira de uma vez).', where: 'Loja de Equipamentos de Áster ou a Forja de uma Taurina.' },
  picareta: { use: 'Quebrar rocha e escavar veios de minério.', where: 'Loja de Equipamentos de Áster ou a Forja de uma Taurina.' },
  faca: { use: 'Colher flores, seiva e raízes sem estragar a planta.', where: 'Loja de Equipamentos de Áster ou a Forja de uma Taurina.' },
  cinzel: { use: 'Soltar gemas inteiras sem rachar.', where: 'Só pela Forja de uma Taurina.' },
};

interface Belt { off: Partial<Record<ToolKey, boolean>>; cid: string | null; load(cid: string): void; set(tool: ToolKey, on: boolean): void }
const key = (cid: string) => 'companion-core:toolbelt:' + cid;

export const useToolBelt = create<Belt>((set, get) => ({
  off: {}, cid: null,
  load(cid) {
    if (get().cid === cid) return;
    let off: Belt['off'] = {};
    try { off = JSON.parse(localStorage.getItem(key(cid)) ?? '{}'); } catch { /* sem armazenamento: começa tudo equipado */ }
    set({ cid, off });
  },
  set(tool, on) {
    const off = { ...get().off, [tool]: !on };
    set({ off });
    const cid = get().cid;
    try { if (cid) localStorage.setItem(key(cid), JSON.stringify(off)); } catch { /* vale só nesta sessão */ }
  },
}));

/** A melhor peça de cada ferramenta (a de mais durabilidade), entre as que estão inteiras. */
export function ownedToolPieces(equipment: EquipmentView[] | undefined): Partial<Record<ToolKey, EquipmentView>> {
  const out: Partial<Record<ToolKey, EquipmentView>> = {};
  for (const e of equipment ?? []) {
    const t = e.tool as ToolKey | null;
    if (e.kind !== 'ferramenta' || !t || !(t in TOOLS) || e.durability <= 0) continue;
    if (!out[t] || e.durability > out[t]!.durability) out[t] = e;
  }
  return out;
}

// a coleta pergunta ao cinto: equipada (true), tirada (false) ou ainda sem escolha (vale como equipada)
toolBelt.get = (tool) => {
  const has = !!ownedToolPieces(usePacto.getState().view?.equipment)[tool];
  if (!has) return undefined;
  return !useToolBelt.getState().off[tool];
};
