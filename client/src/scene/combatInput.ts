/**
 * Entrada do combate (o que a interface escreve e a cena lê). Fica fora do Combat.tsx de propósito: este arquivo não
 * importa three nem r3f, então os botões e a barra de atalhos não puxam o 3D para o carregamento inicial.
 */
import type { HitInfo, SkillDef } from '@rules';

/** Entrada: apertar começa (o arco carrega enquanto segura), soltar termina. */
export const combatInput = { holding: false, pressId: 0, releaseId: 0 };
export function pressAttack() { if (combatInput.holding) return; combatInput.holding = true; combatInput.pressId++; }
export function releaseAttack() { if (!combatInput.holding) return; combatInput.holding = false; combatInput.releaseId++; }

/** Pulo, sentar e defesa (teclado: Espaço, C, segurar E; celular: botões). */
/** `stick`: joystick virtual do celular (x direita, y para frente; tamanho 0–1 — perto da borda corre). */
export const moveInput = { jumpId: 0, sitId: 0, block: false, stick: { x: 0, y: 0, on: false } };

/** Mira pelo mouse: vale quando a última interação foi com mouse (no celular, a mira é automática). */
export const aim = { mouse: false };
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => { aim.mouse = e.pointerType === 'mouse'; }, { passive: true });
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { aim.mouse = e.pointerType === 'mouse'; }, { passive: true });

/** Concentração de habilidade (Shift + 1–9): a barra escreve aqui, a cena mostra o brilho crescendo no Companion. */
export const skillChargeState = { active: false, charge: 0, perfect: false, color: '#ffd56b' };

/** Habilidade pedida pela barra de atalhos (1–9); o Companion lê, vira para o alvo, anima e dispara. */
export interface SkillCast { skill: SkillDef; level: number; color: string; /** custo, preparação e dano congelados no lançamento (Constelação Viva) */ frozen?: { cost: number; windup: number; damage: number; heal: number; info: HitInfo }; /** mira num ponto (a Companion lutando sozinha, ou mira no monstro mais perto) */ aimAt?: { x: number; z: number } }
export const skillInput = { id: 0, req: null as SkillCast | null, /** há um corpo 3D para lançar */ body: false };
export function requestSkill(c: SkillCast) { skillInput.req = c; skillInput.id++; }
