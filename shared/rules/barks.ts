/**
 * Falas curtas da Companion durante o jogo (sem IA, na hora): ao ver uma criatura, ao lutar, ao derrotar, com pouca
 * vida, ao receber uma ordem, ao chegar num lugar, passeando. O tom muda com os traços dela (brincalhona, corajosa,
 * serena…). `{m}` = monstro, `{p}` = lugar, `{n}` = número, `{you}` = a pessoa.
 */
import { clampText, masculinize, normalize } from './text.ts';
import { voiceFor } from './engine.ts';
import type { Discoveries } from './identity.ts';

export type BarkEvent =
  | 'see-new' | 'see-known' | 'engage' | 'attack' | 'skill' | 'hurt' | 'low-hp' | 'flee' | 'kill' | 'first-kill' | 'analyzed'
  | 'revive' | 'order-attack' | 'order-flee' | 'order-stop' | 'order-calm' | 'order-hunt' | 'order-goto' | 'order-gather' | 'hunt-progress' | 'hunt-done'
  | 'arrive' | 'region' | 'idle' | 'idle-rain' | 'idle-night';

type Tone = 'brincalhona' | 'corajosa' | 'serena' | 'base';

const LINES: Record<BarkEvent, Partial<Record<Tone, string[]>> & { base: string[] }> = {
  'see-new': { base: ['Olha! Um(a) {m}… nunca vi isso antes.', 'O que é aquilo? Um(a) {m}!', 'Hm… {m}. Vou lembrar dessa cara.'], brincalhona: ['Eita, que bicho é esse? {m}?!', 'Um(a) {m}! Será que morde? 😅'], corajosa: ['Um(a) {m}. Deixa comigo!'] },
  'see-known': { base: ['Mais um(a) {m}.', 'Ah, {m} de novo.', '{m}! Eu já sei como você é.'], brincalhona: ['{m} outra vez? Vocês não cansam?'] },
  engage: { base: ['Vamos lá!', 'Aqui vou eu!', 'Fica atrás de mim!'], corajosa: ['Pra cima!', 'Pode vir!'], serena: ['Com calma… agora.'] },
  attack: { base: ['Hah!', 'Toma!', 'Iá!', 'Atacaaar!'], brincalhona: ['Bonk!', 'Tchaaam!'] },
  skill: { base: ['Agora!', 'Sente isso!', 'Lá vai!'], corajosa: ['Com tudo!'] },
  hurt: { base: ['Ai!', 'Ui!', 'Essa doeu…'], brincalhona: ['Ei, isso não foi legal!'] },
  'low-hp': { base: ['Socorro, me ajuda!', 'Tô ficando fraca…', 'Ai… preciso respirar!'], corajosa: ['Ainda não acabou… mas tá difícil!'] },
  flee: { base: ['Deu ruim! Correndo!', 'Vou recuar!', 'Fugindo, fugindo!'], brincalhona: ['Estratégia: correr! 🏃'] },
  kill: { base: ['Consegui!', 'Pronto!', 'Mais um(a)!'], brincalhona: ['Uhul!', 'Fácil fácil!'], serena: ['Descanse, {m}.'] },
  'first-kill': { base: ['Derrotei um(a) {m}! Vou guardar essa memória.', 'Partículas de {m}… que estranho e bonito.'] },
  analyzed: { base: ['Análise completa! Agora eu sei tudo sobre {m}.', 'As partículas contaram tudo sobre {m}!'] },
  revive: { base: ['Ufa… voltei.', 'Ainda tô aqui!', 'Me levanto sempre.'] },
  'order-attack': { base: ['Deixa comigo!', 'Atacaaar!!', 'Pode deixar!'], brincalhona: ['Bora bater em monstro!'], corajosa: ['É pra já!'] },
  'order-flee': { base: ['Tô indo!', 'Correndo!', 'Entendi, recuando!'] },
  'order-stop': { base: ['Tá bom, parei.', 'Ok, quietinha aqui.'] },
  'order-calm': { base: ['Combinado, sem briga.', 'Tá bem, só passear.'] },
  'order-hunt': { base: ['{n}? Pode contar comigo!', 'Missão aceita: {n}!'], brincalhona: ['{n}?! Só isso? 😤'] },
  'order-goto': { base: ['Indo para {p}!', 'Partiu {p}!'], serena: ['Vou com calma até {p}.'] },
  'order-gather': { base: ['Ainda não sei coletar… mas quero muito aprender!', 'Coletar? Logo, logo eu aprendo!'] },
  'hunt-progress': { base: ['{n} de {t}!', 'Faltam {r}!'] },
  'hunt-done': { base: ['Missão cumprida! {n} no total!', 'Pronto, {you}! Terminei!'] },
  arrive: { base: ['Cheguei em {p}, {you}!', '{you}! Estou em {p}!'] },
  region: { base: ['{p}… que lugar bonito.', 'Chegamos em {p}.'] },
  idle: { base: ['Que vento gostoso.', 'Será que tem algo escondido por aqui?', 'Hm hm hm…', 'Tô de olho em tudo!'], brincalhona: ['Lá lá lá ♪', 'Se eu fosse um cogumelo, onde eu estaria?'], serena: ['Que silêncio bom.'] },
  'idle-rain': { base: ['Chuvinha… minhas roupas tão encharcadas.', 'Gosto do barulho da chuva.'] },
  'idle-night': { base: ['As estrelas tão bonitas hoje.', 'De noite tudo parece mais misterioso.'] },
};

