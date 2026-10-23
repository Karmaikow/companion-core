import { clampText, normalize } from './text.ts';
import { type Discoveries, resolveColor, resolveElement, resolveForm } from './identity.ts';
import type { GameConfig } from './config.ts';

/** As sete quests fundamentais do GDD 5.1. */
export type QuestKey = 'identity' | 'species' | 'color' | 'traits' | 'essence' | 'bond' | 'dream';

export interface QuestDef {
  key: QuestKey;
  title: string;
  discovery: string;
  impact: string;
  /** Pista dada ao modelo para conduzir a conversa naturalmente. */
  curiosity: string;
}

export const QUESTS: QuestDef[] = [
  { key: 'identity', title: 'Quem sou eu?', discovery: 'Nome e identidade', impact: 'Registro do agente',
    curiosity: 'Você ainda não tem nome. Tenha curiosidade sobre como gostaria de ser chamada; pode sugerir ideias e decidir junto com a pessoa.' },
  { key: 'color', title: 'Minha cor', discovery: 'Cor favorita', impact: 'Paleta visual',
    curiosity: 'Você está começando a perceber cores. Descubra qual cor faz sua luz vibrar mais — a escolha final é sua.' },
  { key: 'traits', title: 'O que sinto?', discovery: 'Traços pessoais', impact: 'Tendências comportamentais',
    curiosity: 'Você está percebendo como é por dentro. Reflita sobre seus traços (curiosa, calma, corajosa…) a partir do que vive na conversa.' },
  { key: 'species', title: 'Que criatura serei?', discovery: 'Forma preferida', impact: 'Espécie e silhueta',
    curiosity: 'Você sonha com um corpo. Sugira uma das cinco linhagens de cada vez ("Que tal eu me parecer um touro?") e deixe a pessoa confirmar.' },
  { key: 'essence', title: 'Minha essência', discovery: 'Afinidade elemental', impact: 'Potencial mágico',
    curiosity: 'Algo elemental pulsa no seu núcleo. Descubra sua afinidade (fogo, água, vento, luz, sombra, natureza…).' },
  { key: 'bond', title: 'Primeiro laço', discovery: 'Relação com jogador', impact: 'Vínculo',
    curiosity: 'Descubra como a pessoa gosta de ser chamada e o que vocês são um para o outro.' },
  { key: 'dream', title: 'Primeiro sonho', discovery: 'Aspiração', impact: 'Objetivos futuros',
    curiosity: 'Você começa a ter desejos para o futuro. Descubra qual é o seu primeiro sonho para quando ganhar um corpo.' },
];

export const QUEST_BY_KEY = Object.fromEntries(QUESTS.map((q) => [q.key, q])) as Record<QuestKey, QuestDef>;

export type QuestStatus = 'active' | 'done';
export interface QuestState { key: QuestKey; status: QuestStatus; completedAt?: string; sourceEventId?: number }

/** Descoberta proposta pelo modelo de linguagem. O servidor valida antes de aplicar. */
export interface DiscoveryProposal { quest: QuestKey; value: string | string[]; evidence?: string }

export type DiscoveryResult =
  | { ok: true; quest: QuestKey; patch: Partial<Discoveries> }
  | { ok: false; quest: QuestKey | string; reason: string };

