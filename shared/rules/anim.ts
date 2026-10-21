/**
 * Biblioteca de animações do Companion. Geradores como o Tripo exportam cada animação num .GLB separado,
 * quase sempre com o clipe chamado "Take 001"; por isso o tipo vem do nome do arquivo (ou do clipe).
 * Todos os arquivos saem do mesmo rig, então os clipes se encaixam no mesmo modelo.
 */
import { normalize } from './text.ts';

export type AnimKind = 'idle' | 'walk' | 'run' | 'attack' | 'hurt' | 'faint' | 'happy' | 'sleep' | 'jump' | 'eat' | 'special';

export const ANIM_KINDS: { kind: AnimKind; label: string; words: string[] }[] = [
  { kind: 'idle', label: 'Parado', words: ['idle', 'parado', 'parada', 'stand', 'breath', 'respira', 'espera', 'rest'] },
  { kind: 'walk', label: 'Andando', words: ['walk', 'andar', 'andando', 'anda', 'caminha', 'trot', 'passo'] },
  { kind: 'run', label: 'Correndo', words: ['run', 'corre', 'correndo', 'correr', 'sprint', 'gallop', 'galope'] },
  { kind: 'attack', label: 'Ataque', words: ['attack', 'ataque', 'ataca', 'atacando', 'bite', 'mordida', 'claw', 'garra', 'hit', 'golpe'] },
  { kind: 'hurt', label: 'Ferido', words: ['hurt', 'damage', 'ferido', 'dano', 'apanha'] },
  { kind: 'faint', label: 'Desmaiado', words: ['faint', 'die', 'death', 'dead', 'desmaia', 'desmaiado', 'desmaio', 'cai', 'knockout', 'ko'] },
  { kind: 'happy', label: 'Feliz', words: ['happy', 'feliz', 'cheer', 'comemora', 'celebra', 'dance', 'danca', 'pula de alegria'] },
  { kind: 'sleep', label: 'Dormindo', words: ['sleep', 'dorme', 'dormindo', 'dormir', 'sono', 'nap', 'lie', 'deitado', 'deita'] },
  { kind: 'jump', label: 'Pulo', words: ['jump', 'pulo', 'pula', 'pular', 'salto'] },
  { kind: 'eat', label: 'Comendo', words: ['eat', 'come', 'comendo', 'comer', 'drink', 'bebe'] },
];

/** Tipo da animação a partir do nome do arquivo e/ou do clipe. "correndo" vence "andando" quando os dois aparecem. */
export function animKind(...names: string[]): AnimKind | null {
  const n = ' ' + normalize(names.join(' ')).replace(/[_\-.]/g, ' ') + ' ';
  const order: AnimKind[] = ['faint', 'sleep', 'attack', 'hurt', 'happy', 'jump', 'eat', 'run', 'walk', 'idle'];
  for (const k of order) {
    const def = ANIM_KINDS.find((d) => d.kind === k)!;
    if (def.words.some((w) => n.includes(' ' + w))) return k;
  }
  return null;
}

export function animLabel(kind: string): string {
  return ANIM_KINDS.find((d) => d.kind === kind)?.label ?? 'Especial';
}

/** Velocidade de andar que casa com o passo da animação (sem patinar): deslocamento da raiz ÷ duração do ciclo. */
export function strideSpeed(rootDistance: number, duration: number, fallback = 0.8): number {
  if (!(duration > 0) || !(rootDistance > 0.01)) return fallback;
  return Math.min(3, Math.max(0.2, rootDistance / duration));
}