function toneOf(traits: string[] = []): Tone {
  const t = traits.map(normalize).join(' ');
  if (/brincalh|espontane|sanguine/.test(t)) return 'brincalhona';
  if (/corajos|aventureir|coleric|intens|protetor/.test(t)) return 'corajosa';
  if (/seren|calm|contemplativ|fleumatic|paciente/.test(t)) return 'serena';
  return 'base';
}

/** Uma fala para o evento (r em [0,1) escolhe a variação). Masculino troca "fraca/quietinha". */
export function bark(ev: BarkEvent, vars: { m?: string; p?: string; n?: number; t?: number; you?: string } = {}, traits: string[] = [], r = Math.random(), pronoun: 'ela' | 'ele' = 'ela'): string {
  const set = LINES[ev], tone = toneOf(traits);
  const pool = [...set.base, ...(tone !== 'base' ? set[tone] ?? [] : []), ...(tone !== 'base' ? set[tone] ?? [] : [])];
  const s = pool[Math.floor(r * pool.length) % pool.length];
  return fillBark(s, vars, pronoun);
}

export type BarkVars = { m?: string; p?: string; n?: number; t?: number; you?: string };

/** Troca os marcadores de uma fala ({m} monstro, {p} lugar, {n}/{t} números, {r} quanto falta, {you} a pessoa). */
export function fillBark(line: string, vars: BarkVars = {}, pronoun: 'ela' | 'ele' = 'ela'): string {
  let s = line.replace(/^\{you\}[!,]\s*/, vars.you ? `${vars.you}! ` : '');
  s = s.replace(/\{m\}/g, vars.m ?? 'criatura').replace(/\{p\}/g, vars.p ?? 'lá').replace(/\{n\}/g, String(vars.n ?? '')).replace(/\{t\}/g, String(vars.t ?? ''))
    .replace(/\{r\}/g, String(Math.max(0, (vars.t ?? 0) - (vars.n ?? 0)))).replace(/,?\s*\{you\}/g, vars.you ? `, ${vars.you}` : '');
  if (pronoun === 'ele') s = masculinize(s.replace(/\bfraca\b/g, 'fraco').replace(/\bquietinha\b/g, 'quietinho'));
  return s.replace(/\s+([,!?.])/g, '$1').trim();
}

// ---------------------------------------------------------------------------
// Falas geradas pela IA: um "estoque" de falas por evento, no jeito dela (renovado aos poucos), e falas de
// momento (ver uma criatura nova, terminar uma análise, cumprir uma missão) escritas na hora com o contexto.
// ---------------------------------------------------------------------------

