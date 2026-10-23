/**
 * Vida (HP), SP e Stamina do Companion fora da batalha de verdade (treino e mundo).
 * - HP: cai com os golpes das criaturas (a defesa segurada corta 75%); zerou, o Companion desmaia: a stamina zera e
 *   enche devagar; só levanta com a stamina cheia (volta com metade da vida). A tela mostra a contagem.
 * - SP: gasto pelas habilidades (energia da Forja); volta devagar.
 * - Stamina: pulo, ataque básico e defesa; volta rápido depois de um instante sem gastar.
 * Os máximos e as defesas vêm da Constelação Viva (build ativa + estágio + árvore + equipamento: build/combatStats.ts).
 * Trocar a build nunca cura: o valor atual mantém a proporção sem passar do anterior (applyBuildToResources).
 * O laço do Companion chama `tick`; a interface lê `useVitals` (atualizado ~10×/s).
 */
import { create } from 'zustand';
import { applyBuildToResources, incomingDamage, type DerivedStats, type Modality } from '@rules';
import { combat, markCombat } from '../build/combatStats';

export interface VitalsView { /** Barreira Breve: segundos ativos restantes e de recarga */ shield: number; shieldCd: number; hp: number; hpMax: number; sp: number; spMax: number; st: number; stMax: number; down: boolean; hitId: number; /** segundos até levantar (desmaiado) */ wake: number }

export const vitals = { hp: 100, hpMax: 100, sp: 60, spMax: 60, st: 100, stMax: 100, down: 0, rest: 0, hitId: 0, blocking: false, lastHit: 0 };

/** Marca da mão secundária (preenchida pelo Pacto). */
export const markSource = { get: (): { id: string; duration: number; absorb: number; cooldown: number; spCost: number } | null => null };
/** Barreira Breve: ativa só depois de uma defesa válida, se não estiver em recarga (a recarga começa na ativação → sem ciclo infinito). */
export const barrier = { until: 0, cdUntil: 0, left: 0 };

export const useVitals = create<VitalsView>(() => ({ shield: 0, shieldCd: 0, hp: 100, hpMax: 100, sp: 60, spMax: 60, st: 100, stMax: 100, down: false, hitId: 0, wake: 0 }));

/** Desmaiado: a stamina enche do zero em DOWN_SECONDS e só então ele levanta. */
export const DOWN_SECONDS = 10;

let acc = 0;
function publish(force = false) {
  const v = vitals, cur = useVitals.getState();
  const t = performance.now();
  const next: VitalsView = { shield: barrier.until > t ? Math.ceil((barrier.until - t) / 1000) : 0, shieldCd: barrier.cdUntil > t ? Math.ceil((barrier.cdUntil - t) / 1000) : 0, hp: Math.round(v.hp), hpMax: v.hpMax, sp: Math.round(v.sp), spMax: v.spMax, st: Math.round(v.st), stMax: v.stMax, down: v.down > 0, hitId: v.hitId, wake: v.down > 0 ? Math.ceil(((v.stMax - v.st) / v.stMax) * DOWN_SECONDS) : 0 };
  if (force || next.shield !== cur.shield || next.shieldCd !== cur.shieldCd || next.hp !== cur.hp || next.sp !== cur.sp || next.st !== cur.st || next.down !== cur.down || next.hpMax !== cur.hpMax || next.spMax !== cur.spMax || next.stMax !== cur.stMax || next.hitId !== cur.hitId || next.wake !== cur.wake) useVitals.setState(next);
}

/** Aplica os máximos da build (sem curar: a proporção é mantida, mas o valor atual nunca sobe pela troca). */
export function setMaxima(d: Pick<DerivedStats, 'hpMax' | 'spMax' | 'stMax'>) {
  const v = vitals;
  if (d.hpMax === v.hpMax && d.spMax === v.spMax && d.stMax === v.stMax) return;
  const r = applyBuildToResources({ hp: v.hp, hpMax: v.hpMax, sp: v.sp, spMax: v.spMax, st: v.st, stMax: v.stMax, down: v.down > 0 }, d);
  v.hp = r.hp; v.sp = r.sp; v.st = r.st; v.hpMax = r.hpMax; v.spMax = r.spMax; v.stMax = r.stMax;
  publish(true);
}

/** Gasta stamina (pulo, golpe, defesa). Sem o suficiente, não faz. */
export function spendStamina(n: number): boolean {
  if (vitals.down > 0 || vitals.st < n) return false;
  vitals.st -= n; vitals.rest = 0.7; publish();
  return true;
}
export function spendSp(n: number): boolean {
  if (vitals.down > 0 || vitals.sp < n) return false;
  vitals.sp -= n; publish();
  return true;
}
export function canAct() { return vitals.down <= 0; }

/** Golpe recebido. Devolve o dano que entrou (já com a defesa). */
export function hurtCompanion(damage: number, modality: Modality = 'fisica'): number {
  const v = vitals;
  if (v.down > 0) return 0;
  markCombat();
  const now = performance.now();
  // Barreira Breve: uma defesa válida (bloqueando ao receber o golpe) ergue a barreira, se a Marca estiver pronta
  const mark = markSource.get();
  if (mark?.id === 'barreira-breve' && v.blocking && now >= barrier.cdUntil && v.sp >= mark.spCost) {
    v.sp -= mark.spCost; barrier.until = now + mark.duration * 1000; barrier.cdUntil = now + mark.cooldown * 1000; barrier.left = mark.absorb;
  }
  if (barrier.until > now && barrier.left > 0) {
    const soak = Math.min(barrier.left, damage); barrier.left -= soak; damage -= soak;
    if (damage <= 0) { v.hitId++; publish(); return 0; }
  }
  // física → defesa física; mágica → resistência mágica (e o Bastião na guarda). A guarda corta 75% como antes.
  const dmg = incomingDamage(damage, modality, combat.d, v.blocking);
  v.hp = Math.max(0, v.hp - dmg); v.hitId++; v.lastHit = performance.now();
  if (v.hp <= 0) { v.down = 1; v.st = 0; v.blocking = false; } // desmaia: a stamina zera
  publish();
  return dmg;
}

export function healCompanion(n: number) { vitals.hp = Math.min(vitals.hpMax, vitals.hp + n); publish(); }

/** Chamado a cada quadro pelo Companion. */
export function tickVitals(dt: number) {
  const v = vitals;
  if (v.down > 0) {
    // só levanta com a stamina cheia
    v.st = Math.min(v.stMax, v.st + (v.stMax / DOWN_SECONDS) * dt);
    if (v.st >= v.stMax) { v.down = 0; v.hp = Math.max(v.hp, v.hpMax * 0.5); publish(true); }
  } else {
    v.hp = Math.min(v.hpMax, v.hp + (performance.now() - v.lastHit > 6000 ? 2 : 0.4) * dt);
    v.sp = Math.min(v.spMax, v.sp + combat.d.spRegen * dt);
    if (v.blocking) v.st = Math.max(0, v.st - combat.d.guard.drain * dt), v.rest = combat.cfg.stamina.regenDelay;
    else if (v.rest > 0) v.rest -= dt;
    else v.st = Math.min(v.stMax, v.st + combat.d.stRegen * dt);
  }
  acc += dt;
  if (acc > 0.1) { acc = 0; publish(); }
}
