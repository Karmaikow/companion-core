/**
 * Biblioteca de animações do Companion (humanoide: as mesmas servem para todos). Geradores como o Tripo exportam
 * cada animação num .GLB separado (ou várias num só),
 * quase sempre com o clipe chamado "Take 001"; por isso o tipo vem do nome do arquivo (ou do clipe).
 * Todos os arquivos saem do mesmo rig, então os clipes se encaixam no mesmo modelo.
 */
import { normalize } from './text.ts';

export type AnimKind = 'idle' | 'walk' | 'run' | 'attack' | 'hurt' | 'faint' | 'happy' | 'sleep' | 'jump' | 'eat'
  | 'cast' | 'shoot' | 'dodge' | 'block' | 'getup' | 'sit' | 'pickup' | 'wave' | 'talk' | 'special';

export const ANIM_KINDS: { kind: AnimKind; label: string; words: string[] }[] = [
  { kind: 'idle', label: 'Parado', words: ['idle', 'parado', 'parada', 'stand', 'breath', 'respira', 'espera', 'rest'] },
  { kind: 'walk', label: 'Andando', words: ['walk', 'andar', 'andando', 'anda', 'caminha', 'trot', 'passo'] },
  { kind: 'run', label: 'Correndo', words: ['run', 'corre', 'correndo', 'correr', 'sprint', 'gallop', 'galope'] },
  { kind: 'attack', label: 'Ataque', words: ['attack', 'ataque', 'ataca', 'atacando', 'bite', 'mordida', 'claw', 'garra', 'golpe', 'stab', 'slash', 'sword', 'dagger', 'knife', 'mace', 'smash', 'spear', 'thrust', 'punch', 'soco', 'espada', 'faca', 'adaga', 'maca', 'lanca', 'estoca', 'corte'] },
  { kind: 'hurt', label: 'Ferido', words: ['hurt', 'damage', 'ferido', 'dano', 'apanha', 'hit to', 'hit by', 'stomach', 'impact', 'flinch', 'atingid'] },
  { kind: 'faint', label: 'Desmaiado', words: ['faint', 'die', 'death', 'dead', 'desmaia', 'desmaiado', 'desmaio', 'cai', 'knockout', 'ko', 'fall', 'queda', 'knocked'] },
  { kind: 'happy', label: 'Feliz', words: ['happy', 'feliz', 'cheer', 'comemora', 'celebra', 'dance', 'danca', 'pula de alegria'] },
  { kind: 'sleep', label: 'Dormindo', words: ['sleep', 'dorme', 'dormindo', 'dormir', 'sono', 'nap', 'lie', 'deitado', 'deita'] },
  { kind: 'jump', label: 'Pulo', words: ['jump', 'pulo', 'pula', 'pular', 'salto'] },
  { kind: 'cast', label: 'Magia', words: ['cast', 'magia', 'magic', 'spell', 'feitico', 'conjura', 'atirar fogo', 'fireball', 'bola de fogo', 'lancar magia'] },
  { kind: 'shoot', label: 'Arco / tiro', words: ['shoot', 'bow', 'arrow', 'arco', 'flecha', 'atirar', 'disparo', 'archer', 'arqueir'] },
  { kind: 'dodge', label: 'Esquiva', words: ['dodge', 'esquiva', 'roll', 'rolamento', 'rolar', 'desvia'] },
  { kind: 'block', label: 'Defender', words: ['block', 'defend', 'defende', 'defesa', 'guard pose', 'bloque', 'escudo', 'blocking'] },
  { kind: 'getup', label: 'Levantando', words: ['getup', 'get up', 'stand up', 'levanta', 'levantando', 'levantar'] },
  { kind: 'sit', label: 'Sentado', words: ['sit', 'sentad', 'sentar', 'senta'] },
  { kind: 'pickup', label: 'Pegando do chão', words: ['pick', 'pegar', 'pegando', 'coleta', 'coletar', 'agacha', 'crouch', 'dig', 'cavar', 'cavando', 'gather'] },
  { kind: 'wave', label: 'Acenando', words: ['wave', 'waving', 'acena', 'acenando', 'tchau', 'hello', 'cumprimenta'] },
  { kind: 'talk', label: 'Conversando', words: ['talk', 'convers', 'falando', 'gesticul', 'chat', 'complain', 'reclam', 'explica'] },
  { kind: 'eat', label: 'Comendo', words: ['eat', 'come', 'comendo', 'comer', 'drink', 'bebe'] },
];

/** Tipo da animação a partir do nome do arquivo e/ou do clipe. "correndo" vence "andando" quando os dois aparecem. */
export function animKind(...names: string[]): AnimKind | null {
  const n = ' ' + normalize(names.join(' ')).replace(/[_\-.]/g, ' ') + ' ';
  const order: AnimKind[] = ['getup', 'faint', 'sleep', 'block', 'sit', 'cast', 'shoot', 'dodge', 'attack', 'hurt', 'happy', 'wave', 'talk', 'pickup', 'jump', 'eat', 'run', 'walk', 'idle'];
  for (const k of order) {
    const def = ANIM_KINDS.find((d) => d.kind === k)!;
    // palavras longas valem mesmo grudadas em outra ("cruzadasblocking" — nomes cortados/emendados do Tripo)
    if (def.words.some((w) => n.includes(' ' + w) || (w.length >= 7 && n.includes(w)))) return k;
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

/** Golpe próprio de uma arma, pelo nome do clipe ("sword slash" → espada). O jogo prefere o golpe da arma equipada. */
export function attackVariant(...names: string[]): 'espada' | 'faca' | 'maca' | 'lanca' | null {
  const n = ' ' + normalize(names.join(' ')).replace(/[_\-.]/g, ' ') + ' ';
  const has = (...w: string[]) => w.some((x) => n.includes(' ' + x));
  if (has('dagger', 'knife', 'stab', 'faca', 'adaga', 'punhal')) return 'faca';
  if (has('mace', 'smash', 'hammer', 'maca', 'clava', 'martelo')) return 'maca';
  if (has('spear', 'thrust', 'lance', 'lanca', 'estoca')) return 'lanca';
  if (has('sword', 'slash', 'espada', 'corte', 'katana')) return 'espada';
  return null;
}
