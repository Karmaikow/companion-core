/**
 * Tiers de arma e equipamento (T1 → T5): a progressão do item, separada da raridade.
 *  - Raridade é a sorte da peça (quanto os atributos saíram bons); tier é o quanto ela é avançada (material e forja).
 *  - Arma: o tier multiplica o dano do golpe básico e das técnicas, e abre a evolução das técnicas (T3: escolha de
 *    caminho; T5: forma final — ver combat/techniques.ts).
 *  - Equipamento: o tier multiplica de leve os atributos.
 *  - Requisito: tier alto pede vínculo mínimo para equipar.
 * Item sem tier definido é T1 (nada muda no equilíbrio dos itens que já existem); o Admin define o tier no Arsenal.
 */
import type { Rarity } from './equipment.ts';

export type Tier = 1 | 2 | 3 | 4 | 5;
export const TIER_KEYS: Tier[] = [1, 2, 3, 4, 5];

export interface TierInfo { label: string; material: string; power: number; stat: number; bond: number; color: string }
export const TIERS: Record<Tier, TierInfo> = {
  1: { label: 'T1', material: 'Rústico (madeira e pedra)', power: 1, stat: 1, bond: 0, color: '#c9c3b6' },
  2: { label: 'T2', material: 'Cobre', power: 1.12, stat: 1.1, bond: 4, color: '#e0915a' },
  3: { label: 'T3', material: 'Ferro e prata', power: 1.25, stat: 1.2, bond: 8, color: '#c9d2e0' },
  4: { label: 'T4', material: 'Cristal e runa', power: 1.4, stat: 1.3, bond: 14, color: '#8fd3ff' },
  5: { label: 'T5', material: 'Lendário', power: 1.6, stat: 1.45, bond: 20, color: '#ffd84d' },
};

export const isTier = (v: unknown): v is Tier => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
export const cleanTier = (v: unknown): Tier | undefined => { const n = Number(v); return isTier(n) ? n : undefined; };

/** Tier do item: o definido, ou T1. */
export const tierOf = (it: { tier?: number; rarity?: Rarity }): Tier => (isTier(it.tier) ? it.tier : 1);

/** Pode equipar com este vínculo? Devolve o motivo (null = pode). */
export function tierBlock(it: { tier?: number; rarity?: Rarity }, bond: number): string | null {
  const t = tierOf(it), need = TIERS[t].bond;
  return bond >= need ? null : `${TIERS[t].label} pede vínculo ${need} (agora ${bond}).`;
}

/** Faixa de evolução das técnicas: base (T1–T2), evoluída (T3–T4) e forma final (T5). */
export const evolutionStage = (t: Tier): 0 | 1 | 2 => (t >= 5 ? 2 : t >= 3 ? 1 : 0);