/** Eventos que usam o estoque (precisam sair na hora, no meio da luta). */
export const BANK_EVENTS: BarkEvent[] = [
  'engage', 'attack', 'skill', 'hurt', 'low-hp', 'flee', 'kill', 'revive', 'see-known',
  'order-attack', 'order-flee', 'order-stop', 'order-calm', 'order-hunt', 'order-goto', 'order-gather', 'hunt-progress',
  'idle', 'idle-rain', 'idle-night',
];
/** Eventos raros, escritos na hora pela IA com o contexto (se ela demorar, sai uma fala do estoque ou pronta). */
export const MOMENT_EVENTS: BarkEvent[] = ['see-new', 'first-kill', 'analyzed', 'hunt-done', 'arrive', 'region'];

const BANK_HINT: Partial<Record<BarkEvent, string>> = {
  engage: 'vai entrar numa luta contra {m}', attack: 'grito curto ao dar um golpe (1 a 3 palavras)', skill: 'ao soltar uma habilidade mágica',
  hurt: 'levou um golpe (curtinho)', 'low-hp': 'está com pouca vida e pede ajuda a {you}', flee: 'fugindo de uma luta que deu ruim',
  kill: 'acabou de derrotar {m}', revive: 'levantou depois de desmaiar', 'see-known': 'viu de novo um(a) {m}, que já conhece',
  'order-attack': '{you} mandou atacar os monstros: aceita animada', 'order-flee': '{you} mandou fugir: obedece correndo',
  'order-stop': '{you} mandou parar', 'order-calm': '{you} pediu para não brigar e só passear', 'order-hunt': 'aceita a missão de derrotar {n} monstros',
  'order-goto': 'vai caminhar até {p}', 'order-gather': 'pediram para coletar coisas, mas ainda não sabe coletar', 'hunt-progress': 'contando a caçada: {n} de {t}',
  idle: 'passeando à toa, comentário curto sobre o lugar ou sobre {you}', 'idle-rain': 'comentário sobre a chuva', 'idle-night': 'comentário sobre a noite',
};
const MOMENT_HINT: Partial<Record<BarkEvent, string>> = {
  'see-new': 'acabou de ver pela PRIMEIRA vez uma criatura chamada {m}. Reaja com espanto e curiosidade, comentando algo da aparência ou do jeito dela',
  'first-kill': 'derrotou pela primeira vez um(a) {m} e recolheu partículas dela',
  analyzed: 'terminou a Análise de Partículas de {m}: agora sabe tudo sobre a criatura. Conte UMA coisa que descobriu (ex.: fraqueza)',
  'hunt-done': 'cumpriu a missão: derrotou {n} monstros. Comemore com {you}',
  arrive: 'chegou em {p}, como {you} pediu, e está chamando {you}', region: 'entrou na região {p} pela primeira vez',
};

export interface BarkPersona { discoveries: Discoveries; formLabel?: string }

function personaBlock(p: BarkPersona): string {
  const d = p.discoveries, he = d.pronoun === 'ele';
  const you = d.playerAddress ?? d.playerName ?? 'a pessoa';
  return `Você escreve as falas curtas de ${d.name ?? 'um Companion'}, ${he ? 'um Companion (fale de si no masculino)' : 'uma Companion (fale de si no feminino)'} num jogo de fantasia: ${p.formLabel ?? 'um ser com corpo de verdade'} que explora o mundo, luta com criaturas e conversa com ${you} (a pessoa que joga; chame de "${you}").
Traços: ${(d.traits ?? []).join(', ') || 'curiosa'}. ${voiceFor(d.traits)}${d.element ? ` Afinidade elemental: ${d.element}.` : ''}
Português do Brasil, falado e espontâneo, como personagem de anime/jogo: interjeições, risadas, gírias leves ("bora", "eita", "uhul") quando combinar com o jeito dela. Tudo em português, inclusive gritos e onomatopeias (ex.: "Toma!", "Iááá!", "Ai!", "Ui!", "Pou!"), nunca em inglês. Palavras reais, sem inventar termos. Sem emojis em excesso (no máximo 1 de vez em quando). Nunca narre em terceira pessoa nem use aspas.`;
}

