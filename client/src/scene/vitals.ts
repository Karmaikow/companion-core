/**
 * Vida (HP), SP e Stamina do Companion fora da batalha de verdade (treino e mundo).
 * - HP: cai com os golpes das criaturas (a defesa segurada corta 75%); zerou, o Companion desmaia e volta com metade.
 * - SP: gasto pelas habilidades (energia da Forja); volta devagar.
 * - Stamina: pulo, ataque básico e defesa; volta rápido depois de um instante sem gastar.
 * Os máximos vêm da classe (tendência dos atributos), dos bônus da árvore e do vínculo.
 * O laço do Companion chama `tick`; a interface lê `useVitals` (atualizado ~10×/s).
 */
import { create } from 'zustand';
import { SPECIES, type AttrKey, type SpeciesKey } from '@rules';

export interface VitalsView { hp: number; hpMax: number; sp: number; spMax: number; st: number; stMax: number; down: boolean; hitId: number }

export const vitals = { hp: 100, hpMax: 100, sp: 60, spMax: 60, st: 100, stMax: 100, down: 0, rest: 0, hitId: 0, blocking: false, lastHit: 0 };

export const useVitals = create<VitalsView>(() => ({ hp: 100, hpMax: 100, sp: 60, spMax: 60, st: 100, stMax: 100, down: false, hitId: 0 }));

let acc = 0;
function publish(force = false) {
  const v = vitals, cur = useVitals.getState();
  const next: VitalsView = { hp: Math.round(v.hp), hpMax: v.hpMax, sp: Math.round(v.sp), spMax: v.spMax, st: Math.round(v.st), stMax: v.stMax, down: v.down > 0, hitId: v.hitId };
  if (force || next.hp !== cur.hp || next.sp !== cur.sp || next.st !== cur.st || next.down !== cur.down || next.hpMax !== cur.hpMax || next.spMax !== cur.spMax || next.stMax !== cur.stMax || next.hitId !== cur.hitId) useVitals.setState(next);
}

/** Máximos pela classe, bônus da árvore (%) e vínculo. Mantém a proporção atual. */
export function setMaxima(species: SpeciesKey | null, bonus: Partial<Record<AttrKey, number>>, bond: number) {
  const a = species ? SPECIES[species].attrs : {};
  const t = (k: AttrKey) => 1 + 0.1 * (a[k] ?? 0);
  const b = (k: AttrKey) => 1 + (bonus[k] ?? 0) / 100;
  const hpMax = Math.round(100 * t('vida') * b('vida') + 5 * (bond - 1));
  const spMax = Math.round(60 * t('energia') * b('energia') + 3 * (bond - 1));
  const stMax = Math.round(100 * t('agilidade') * b('agilidade'));
  const v = vitals;
  if (hpMax === v.hpMax && spMax === v.spMax && stMax === v.stMax) return;
  v.hp = (v.hp / v.hpMax) * hpMax; v.sp = (v.sp / v.spMax) * spMax; v.st = (v.st / v.stMax) * stMax;
  v.hpMax = hpMax; v.spMax = spMax; v.stMax = stMax;
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
export function hurtCompanion(damage: number): number {
  const v = vitals;
  if (v.down > 0) return 0;
  const dmg = Math.max(1, Math.round(damage * (v.blocking ? 0.25 : 1)));
  v.hp = Math.max(0, v.hp - dmg); v.hitId++; v.lastHit = performance.now();
  if (v.hp <= 0) v.down = 4; // desmaia por 4 s
  publish();
  return dmg;
}

export function healCompanion(n: number) { vitals.hp = Math.min(vitals.hpMax, vitals.hp + n); publish(); }

/** Chamado a cada quadro pelo Companion. */
export function tickVitals(dt: number) {
  const v = vitals;
  if (v.down > 0) {
    v.down -= dt;
    if (v.down <= 0) { v.down = 0; v.hp = v.hpMax * 0.5; v.st = v.stMax * 0.5; publish(true); }
  } else {
    v.hp = Math.min(v.hpMax, v.hp + (performance.now() - v.lastHit > 6000 ? 2 : 0.4) * dt);
    v.sp = Math.min(v.spMax, v.sp + 3 * dt);
    if (v.blocking) v.st = Math.max(0, v.st - 14 * dt), v.rest = 0.7;
    else if (v.rest > 0) v.rest -= dt;
    else v.st = Math.min(v.stMax, v.st + 28 * dt);
  }
  acc += dt;
  if (acc > 0.1) { acc = 0; publish(); }
}
