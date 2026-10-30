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
  { kind: 'idle', label: 'Parado', words: ['idle', 'parado', 'parada', 'stand', 'breath', 'respira', 'espera', 'rest', 'coiled', 'enrolad', 'glide', 'plana'] },
  { kind: 'walk', label: 'Andando', words: ['walk', 'andar', 'andando', 'anda', 'caminha', 'trot', 'passo', 'swim', 'nada', 'nadando', 'slither', 'side winding', 'sidewinding', 'rasteja'] },
  { kind: 'run', label: 'Correndo', words: ['run', 'jog', 'corre', 'correndo', 'correr', 'sprint', 'gallop', 'galope', 'flap', 'fly', 'voa', 'voando', 'voo'] },
  { kind: 'attack', label: 'Ataque', words: ['attack', 'ataque', 'ataca', 'atacando', 'bite', 'mordida', 'claw', 'garra', 'golpe', 'stab', 'slash', 'sword', 'dagger', 'knife', 'mace', 'smash', 'spear', 'thrust', 'punch', 'soco', 'kick', 'chute', 'head but', 'headbutt', 'chifrada', 'espada', 'faca', 'adaga', 'maca', 'lanca', 'estoca', 'corte'] },
  { kind: 'hurt', label: 'Ferido', words: ['hurt', 'damage', 'hit', 'ferido', 'dano', 'apanha', 'hit to', 'hit by', 'stomach', 'impact', 'flinch', 'atingid'] },
  { kind: 'faint', label: 'Desmaiado', words: ['faint', 'die', 'death', 'dead', 'desmaia', 'desmaiado', 'desmaio', 'cai', 'knockout', 'ko', 'fall', 'queda', 'knocked'] },
  { kind: 'happy', label: 'Feliz', words: ['happy', 'feliz', 'cheer', 'comemora', 'celebra', 'dance', 'danca', 'pula de alegria', 'victory', 'vitoria', 'howl', 'uiva', 'roar', 'ruge', 'rear'] },
  { kind: 'sleep', label: 'Dormindo', words: ['sleep', 'dorme', 'dormindo', 'dormir', 'sono', 'nap', 'lie', 'deitado', 'deita'] },
  { kind: 'jump', label: 'Pulo', words: ['jump', 'pulo', 'pula', 'pular', 'salto'] },
  { kind: 'cast', label: 'Magia', words: ['cast', 'magia', 'magic', 'spell', 'feitico', 'conjura', 'atirar fogo', 'fireball', 'bola de fogo', 'lancar magia'] },
  { kind: 'shoot', label: 'Arco / tiro', words: ['shoot', 'bow', 'arrow', 'arco', 'flecha', 'atirar', 'disparo', 'archer', 'arqueir'] },
  { kind: 'dodge', label: 'Esquiva', words: ['dodge', 'esquiva', 'roll', 'rolamento', 'rolar', 'desvia'] },
  { kind: 'block', label: 'Defender', words: ['block', 'defend', 'defende', 'defesa', 'guard pose', 'bloque', 'escudo', 'blocking'] },
  { kind: 'getup', label: 'Levantando', words: ['getup', 'get up', 'stand up', 'levanta', 'levantando', 'levantar'] },
  { kind: 'sit', label: 'Sentado', words: ['sit', 'sentad', 'sentar', 'senta'] },
  { kind: 'pickup', label: 'Pegando do chão', words: ['pick', 'pegar', 'pegando', 'coleta', 'coletar', 'agacha', 'crouch', 'dig', 'cavar', 'cavando', 'gather'] },
  { kind: 'wave', label: 'Acenando', words: ['wave', 'waving', 'acena', 'acenando', 'tchau', 'hello', 'greeting', 'cumprimenta'] },
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

/** Multi-clip files describe a library; each clip's name takes precedence over the filename.
 * A specific hint is only supplied for single-clip uploads by the loader.
 */