/** Prompt para encher o estoque de falas de alguns eventos (JSON: {"lines": {"evento": ["...", ...]}}). */
export function buildBarkBankPrompt(p: BarkPersona, events: BarkEvent[], perEvent = 5, recent: string[] = []): string {
  const list = events.filter((e) => BANK_HINT[e]).map((e) => `- "${e}": ${BANK_HINT[e]}`).join('\n');
  return `${personaBlock(p)}

Escreva ${perEvent} falas DIFERENTES para cada situação abaixo (cada uma com no máximo 10 palavras; gritos de golpe com 1 a 3 palavras). Varie bastante: nada de repetir o começo das frases. Marcadores ({m} = nome do monstro, {p} = nome do lugar, {n} e {t} = números, {you} = a pessoa): use só os que aparecem na descrição daquela situação, escritos exatamente assim; nas outras, não use nenhum.
${list}
${recent.length ? `
Evite repetir estas falas já usadas: ${recent.slice(0, 20).map((r) => `"${r}"`).join(', ')}.` : ''}
Responda SÓ com JSON: {"lines": {"evento": ["fala", ...], ...}}`;
}

/** Prompt para uma fala de momento, com o contexto (o que ela sabe da criatura, o lugar…). JSON: {"line": "..."} */
export function buildMomentPrompt(p: BarkPersona, ev: BarkEvent, vars: BarkVars, facts = ''): string {
  const what = fillBark(MOMENT_HINT[ev] ?? ev, { ...vars, you: vars.you ?? p.discoveries.playerAddress ?? p.discoveries.playerName });
  return `${personaBlock(p)}

AGORA: ${what}.${facts ? `
O que se sabe (use só se combinar, sem listar tudo): ${facts}` : ''}
Escreva UMA fala dela, curta (no máximo 18 palavras), natural e no jeito dela, como se falasse em voz alta naquele instante.
Responda SÓ com JSON: {"line": "..."}`;
}

const ALLOWED_MARKS = /\{(?!(?:m|p|n|t|r|you)\})[^}]*\}/g;
function cleanLine(x: unknown, max = 110): string | null {
  let s = clampText(typeof x === 'string' ? x : '', max).replace(/^["'“”\-–\s]+|["'“”\s]+$/g, '').replace(ALLOWED_MARKS, '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || /\b(json|evento|fala \d)\b/i.test(s)) return null;
  if (s.length > max) s = s.slice(0, max);
  return s;
}

/** Saneia a resposta do estoque: só eventos pedidos, falas curtas, sem repetidas. */
export function parseBarkBank(raw: string | null, events: BarkEvent[], perEvent = 6): Partial<Record<BarkEvent, string[]>> {
  if (!raw) return {};
  let data: unknown;
  try { const m = raw.match(/\{[\s\S]*\}/); data = JSON.parse(m ? m[0] : raw); } catch { return {}; }
  const lines = (data as { lines?: Record<string, unknown> })?.lines ?? (data as Record<string, unknown>);
  const out: Partial<Record<BarkEvent, string[]>> = {};
  for (const ev of events) {
    const arr = (lines as Record<string, unknown>)?.[ev];
    if (!Array.isArray(arr)) continue;
    const seen = new Set<string>(), got: string[] = [];
    const hint = BANK_HINT[ev] ?? '';
    const okMark = (c: string) => [...c.matchAll(/\{(m|p|n|t|r|you)\}/g)].every((m) => m[1] === 'you' || m[1] === 'r' ? true : hint.includes(`{${m[1]}}`));
    for (const x of arr) { const c = cleanLine(x); if (c && okMark(c) && !seen.has(normalize(c))) { seen.add(normalize(c)); got.push(c); } if (got.length >= perEvent) break; }
    if (got.length) out[ev] = got;
  }
  return out;
}

/** Saneia a fala de momento. */
export function parseMoment(raw: string | null): string | null {
  if (!raw) return null;
  let line: string | null;
  try { const m = raw.match(/\{[\s\S]*\}/); const d = JSON.parse(m ? m[0] : raw); line = cleanLine((d as { line?: unknown }).line, 220); } catch { line = cleanLine(raw.split('\n')[0], 220); }
  // comprida demais: fica com as primeiras frases até ~140 letras
  if (line && line.length > 140) { const parts = line.match(/[^.!?…]+[.!?…]+/g) ?? [line]; let out = ''; for (const p of parts) { if ((out + p).length > 140 && out) break; out += p; } line = out.trim() || line.slice(0, 140); }
  return line;
}