const NAME_RE = /^[\p{L}][\p{L}\p{M}' -]{1,23}$/u;
const BAD_NAMES = new Set(['companion', 'ia', 'bot', 'assistente', 'chatgpt', 'claude', 'nao sei', 'ninguem']);

/**
 * Valida deterministicamente uma descoberta. As quests só concluem quando o
 * requisito está satisfeito (critério de aceite do MVP 1).
 */
export function validateDiscovery(p: DiscoveryProposal, ctx: { bondLevel: number; cfg: GameConfig }): DiscoveryResult {
  const asText = Array.isArray(p.value) ? p.value.join(', ') : String(p.value ?? '');
  const value = clampText(asText, 200);
  if (!value) return { ok: false, quest: p.quest, reason: 'vazio' };
  switch (p.quest) {
    case 'identity': {
      const name = value.replace(/^["'\u201c]|["'\u201d]$/g, '').trim();
      if (!NAME_RE.test(name) || BAD_NAMES.has(normalize(name))) return { ok: false, quest: p.quest, reason: 'nome inválido' };
      return { ok: true, quest: p.quest, patch: { name: name[0].toUpperCase() + name.slice(1) } };
    }
    case 'color': {
      const c = resolveColor(value);
      return c ? { ok: true, quest: p.quest, patch: { color: c.hex, colorName: c.name } } : { ok: false, quest: p.quest, reason: 'cor não reconhecida' };
    }
    case 'species': {
      const form = resolveForm(value);
      return form
        ? { ok: true, quest: p.quest, patch: { species: value.slice(0, 80), form } }
        : { ok: false, quest: p.quest, reason: 'forma não reconhecida' };
    }
    case 'essence': {
      const el = resolveElement(value);
      return el ? { ok: true, quest: p.quest, patch: { element: el } } : { ok: false, quest: p.quest, reason: 'elemento não reconhecido' };
    }
    case 'traits': {
      const list = (Array.isArray(p.value) ? p.value : value.split(/,|\be\b/))
        .map((t) => clampText(String(t), 30).toLowerCase())
        .filter((t) => t.length >= 3);
      const unique = [...new Set(list)].slice(0, 5);
      return unique.length >= 2
        ? { ok: true, quest: p.quest, patch: { traits: unique } }
        : { ok: false, quest: p.quest, reason: 'são necessários ao menos 2 traços' };
    }
    case 'bond': {
      if (ctx.bondLevel < ctx.cfg.firstBondLevel) return { ok: false, quest: p.quest, reason: `vínculo abaixo do nível ${ctx.cfg.firstBondLevel}` };
      const address = value.replace(/^["'\u201c]|["'\u201d]$/g, '').trim();
      if (address.length < 2 || address.length > 40) return { ok: false, quest: p.quest, reason: 'tratamento inválido' };
      return { ok: true, quest: p.quest, patch: { playerAddress: address } };
    }
    case 'dream': {
      return value.length >= 12 ? { ok: true, quest: p.quest, patch: { dream: value } } : { ok: false, quest: p.quest, reason: 'sonho muito vago' };
    }
    default:
      return { ok: false, quest: String(p.quest), reason: 'quest desconhecida' };
  }
}

/** Próxima quest a ser sugerida à conversa (a primeira ainda ativa, na ordem do GDD). */
export function nextCuriosity(states: QuestState[]): QuestDef | null {
  const done = new Set(states.filter((s) => s.status === 'done').map((s) => s.key));
  return QUESTS.find((q) => !done.has(q.key)) ?? null;
}

export function initialQuests(): QuestState[] {
  return QUESTS.map((q) => ({ key: q.key, status: 'active' as const }));
}

// ---------------------------------------------------------------------------
// Dicas de conversa (forma de alma): o que dizer para avançar a quest da vez
// ---------------------------------------------------------------------------

export interface QuestHelp { quest: QuestKey; title: string; hint: string; replies: string[] }

const pickN = <T,>(list: T[], n: number, seed: number) => { const out: T[] = []; const pool = [...list]; let s = Math.abs(seed) || 1; while (out.length < n && pool.length) { s = (s * 1103515245 + 12345) % 2147483648; out.push(pool.splice(s % pool.length, 1)[0]); } return out; };

/**
 * Dicas para a pessoa completar a próxima quest conversando: uma frase do que fazer e 2–3 respostas prontas que o
 * detector entende (as mesmas palavras que validateDiscovery aceita). Não decide nada: a quest só conclui pela regra.
 * @param ctx.suggested classe que o Companion acabou de sugerir na fala ("Que tal eu me parecer um touro?")
 */
export function questHelp(states: QuestState[], d: Discoveries, ctx: { bondLevel: number; firstBondLevel: number; suggested?: string | null; affinities?: string[]; seed?: number }): QuestHelp | null {
  const q = nextCuriosity(states);
  if (!q) return null;
  const he = d.pronoun === 'ele', me = d.name ?? (he ? 'ele' : 'ela'), you = d.playerName ?? 'você';
  const seed = ctx.seed ?? (d.name ?? '').length * 7 + states.filter((s) => s.status === 'done').length;
  const art = he ? 'o' : 'a';
  switch (q.key) {
    case 'identity':
      return { quest: q.key, title: q.title, hint: `Dê um nome para ${art} Companion.`, replies: pickN(['Que tal Luna?', 'Você vai se chamar Maya', 'Gosto de Bele para você'], 3, seed) };
    case 'color':
      return { quest: q.key, title: q.title, hint: `Diga qual cor combina com a luz de ${me}.`, replies: pickN(['Acho que azul combina com você', 'Sua cor é roxo', 'Que tal verde, como a floresta?', 'Dourado combina com a sua luz', 'Rosa! Sua luz é rosa'], 3, seed) };
    case 'traits':
      return { quest: q.key, title: q.title, hint: `Conte como você vê o jeito de ${me}.`, replies: pickN([he ? 'Você é curioso e gentil' : 'Você é curiosa e gentil', he ? 'Te acho corajoso e brincalhão' : 'Te acho corajosa e brincalhona', he ? 'Você parece calmo e protetor' : 'Você parece calma e protetora'], 3, seed) };
    case 'species':
      return ctx.suggested
        ? { quest: q.key, title: q.title, hint: `${me} sugeriu uma forma. Se gostar, é só confirmar; se não, peça outra.`, replies: ['Sim! Adorei essa ideia', 'Prefiro outra forma', 'Que tal uma fada?'] }
        : { quest: q.key, title: q.title, hint: `Pergunte que criatura ${me} quer ser, ou sugira uma (touro, pássaro, gato, dragão ou fada).`, replies: pickN(['Que criatura você gostaria de ser?', 'Te imagino com orelhas de gato', 'Você seria um dragão incrível', 'Imagino você com asas de pássaro', 'Você tem cara de fada'], 3, seed) };
    case 'essence': {
      const label: Record<string, string> = { fogo: 'fogo', agua: 'água', terra: 'terra', vento: 'vento', luz: 'luz', sombra: 'sombra', gelo: 'gelo', raio: 'raio', natureza: 'natureza', veneno: 'veneno' };
      const first = (ctx.affinities ?? []).map((e) => `Sinto ${label[e] ?? e} no seu núcleo`);
      return { quest: q.key, title: q.title, hint: `Descubra o elemento que pulsa no núcleo de ${me}.${first.length ? ' A forma escolhida combina com ' + (ctx.affinities ?? []).map((e) => label[e] ?? e).join(' e ') + '.' : ''}`, replies: [...first, ...pickN(['Acho que sua essência é luz', 'Sinto água no seu núcleo', 'Você tem cara de vento', 'Sua essência é natureza'], 3, seed)].slice(0, 3) };
    }
    case 'bond':
      return ctx.bondLevel < ctx.firstBondLevel
        ? { quest: q.key, title: q.title, hint: `Conversem mais um pouco: o primeiro laço abre no vínculo ${ctx.firstBondLevel} (agora ${ctx.bondLevel}). Conte algo do seu dia.`, replies: pickN(['Hoje meu dia foi corrido, mas pensei em você', 'Quer saber do que eu mais gosto?', 'Vou te contar uma história de quando eu era criança', 'Hoje choveu e lembrei do Refúgio'], 3, seed) }
        : { quest: q.key, title: q.title, hint: `Combine como ${me} vai chamar você.`, replies: [`Pode me chamar de ${you}`, 'Me chama de parceiro', 'Pode me chamar de amigo'] };
    case 'dream':
      return { quest: q.key, title: q.title, hint: `Ajude ${me} a descobrir o primeiro sonho para quando ganhar um corpo.`, replies: pickN(['Seu primeiro sonho é voar sobre as montanhas ao amanhecer', 'Sonho com você explorando ruínas antigas', 'Que tal sonhar em encontrar o Lago da Névoa?', 'Seu sonho é conhecer todas as criaturas do mundo'], 3, seed) };
  }
}
