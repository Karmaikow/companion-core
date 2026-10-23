/**
 * Constelação Viva no jogo: os resultados calculados da build ATIVA (aplicada pelo servidor), lidos pelo laço do
 * Companion, pela barra de habilidades e pelas criaturas. Fora do React (como `vitals`): o laço lê a cada quadro.
 * Também marca o combate (golpe dado ou recebido) para a troca de build esperar.
 */
import {
  DEFAULT_BALANCE, deriveStats, emptyAllocation, skillEffect, weaponModality,
  type AttributeAllocation, type BalanceConfig, type DerivedStats, type HitInfo, type ResonanceKey, type SkillDef, type SpeciesKey, type Element,
} from '@rules';

/** O dano das habilidades no jogo guarda a escala de antes (60 de ataque contra 40 de defesa ≈ 0,6). */
export const SKILL_SCALE = 0.6;

export const combat = {
  d: deriveStats({ alloc: emptyAllocation(), stage: 1, species: null }) as DerivedStats,
  alloc: emptyAllocation() as AttributeAllocation,
  resonance: null as ResonanceKey | null,
  species: null as SpeciesKey | null,
  essence: null as Element | null,
  lineage: false,
  cfg: DEFAULT_BALANCE as BalanceConfig,
  lastCombat: -1e9,
};

export function setCombatStats(next: Partial<typeof combat>) { Object.assign(combat, next); }
export function markCombat() { combat.lastCombat = performance.now(); }
export const inCombat = () => performance.now() - combat.lastCombat < combat.cfg.combatCooldown * 1000;

/** Ataque básico: força ou magia conforme a arma; a escala por golpe é congelada aqui (no lançamento). */
export function basicHit(ranged: string | undefined, weaponEssence: Element | null): { power: number; info: HitInfo } {
  const m = weaponModality(ranged);
  return { power: (m === 'magica' ? combat.d.magPower : combat.d.physPower) / 100, info: { split: m === 'magica' ? { fisica: 0, magica: 1 } : { fisica: 1, magica: 0 }, essence: weaponEssence, precision: combat.d.precision } };
}

/** Habilidade lançada agora: custo de SP, preparação e dano/cura (congelados no lançamento). */
export function castSkill(sk: SkillDef, rank: number) {
  const fx = skillEffect(sk, combat.d, { species: combat.species, lineage: combat.lineage, alloc: combat.alloc, cfg: combat.cfg });
  const total = fx.damage.fisica + fx.damage.magica;
  return {
    cost: fx.cost, windup: fx.windup,
    damage: total > 0 ? Math.max(1, Math.round(total * SKILL_SCALE * rank)) : 0,
    heal: Math.round(fx.heal * rank),
    info: { split: total > 0 ? { fisica: fx.damage.fisica / total, magica: fx.damage.magica / total } : fx.split, essence: sk.essence ?? (sk.slot === 'supreme' ? combat.essence : null), precision: combat.d.precision } as HitInfo,
  };
}
