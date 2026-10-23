/** Normalização para comparação (sem acentos, minúsculas, só letras/números). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1') // "muuuuito" -> "muuito"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(text: string): Set<string> {
  const words = normalize(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  if (words.length < 3) {
    for (const w of words) out.add(w);
    return out;
  }
  for (let i = 0; i < words.length - 1; i++) out.add(words[i] + ' ' + words[i + 1]);
  return out;
}

/** Similaridade de Jaccard sobre bigramas de palavras (0–1). */
export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function clampText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  // remove caracteres de controle, preserva quebras de linha
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// Companion "ele": as falas sobre si no masculino
// ---------------------------------------------------------------------------

/** Adjetivos que o Companion usa sobre si (forma feminina → masculina). Só troca quando fala de si. */
const SELF_ADJ: Record<string, string> = {
  pronta: 'pronto', curiosa: 'curioso', curiosinha: 'curiosinho', animada: 'animado', animadinha: 'animadinho', cansada: 'cansado', cansadinha: 'cansadinho',
  preparada: 'preparado', assustada: 'assustado', ansiosa: 'ansioso', nervosa: 'nervoso', empolgada: 'empolgado', encantada: 'encantado',
  maravilhada: 'maravilhado', emocionada: 'emocionado', orgulhosa: 'orgulhoso', confusa: 'confuso', tímida: 'tímido', timida: 'timido', tranquila: 'tranquilo',
  calma: 'calmo', corajosa: 'corajoso', sozinha: 'sozinho', desperta: 'desperto', acordada: 'acordado', perdida: 'perdido', ferida: 'ferido',
  fraca: 'fraco', fraquinha: 'fraquinho', quietinha: 'quietinho', quieta: 'quieto', segura: 'seguro', sonolenta: 'sonolento', grata: 'grato', obrigada: 'obrigado',
  apaixonada: 'apaixonado', entusiasmada: 'entusiasmado', intrigada: 'intrigado', honrada: 'honrado', agradecida: 'agradecido', preocupada: 'preocupado',
  aliviada: 'aliviado', surpresa: 'surpreso', pequena: 'pequeno', pequenininha: 'pequenininho', faminta: 'faminto', satisfeita: 'satisfeito', contentinha: 'contentinho',
  pensativa: 'pensativo', saudosa: 'saudoso', serena: 'sereno', brincalhona: 'brincalhão', sonhadora: 'sonhador', exploradora: 'explorador', protetora: 'protetor',
  inspirada: 'inspirado', motivada: 'motivado', decidida: 'decidido', determinada: 'determinado', focada: 'focado', atenta: 'atento', esperta: 'esperto',
  cheia: 'cheio', viva: 'vivo', louca: 'louco', doida: 'doido', feita: 'feito', nascida: 'nascido', criada: 'criado', chamada: 'chamado', ligada: 'ligado',
  machucada: 'machucado', derrotada: 'derrotado', tonta: 'tonto', zonza: 'zonzo', molhada: 'molhado', gelada: 'gelado', quentinha: 'quentinho', escondida: 'escondido',
  sortuda: 'sortudo', bobinha: 'bobinho', boba: 'bobo', linda: 'lindo', bonita: 'bonito', forte: 'forte', esgotada: 'esgotado', exausta: 'exausto',
};
/** Palavras que, antes do adjetivo, indicam que o Companion fala de si ("estou pronta", "fico animada", "me sinto sozinha"). */
const SELF_VERB = '(?:estou|esteja|estava|estive|estarei|t[ôo]|fico|fiquei|ficaria|vou ficar|sou|serei|seria|ando|andei|me sinto|me senti|me sentindo|sinto-me|continuo|permane[çc]o|virei|pare[çc]o|eu)';
const SELF_INT = '(?:t[ãa]o|muito|bem|meio|super|toda|todinha|um pouco|cada vez mais|mais|menos|ainda|j[áa]|quase|t[ãa]o t[ãa]o)';
const SELF_RE = new RegExp(`\\b(${SELF_VERB})(\\s+(?:${SELF_INT}\\s+)*)(${Object.keys(SELF_ADJ).join('|')})\\b`, 'giu');

/**
 * Troca para o masculino as palavras com que o Companion fala de si. Conservador: só depois de um verbo ou
 * intensificador de estado ("estou pronta", "fico tão animada"), mais "Obrigada" e "Curiosa? Calma?…".
 * Usado nas falas prontas, no respondedor offline, nas falas curtas e nas respostas da IA quando o Companion é "ele".
 */
export function masculinize(text: string): string {
  if (!text) return text;
  const keepCase = (src: string, rep: string) => (src[0] === src[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep);
  let out = text;
  out = out.replace(SELF_RE, (_m, cue: string, sp: string, adj: string) => cue + sp + keepCase(adj, SELF_ADJ[adj.toLowerCase()] ?? adj));
  // "pronta e curiosa" depois de uma troca: o adjetivo coordenado também
  out = out.replace(new RegExp(`\\b(${Object.values(SELF_ADJ).join('|')})(\\s+e\\s+|,\\s*)(${Object.keys(SELF_ADJ).join('|')})\\b`, 'giu'), (_m, a: string, sep: string, b: string) => a + sep + keepCase(b, SELF_ADJ[b.toLowerCase()] ?? b));
  out = out.replace(/(^|[.!?…]\s*|\s)Obrigada\b/g, '$1Obrigado').replace(/\bobrigada\b/g, 'obrigado')
    .replace(/\bCuriosa\? Calma\? Corajosa\?/g, 'Curioso? Calmo? Corajoso?')
    .replace(/\buma Companion\b/g, 'um Companion').replace(/\bsua Companion\b/g, 'seu Companion');
  return out;
}
