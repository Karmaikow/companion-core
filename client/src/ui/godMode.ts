/**
 * Modo GOD (só Administrador, dentro do jogo): estado do painel de testes.
 * - `on`: invulnerável, SP e stamina infinitos, sem recarga, dano alto (ver scene/god.ts).
 * - `spawns`: monstros invocados aqui (entram junto dos do mundo).
 * - `skills`: habilidades dadas fora da árvore (valem na barra 1–9).
 * - `model`: modelo 3D de teste no lugar do modelo do Companion (só nesta aba).
 * - `tp`: pedido de teleporte (o App troca de mapa se precisar e põe o Companion no ponto).
 */
import { create } from 'zustand';
import type { Spawn } from '@rules';
import type { CompanionModelFiles } from '../backend/types';
import { godFlags } from '../scene/god';

const KEY = 'companion-core:god:v1';
interface Saved { on: boolean; skills: Record<string, number> }
function load(): Saved {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v && typeof v === 'object') return { on: !!v.on, skills: v.skills && typeof v.skills === 'object' ? v.skills : {} }; } catch { /* padrão */ }
  return { on: false, skills: {} };
}

export type TpPlace = 'refuge' | 'world' | 'arredores' | 'cidade';
export interface TpRequest { id: number; place: TpPlace; x: number; z: number }

interface GodState extends Saved {
  /** esta conta é de Administrador (o servidor confirma) */
  admin: boolean;
  open: boolean;
  spawns: Spawn[];
  model: CompanionModelFiles | null;
  modelName: string | null;
  setAdmin: (v: boolean) => void;
  setOpen: (v: boolean) => void;
  setOn: (v: boolean) => void;
  summon: (slug: string, level: number, at: { x: number; z: number }, count: number) => void;
  clearSpawns: () => void;
  grantSkill: (slug: string, level: number) => void;
  revokeSkill: (slug: string) => void;
  setModel: (m: CompanionModelFiles | null, name?: string | null) => void;
  tp: TpRequest | null;
  teleportTo: (place: TpPlace, x: number, z: number) => void;
}

let n = 0;
const save = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify({ on: s.on, skills: s.skills })); } catch { /* só nesta sessão */ } };

export const useGod = create<GodState>((set, get) => ({
  ...load(),
  admin: false, open: false, spawns: [], model: null, modelName: null,
  setAdmin: (admin) => { set({ admin }); godFlags.on = admin && get().on; },
  setOpen: (open) => set({ open }),
  setOn: (on) => { set({ on }); godFlags.on = get().admin && on; save(get()); },
  summon: (slug, level, at, count) => {
    const out: Spawn[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 3;
      out.push({ id: 'god-' + (++n) + '-' + Date.now().toString(36), slug, x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r, level: Math.max(1, Math.round(level)), leader: false });
    }
    set({ spawns: [...get().spawns, ...out] });
  },
  clearSpawns: () => set({ spawns: [] }),
  grantSkill: (slug, level) => { set({ skills: { ...get().skills, [slug]: Math.max(1, Math.min(5, Math.round(level))) } }); save(get()); },
  revokeSkill: (slug) => { const { [slug]: _x, ...rest } = get().skills; set({ skills: rest }); save(get()); },
  setModel: (model, name = null) => set({ model, modelName: model ? name : null }),
  tp: null,
  teleportTo: (place, x, z) => set({ tp: { id: (get().tp?.id ?? 0) + 1, place, x, z }, open: false }),
}));