export function clipAnimKind(clipName: string, fileName: string, hint: string | null = null): string | null {
  return (hint && hint !== 'special' ? hint : null) ?? animKind(clipName) ?? animKind(fileName);
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

// ---------------------------------------------------------------------------
// Animações por "papel" (O Administrador → Animações): o ADM escolhe qual clipe do modelo faz cada papel.
// Guardado em companion_skill_anims.anims como { "slot:<papel>": "anim:<arquivo>|<clipe>" } ("arquivo" é o nome do
// .GLB de animação, ou "corpo" para o arquivo do modelo). Sem escolha, vale o reconhecimento automático pelo nome.
// ---------------------------------------------------------------------------

export interface AnimSlot { key: string; label: string; loop: boolean; /** o que o jogo faz com ele */ hint: string; /** como a prévia mostra: andando em círculo, correndo ou no lugar */ preview: 'idle' | 'walk' | 'run' | 'once' | 'loop' }

export const COMPANION_ANIM_SLOTS: AnimSlot[] = [
  { key: 'idle', label: 'Parado', loop: true, preview: 'idle', hint: 'Em pé, respirando. Sem ele o modelo fica na pose de braços abertos.' },
  { key: 'walk', label: 'Andando', loop: true, preview: 'walk', hint: 'Shift, passeio sozinho e defesa.' },
  { key: 'run', label: 'Correndo', loop: true, preview: 'run', hint: 'Movimento normal (clique ou WASD).' },
  { key: 'sit', label: 'Sentado', loop: true, preview: 'loop', hint: 'Tecla C.' },
  { key: 'attack', label: 'Ataque básico', loop: false, preview: 'once', hint: 'Sem arma, ou com arma sem golpe próprio.' },
  { key: 'attack:espada', label: 'Ataque espada', loop: false, preview: 'once', hint: 'Com espada (e lança, se não tiver o da lança).' },
  { key: 'attack:faca', label: 'Ataque adaga', loop: false, preview: 'once', hint: 'Com faca ou adaga.' },
  { key: 'attack:maca', label: 'Ataque maça', loop: false, preview: 'once', hint: 'Com maça.' },
  { key: 'shoot', label: 'Ataque arco', loop: false, preview: 'once', hint: 'Arco (segura no meio enquanto carrega).' },
  { key: 'cast', label: 'Ataque magia', loop: false, preview: 'once', hint: 'Habilidades à distância (barra 1–9).' },
  { key: 'attack:magia', label: 'Ataque básico magia', loop: false, preview: 'once', hint: 'Golpe básico com cajado, varinha ou orbe.' },
  { key: 'fidget', label: 'Ocioso', loop: false, preview: 'once', hint: 'De vez em quando, parado há um tempo (espreguiçar, olhar em volta).' },
  { key: 'pickup', label: 'Coletando item do chão', loop: true, preview: 'loop', hint: 'Coleta de caça, magia e o que cai no chão.' },
  { key: 'mine', label: 'Minerando com picareta', loop: true, preview: 'loop', hint: 'Coleta de pedra, minério e gemas.' },
  { key: 'gather', label: 'Coletando plantas', loop: true, preview: 'loop', hint: 'Coleta de plantas.' },
  { key: 'chop', label: 'Coletando madeira', loop: true, preview: 'loop', hint: 'Coleta de madeira.' },
  { key: 'jump', label: 'Salto', loop: false, preview: 'once', hint: 'Espaço.' },
  { key: 'faint', label: 'Desmaiando', loop: false, preview: 'once', hint: 'HP zerou (fica deitado no fim).' },
  { key: 'happy', label: 'Joker (comemoração)', loop: false, preview: 'once', hint: 'Coringa: conquistas, quests, despertar.' },
  { key: 'block', label: 'Defesa', loop: true, preview: 'loop', hint: 'Segurar E.' },
];

/** Papéis das criaturas (o que o mundo pede para elas fazerem). Além de um clipe, podem usar o movimento por código. */
export const CREATURE_ANIM_SLOTS: AnimSlot[] = [
  { key: 'idle', label: 'Parado', loop: true, preview: 'idle', hint: 'Esperando, olhando.' },
  { key: 'walk', label: 'Andando', loop: true, preview: 'walk', hint: 'Passeio perto de casa.' },
  { key: 'run', label: 'Correndo', loop: true, preview: 'run', hint: 'Perseguindo, fugindo, voltando para casa.' },
  { key: 'attack', label: 'Ataque', loop: true, preview: 'loop', hint: 'Golpeando o Companion.' },
  { key: 'hurt', label: 'Ferido', loop: true, preview: 'loop', hint: 'Logo depois de levar um golpe.' },
  { key: 'happy', label: 'Comemorando', loop: true, preview: 'loop', hint: 'Depois de derrubar o Companion.' },
  { key: 'sleep', label: 'Dormindo', loop: true, preview: 'loop', hint: 'Fora do horário dela.' },
];

/** Valor guardado: um clipe ("anim:<arquivo>|<clipe>"), "procedural" (só criaturas) ou "" (automático). */
export const animRef = (file: string, clip: string) => `anim:${file}|${clip}`;
export function parseAnimRef(v: string | undefined | null): { file: string; clip: string } | 'procedural' | null {
  if (!v) return null;
  if (v === 'procedural') return 'procedural';
  if (v.startsWith('anim:')) { const i = v.indexOf('|'); return i > 5 ? { file: v.slice(5, i), clip: v.slice(i + 1) } : null; }
  if (v.startsWith('clip:')) return { file: '*', clip: v.slice(5) }; // formato antigo (só o nome do clipe)
  return null;
}
/** Tipo de coleta (categoria do material do Ecos) → papel da animação. */
export function gatherSlot(category: string): 'mine' | 'gather' | 'chop' | 'pickup' {
  return category === 'pedra' || category === 'minerio' || category === 'gema' ? 'mine' : category === 'planta' ? 'gather' : category === 'madeira' ? 'chop' : 'pickup';
}
