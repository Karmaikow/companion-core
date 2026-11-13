/**
 * Ordens faladas ou escritas para a Companion ("Mayuna, ataque esses monstros!", "fuja, deu ruim!", "mate 30
 * monstros na Floresta Densa", "caminhe até a Montanha Azul e me chame quando chegar", "colha 40 folhas").
 * Entendidas no próprio jogo (rápido, sem IA); a conversa com a IA continua do jeito dela.
 */
import { normalize } from './text.ts';

export type GatherKind = 'madeira' | 'pedra' | 'planta' | 'folha' | 'flor' | 'raiz' | 'cogumelo' | 'cobre' | 'seiva' | 'gema';

export type Command =
  | { kind: 'attack' }
  | { kind: 'flee' }
  | { kind: 'stop' }
  | { kind: 'calm' }
  | { kind: 'hunt'; count: number; creature: string | null; place: string | null }
  /** "limpe a área": derrota todos os monstros por perto, recolhe tudo e segue para a próxima área, até mandar parar */
  | { kind: 'clear' }
  | { kind: 'goto'; place: string; call: boolean }
  | { kind: 'gather'; count: number; what: GatherKind };

const NUM_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cem: 100,
};

function numberIn(t: string): number | null {
  const m = /\b(\d{1,4})\b/.exec(t);
  if (m) return Number(m[1]);
  for (const [w, n] of Object.entries(NUM_WORDS)) if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  return null;
}

/** Acha o nome mais longo de `names` dentro do texto (lugares, criaturas). */
function findName(t: string, names: string[]): string | null {
  let best: string | null = null;
  for (const n of names) {
    const k = normalize(n);
    if (k.length >= 3 && t.includes(k) && (!best || k.length > normalize(best).length)) best = n;
  }
  return best;
}

const GATHER: [RegExp, GatherKind][] = [
  [/\b(madeira|madeiras|tronco|troncos|lenha|galho|galhos)\b/, 'madeira'],
  [/\b(cobre|cobres|minerio|minerios|metal)\b/, 'cobre'],
  [/\b(cristal|cristais|gema|gemas|quartzo)\b/, 'gema'],
  [/\b(seiva|seivas|resina)\b/, 'seiva'],
  [/\b(raiz|raizes)\b/, 'raiz'],
  [/\b(pedra|pedras|rocha|rochas|seixo|seixos|granito)\b/, 'pedra'],
  [/\b(folha|folhas)\b/, 'folha'],
  [/\b(flor|flores)\b/, 'flor'],
  [/\b(cogumelo|cogumelos)\b/, 'cogumelo'],
  [/\b(planta|plantas|erva|ervas)\b/, 'planta'],
];

export function parseCommand(text: string, opts: { places?: string[]; creatures?: string[] } = {}): Command | null {
  const t = ' ' + normalize(text).replace(/[!?.,;:]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (t.trim().length < 3) return null;
  const n = numberIn(t);
  const place = findName(t, opts.places ?? []);
  const creature = findName(t, opts.creatures ?? []);

  // fugir vem primeiro: "deu ruim, foge!" não pode virar ataque
  if (/\b(fuja|foge|fugir|fuga|recua|recue|recuar|deu ruim|sai dai|sai de ai|vaza|socorro)\b/.test(t)) return { kind: 'flee' };
  if (/\b(pare|parar|para tudo|para de|chega|stop|desista|deixa pra la|deixa quieto)\b/.test(t)) return { kind: 'stop' };
  if (/\b(nao ataque|nao lute|fique calma|fique calmo|fica calma|fica calmo|sem lutar|modo pacifico)\b/.test(t)) return { kind: 'calm' };

  // "limpe a área", "limpa tudo por aqui", "faz a faxina": antes de caçar e de colher (é os dois, e em sequência)
  if (/\b(limpe|limpa|limpar|limpem)\b.*\b(area|areas|regiao|mapa|tudo|aqui|lugar|geral|terreno|redondeza|redondezas)\b/.test(t) || /\bfaxina\b/.test(t)) return { kind: 'clear' };

  const gather = /\b(colha|colher|colete|coletar|recolha|junte|juntar|pegue|pega|busque|busca|traga|traz)\b/.test(t) ? GATHER.find(([re]) => re.test(t)) : undefined;
  if (gather) return { kind: 'gather', count: Math.max(1, Math.min(999, n ?? 10)), what: gather[1] };

  const killVerb = /\b(mate|matar|mata|derrote|derrota|derrotar|cace|cacar|caca|elimine|eliminar|acabe com|acaba com|destrua|destroi)\b/.test(t);
  if (killVerb && (n !== null || creature)) return { kind: 'hunt', count: Math.max(1, Math.min(999, n ?? 1)), creature, place };

  const goVerb = /\b(va|vai|ir|caminhe|caminha|ande|anda|corra ate|siga|segue|leve|me leve|viaje|explore)\b/.test(t) && /\b(ate|para|pra|pro|na|no|em)\b/.test(t);
  if (goVerb && place) return { kind: 'goto', place, call: /\b(me chame|me chama|me avise|me avisa|avisa|chama)\b/.test(t) };

  if (killVerb || /\b(ataque|ataca|atacar|ataquem|bata|bate|lute|luta|lutar|pega eles|pega ele|vai pra cima|vai com tudo|manda ver|pra cima deles?)\b/.test(t)) return { kind: 'attack' };
  return null;
}
