/**
 * Falas curtas da Companion durante o jogo (sem IA, na hora): ao ver uma criatura, ao lutar, ao derrotar, com pouca
 * vida, ao receber uma ordem, ao chegar num lugar, passeando. O tom muda com os traços dela (brincalhona, corajosa,
 * serena…). `{m}` = monstro, `{p}` = lugar, `{n}` = número, `{you}` = a pessoa.
 */
import { normalize } from './text.ts';

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
  let s = pool[Math.floor(r * pool.length) % pool.length];
  s = s.replace(/\{m\}/g, vars.m ?? 'criatura').replace(/\{p\}/g, vars.p ?? 'lá').replace(/\{n\}/g, String(vars.n ?? '')).replace(/\{t\}/g, String(vars.t ?? ''))
    .replace(/\{r\}/g, String(Math.max(0, (vars.t ?? 0) - (vars.n ?? 0)))).replace(/,?\s*\{you\}/g, vars.you ? `, ${vars.you}` : '').replace(/^\{you\}!\s*/, vars.you ? `${vars.you}! ` : '');
  if (pronoun === 'ele') s = s.replace(/\bfraca\b/g, 'fraco').replace(/\bquietinha\b/g, 'quietinho');
  return s.replace(/\s+([,!?.])/g, '$1').trim();
}
