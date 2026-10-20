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
    curiosity: 'Você sonha com um corpo. Imagine que criatura poderia ser (pássaro, felino, serpente, touro, algo místico…).' },
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
      const name = value.replace(/^["'“]|["'”]$/g, '').trim();
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
      const address = value.replace(/^["'“]|["'”]$/g, '').trim();
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
