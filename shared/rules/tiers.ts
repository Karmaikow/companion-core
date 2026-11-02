/**
 * Tiers de arma e equipamento (T1 → T5): a progressão do item, separada da raridade.
 *  - Raridade é a sorte da peça (quanto os atributos saíram bons); tier é o quanto ela é avançada (material e forja).
 *  - Arma: o tier multiplica o dano do golpe básico e das técnicas, e abre a evolução das técnicas (T3: escolha de
 *    caminho; T5: forma final — ver combat/techniques.ts).
 *  - Equipamento: o tier multiplica de leve os atributos.
 *  - Requisito: tier alto pede vínculo mínimo para equipar.
 * Item sem tier definido é T1 (nada muda no equilíbrio dos itens que já existem); o Admin define o tier no Arsenal.
 */
import type { Rarity, ItemType } from './equipment.ts';
import { parseBatchKey, MATERIALS } from './ecos.ts';

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

// ---------------------------------------------------------------------------
// Subir o tier de uma peça forjada (reforja na Escola da Forja, só Taurina): materiais refinados da Casa dos Ecos.
// Peças do catálogo (Arsenal) têm o tier definido pelo Admin; só as forjadas sobem.
// ---------------------------------------------------------------------------

export const TIER_UP: Record<2 | 3 | 4 | 5, { material: string; qty: number }[]> = {
  2: [{ material: 'lingote-de-cobre', qty: 2 }],
  3: [{ material: 'lingote-de-cobre', qty: 3 }, { material: 'bloco-lapidado', qty: 2 }],
  4: [{ material: 'quartzo-lapidado', qty: 3 }, { material: 'lingote-de-cobre', qty: 4 }],
  5: [{ material: 'quartzo-lapidado', qty: 5 }, { material: 'tabua-nobre', qty: 3 }, { material: 'bloco-lapidado', qty: 3 }],
};

/** O que custa subir a peça de `from` para o tier seguinte, com os lotes da mochila (os de menor qualidade primeiro). */
export function tierUpCheck(from: Tier, bag: { key: string; qty: number }[]):
  { ok: true; to: Tier; take: { key: string; qty: number }[] } | { ok: false; reason: string } {
  if (from >= 5) return { ok: false, reason: 'A peça já está no T5.' };
  const to = (from + 1) as 2 | 3 | 4 | 5;
  const take: { key: string; qty: number }[] = [], missing: string[] = [];
  const rank = (k: string) => Object.values(parseBatchKey(k)?.bands ?? {}).reduce((a, b) => a + (b === 'alta' ? 2 : b === 'media' ? 1 : 0), 0);
  for (const need of TIER_UP[to]) {
    let left = need.qty;
    for (const b of bag.filter((x) => x.qty > 0 && parseBatchKey(x.key)?.material === need.material).sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))) {
      if (!left) break;
      const q = Math.min(left, b.qty); take.push({ key: b.key, qty: q }); left -= q;
    }
    if (left) missing.push(`${left}× ${MATERIALS[need.material]?.name ?? need.material}`);
  }
  return missing.length ? { ok: false, reason: `Para ${TIERS[to].label} faltam: ${missing.join(', ')}.` } : { ok: true, to, take };
}

// ---------------------------------------------------------------------------
// Requisito de arma (escolas e missões): tipo, tier mínimo e, se pedir, de duas mãos
// ---------------------------------------------------------------------------

export interface WeaponReq { kind: ItemType | null; tier: Tier; twoHanded?: boolean }
const KIND_LABEL: Partial<Record<ItemType, string>> = { espada: 'espada', faca: 'faca', maca: 'maça', lanca: 'lança', cajado: 'cajado', varinha: 'varinha', arco: 'arco' };
export const weaponReqText = (r: WeaponReq) => `${r.kind ? KIND_LABEL[r.kind] ?? r.kind : 'arma'}${r.twoHanded ? ' de duas mãos' : ''} ${TIERS[r.tier].label} ou maior`;

/** A arma na mão cumpre? `weapon` = o item da mão direita (tipo, tier, duas mãos). Devolve o motivo (null = cumpre). */
export function weaponBlock(r: WeaponReq | null | undefined, weapon: { type: string; tier?: number; twoHanded?: boolean } | null): string | null {
  if (!r) return null;
  const ok = !!weapon && (!r.kind || weapon.type === r.kind) && tierOf(weapon) >= r.tier && (!r.twoHanded || !!weapon.twoHanded);
  return ok ? null : `Precisa de ${weaponReqText(r)} na mão.`;
}

export function cleanWeaponReq(v: unknown): WeaponReq | null {
  const o = (v ?? {}) as Partial<WeaponReq>;
  const tier = cleanTier(o.tier);
  if (!tier) return null;
  const kind = typeof o.kind === 'string' && o.kind in KIND_LABEL ? (o.kind as ItemType) : null;
  return { kind, tier, ...(o.twoHanded ? { twoHanded: true } : {}) };
}
