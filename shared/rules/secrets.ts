/**
 * Quests secretas: não aparecem no livro de quests. São descobertas por acaso,
 * a partir de sinais determinísticos (nunca da opinião do modelo), e rendem
 * XP extra, um "impulso" (próximas mensagens valem o dobro) e um item raro.
 */
import { normalize } from './text.ts';

export type SecretKey = 'lua' | 'chef' | 'contador' | 'rebatizado' | 'sonhador' | 'gratidao' | 'curioso';

export interface SecretDef {
  key: SecretKey;
  title: string;
  /** Mostrado só depois de conquistada. */
  story: string;
  item: { item: string; label: string; description: string };
}

export const SECRETS: SecretDef[] = [
  { key: 'lua', title: 'Conversa sob a lua', story: 'Vocês conversaram na madrugada do Refúgio.',
    item: { item: 'lanterna_lunar', label: 'Lanterna Lunar', description: 'Guarda um pedacinho da madrugada em que vocês conversaram.' } },
  { key: 'chef', title: 'Mãos de luz', story: 'A primeira receita foi anotada no livro.',
    item: { item: 'colher_de_estrela', label: 'Colher de Estrela', description: 'Mexe qualquer panela com um brilho de poeira estelar.' } },
  { key: 'contador', title: 'Contador de histórias', story: 'Você contou uma história longa e cheia de detalhes.',
    item: { item: 'pena_de_tinta_viva', label: 'Pena de Tinta Viva', description: 'Escreve sozinha quando alguém conta algo importante.' } },
  { key: 'rebatizado', title: 'Dois nomes, uma luz', story: 'O Companion ganhou um novo nome.',
    item: { item: 'eco_do_nome', label: 'Eco do Nome Antigo', description: 'Um sininho que ainda soa o primeiro nome.' } },
  { key: 'sonhador', title: 'Primeira página', story: 'O Companion descansou e escreveu no diário pela primeira vez.',
    item: { item: 'marcador_de_sonhos', label: 'Marcador de Sonhos', description: 'Marca a página do diário onde tudo começou.' } },
  { key: 'gratidao', title: 'Coração agradecido', story: 'Você agradeceu de coração.',
    item: { item: 'flor_da_gratidao', label: 'Flor da Gratidão', description: 'Não murcha enquanto houver carinho no Refúgio.' } },
  { key: 'curioso', title: 'Mil perguntas', story: 'Você quis saber muito sobre o Companion.',
    item: { item: 'lupa_de_cristal', label: 'Lupa de Cristal', description: 'Mostra detalhes que ninguém mais repara.' } },
];

export const SECRET_BY_KEY = Object.fromEntries(SECRETS.map((s) => [s.key, s])) as Record<SecretKey, SecretDef>;

/** XP imediato por segredo e quantas mensagens seguintes valem dobrado. */
export const SECRET_XP = 25;
export const SECRET_BOOST_TURNS = 5;

/**
 * Bônus permanentes das quests secretas: cada uma dá +1 ponto de habilidade (árvore) e cada 10 conquistadas dão
 * +10 pontos de Constelação (atributos).
 */
export const SECRET_SKILL_POINT = 1, SECRET_CONSTELLATION_STEP = 10, SECRET_CONSTELLATION_POINTS = 10;
export function secretBonus(count: number): { skillPoints: number; constellationPoints: number; nextIn: number } {
  const n = Math.max(0, Math.floor(count) || 0);
  return { skillPoints: n * SECRET_SKILL_POINT, constellationPoints: Math.floor(n / SECRET_CONSTELLATION_STEP) * SECRET_CONSTELLATION_POINTS, nextIn: SECRET_CONSTELLATION_STEP - (n % SECRET_CONSTELLATION_STEP) };
}

export interface SecretContext {
  /** Mensagem do jogador neste turno (vazia em ações sem conversa). */
  message?: string;
  meaningful?: boolean;
  /** Fase do relógio do Refúgio. */
  phase?: string;
  renamed?: boolean;
  recipesTotal?: number;
  diaryTotal?: number;
  /** Quantas perguntas sobre o Companion o jogador já fez (incluindo esta). */
  questionsAboutCompanion?: number;
}

/** Pergunta dirigida ao Companion ("você gosta…?", "qual seu…?"). */
export function isQuestionAboutCompanion(message: string): boolean {
  const n = ' ' + normalize(message) + ' ';
  return message.includes('?') && /\s(voce|vc|tu|te|seu|sua|seus|suas)\s/.test(n);
}

/** Retorna os segredos conquistados agora (ainda não obtidos). */
export function evaluateSecrets(ctx: SecretContext, achieved: Set<string>): SecretKey[] {
  const out: SecretKey[] = [];
  const add = (k: SecretKey, ok: boolean) => { if (ok && !achieved.has(k)) out.push(k); };
  const msg = ctx.message ?? '';
  const n = normalize(msg);
  add('lua', !!msg && ctx.phase === 'madrugada');
  add('chef', (ctx.recipesTotal ?? 0) >= 1);
  add('contador', msg.trim().length >= 280 && !!ctx.meaningful);
  add('rebatizado', !!ctx.renamed);
  add('sonhador', (ctx.diaryTotal ?? 0) >= 1);
  add('gratidao', /\b(obrigad[oa]|muito obrigad|gratidao|agradeco)\b/.test(n) && n.length >= 14);
  add('curioso', (ctx.questionsAboutCompanion ?? 0) >= 5);
  return out;
}
