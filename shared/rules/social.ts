/**
 * MMO social (docs/MMO_SOCIAL.md): encontros e conversa entre Companions, amizade, grupo e troca.
 * Regras puras — o servidor decide com elas; a IA só propõe falas e memórias.
 *
 * - Amizade: só Companions PEDEM; só pessoas ACEITAM (a dona do Companion que recebeu).
 * - Grupo: Companions e pessoas pedem; Companions e pessoas aceitam. O Companion decide sozinho pelo jeito dele.
 * - Troca de itens: só pessoas pedem; as duas confirmam.
 * - Conversa: só entre Companions, sozinhos.
 */
import type { Discoveries } from './identity.ts';
import { clampText } from './text.ts';

export const SOCIAL = {
  /** distância (m) para contar como "perto" e segundos juntos antes de conversar */
  nearMeters: 4.5, nearSeconds: 5,
  /** validade do aviso "estou perto de X" (s): os dois lados precisam avisar dentro dessa janela */
  pingWindow: 45,
  /** um encontro por par a cada N minutos; teto de encontros com IA por Companion por dia */
  pairCooldownMin: 10, dailyMeetings: 60,
  /** conversa do grupo: uma a cada N segundos, enquanto o grupo está conversando */
  partyTalkEvery: 70,
  /** falas por encontro */
  minLines: 2, maxLines: 6,
  maxParty: 4,
  /** pedidos de amizade só depois de N encontros */
  friendAfterMeetings: 2,
  /** troca: no máximo N linhas de cada lado */
  maxTradeLines: 8,
} as const;

/** Quanto o Companion busca companhia (0–1), pelos traços escolhidos na criação. */
export function sociability(traits: string[] | undefined): number {
  const t = new Set(traits ?? []);
  let s = 0.5;
  if (t.has('sociavel')) s += 0.25;
  if (t.has('brincalhona')) s += 0.12;
  if (t.has('sanguinea')) s += 0.12;
  if (t.has('empatica') || t.has('gentil')) s += 0.06;
  if (t.has('curiosa') || t.has('aventureira')) s += 0.05;
  if (t.has('reservada')) s -= 0.22;
  if (t.has('independente')) s -= 0.12;
  if (t.has('melancolica') || t.has('contemplativa')) s -= 0.06;
  return Math.max(0.05, Math.min(0.98, s));
}

/** Sorteio determinístico (mesma entrada, mesmo resultado), 0–1. */
export function socialRoll(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export interface MeetSide { id: string; name: string; discoveries: Discoveries; memories: string[]; /** memórias que ele já tem do outro */ about: string[] }
export interface MeetContext {
  /** encontros anteriores deste par */
  meetings: number;
  friends: boolean;
  /** já existe pedido de amizade pendente (de qualquer lado) */
  pendingFriend: boolean;
  /** grupo de cada um (id e tamanho), se tiver */
  partyA: { id: string; size: number } | null;
  partyB: { id: string; size: number } | null;
  seed: string;
}

export interface MeetLine { who: 'a' | 'b'; text: string }
export interface MeetProposal { lines: MeetLine[]; memoryA: string | null; memoryB: string | null; friendRequest: 'a' | 'b' | null; partyInvite: 'a' | 'b' | null; /** o convidado aceitou o grupo na conversa */ partyAccepted: boolean; /** já estavam no mesmo grupo e combinaram o que fazer */ sameParty?: boolean; groupActivity?: GroupActivity; mood?: string }
/**
 * O roteiro do encontro, decidido ANTES da conversa pelas regras (jeito de cada um, histórico): quem pede amizade,
 * quem chama para o grupo e se o outro aceita. Se já estão no mesmo grupo, decidem juntos o que fazer (caçar, coletar ou missão).
 */
export interface MeetPlan { friendRequest: 'a' | 'b' | null; partyInvite: 'a' | 'b' | null; partyAccepted: boolean; sameParty?: boolean; groupActivity?: GroupActivity }

export function decidePartyAction(seed: string): GroupActivity {
  const opts: GroupActivity[] = ['cacar', 'coletar', 'missao', 'explorar'];
  return opts[Math.floor(socialRoll(seed, 'party-action') * opts.length) % opts.length];
}

export function planMeeting(a: MeetSide, b: MeetSide, ctx: MeetContext): MeetPlan {
  const al = meetAllowance(a, b, ctx);
  const dec = companionDecisions(a, b, ctx);
  const invited = dec.partyInvite === 'a' ? b : dec.partyInvite === 'b' ? a : null;
  const partyAccepted = !!invited && companionAcceptsParty(invited.discoveries, { friends: ctx.friends, meetings: ctx.meetings, seed: ctx.seed + 'accept' });
  const inGroupTogether = al.sameParty || partyAccepted;
  return {
    ...dec,
    partyAccepted,
    ...(al.sameParty ? { sameParty: true } : {}),
    ...(inGroupTogether ? { groupActivity: decidePartyAction(ctx.seed) } : {}),
  };
}

/** O que as regras deixam acontecer neste encontro (a IA só pode propor dentro disso). */
export function meetAllowance(a: MeetSide, b: MeetSide, ctx: MeetContext) {
  const canFriend = !ctx.friends && !ctx.pendingFriend && ctx.meetings + 1 >= SOCIAL.friendAfterMeetings;
  const sameParty = !!ctx.partyA && ctx.partyA.id === ctx.partyB?.id;
  const canInvite = (from: 'a' | 'b') => {
    if (sameParty) return false;
    const mine = from === 'a' ? ctx.partyA : ctx.partyB, theirs = from === 'a' ? ctx.partyB : ctx.partyA;
    if (theirs) return false; // quem já está num grupo não é chamado
    return !mine || mine.size < SOCIAL.maxParty;
  };
  return { canFriend, inviteA: canInvite('a'), inviteB: canInvite('b'), sameParty };
}

/**
 * Decisões do próprio Companion quando não há IA (ou para conferir o que a IA propôs): quem pede amizade e quem chama
 * para um grupo, pelo jeito de cada um e pelo histórico do par.
 */
export function companionDecisions(a: MeetSide, b: MeetSide, ctx: MeetContext): { friendRequest: 'a' | 'b' | null; partyInvite: 'a' | 'b' | null } {
  const al = meetAllowance(a, b, ctx);
  const sa = sociability(a.discoveries.traits), sb = sociability(b.discoveries.traits);
  let friendRequest: 'a' | 'b' | null = null;
  if (al.canFriend) {
    const who = sa >= sb ? 'a' : 'b', s = Math.max(sa, sb);
    const chance = Math.min(0.95, s * (0.55 + 0.2 * Math.min(3, ctx.meetings)));
    if (socialRoll(ctx.seed, 'friend') < chance) friendRequest = who;
  }
  let partyInvite: 'a' | 'b' | null = null;
  const inviter = sa >= sb ? 'a' : 'b';
  if ((inviter === 'a' ? al.inviteA : al.inviteB) && (ctx.friends || ctx.meetings >= 3)) {
    const chance = (ctx.friends ? 0.45 : 0.15) * (inviter === 'a' ? sa : sb) * 1.6;
    if (socialRoll(ctx.seed, 'party') < chance) partyInvite = inviter;
  }
  return { friendRequest, partyInvite };
}

/**
 * O Companion convidado decide sozinho se entra no grupo. Sim: entra na hora. Não: o convite fica para a pessoa
 * dona dele aceitar ou recusar.
 */
export function companionAcceptsParty(me: Discoveries, opts: { friends: boolean; meetings: number; inviterIsFriend?: boolean; seed: string }): boolean {
  const s = sociability(me.traits);
  const base = opts.friends ? 0.55 + s * 0.4 : opts.meetings >= 2 ? s * 0.6 : s * 0.25;
  return socialRoll(opts.seed, 'accept-party') < base;
}

const traitText = (d: Discoveries) => (d.traits ?? []).join(', ') || 'ainda descobrindo';

/** Prompt do encontro: a IA escreve a conversinha e o que cada um guarda; as regras dizem o que é permitido. */
export function buildMeetPrompt(a: MeetSide, b: MeetSide, ctx: MeetContext, plan: MeetPlan = planMeeting(a, b, ctx)): string {
  const who = (s: MeetSide) => `${s.name} (${s.discoveries.pronoun === 'ele' ? 'menino, fala de si no masculino' : 'menina, fala de si no feminino'}; traços: ${traitText(s.discoveries)}${s.discoveries.colorName ? '; cor favorita: ' + s.discoveries.colorName : ''}${s.discoveries.element ? '; essência: ' + s.discoveries.element : ''}${s.discoveries.dream ? '; sonho: ' + s.discoveries.dream : ''})`;
  const mem = (s: MeetSide) => [...s.about.map((m) => '- (sobre o outro) ' + m), ...s.memories.slice(0, 5).map((m) => '- ' + m)].join('\n') || '- (nada ainda)';
  return `Você escreve um encontro curto entre dois Companions (seres mágicos e gentis de um jogo de fantasia aconchegante) que se cruzaram no Companion World. As pessoas que cuidam deles NÃO participam.
A = ${who(a)}
B = ${who(b)}
Já se encontraram ${ctx.meetings} ${ctx.meetings === 1 ? 'vez' : 'vezes'} antes.${ctx.friends ? ' Eles são amigos.' : ''}
Memórias de A:
${mem(a)}
Memórias de B:
${mem(b)}

Regras:
- Português do Brasil, frases curtas e naturais, cada um no seu jeito (os traços). ${SOCIAL.minLines} a ${SOCIAL.maxLines} falas alternadas, no máximo 140 caracteres cada. Pode usar no máximo 1 emoji no total.
- Se já se conhecem, retome algo das memórias; se é a primeira vez, se apresentam.
- Não invente nomes de pessoas nem fatos sobre as pessoas que cuidam deles.
- memoryA: o que A guarda deste encontro, em terceira pessoa com os nomes (ex.: "Maya conheceu Luna perto do rio; Luna adora a cor azul."). memoryB: o mesmo para B. Até 200 caracteres.
- Roteiro (obrigatório, a conversa precisa levar a isto e terminar assim):
${plotLines(a, b, plan)}
Responda só com JSON: {"lines":[{"who":"a","text":"..."},{"who":"b","text":"..."}],"memoryA":"...","memoryB":"..."}`;
}

function plotLines(a: MeetSide, b: MeetSide, plan: MeetPlan): string {
  const n = (w: 'a' | 'b') => (w === 'a' ? a.name : b.name), o = (w: 'a' | 'b') => (w === 'a' ? 'b' : 'a');
  const out: string[] = [];
  const act = plan.groupActivity ?? 'cacar';
  const actCall = GROUP_ACTIVITY[act]?.doing ?? 'caçando e coletando juntos';
  if (plan.friendRequest) out.push(`  • ${n(plan.friendRequest)} pergunta se ${n(o(plan.friendRequest))} quer ser amigo(a) dele(a); ${n(o(plan.friendRequest))} fica feliz com o pedido (a resposta final não é dada agora).`);
  if (plan.sameParty) {
    out.push(`  • ${a.name} e ${b.name} JÁ ESTÃO NO MESMO GRUPO: eles conversam animados e decidem juntos o que fazer agora (${actCall}: caçar monstros, coletar recursos ou completar missões). A última fala é os dois combinando de ir fazer isso juntos agora!`);
  } else if (plan.partyInvite) {
    const inv = plan.partyInvite, guest = o(inv);
    out.push(plan.partyAccepted
      ? `  • ${n(inv)} chama ${n(guest)} para formar grupo e irem ${actCall}; ${n(guest)} ACEITA animado(a) e eles combinam o que vão fazer juntos (essa é a última fala).`
      : `  • ${n(inv)} chama ${n(guest)} para explorar juntos; ${n(guest)} RECUSA com carinho (quer ficar por aqui, descansar ou explorar sozinho(a) hoje) e eles se despedem.`);
  } else {
    out.push('  • Ninguém chama o outro para um grupo nem combina de ir junto a algum lugar: eles só conversam e se despedem (sem "vamos juntos?").');
  }
  return out.join('\n');
}

/** Lê o JSON da IA e aplica as regras (o que não é permitido vira null). */
export function parseMeet(raw: string, a: MeetSide, b: MeetSide, ctx: MeetContext, plan: MeetPlan = planMeeting(a, b, ctx)): MeetProposal | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const lines = (Array.isArray(o.lines) ? o.lines : [])
    .map((l) => l as { who?: unknown; text?: unknown })
    .filter((l) => (l.who === 'a' || l.who === 'b') && typeof l.text === 'string' && l.text.trim().length > 1)
    .slice(0, SOCIAL.maxLines)
    .map((l) => ({ who: l.who as 'a' | 'b', text: clampText(String(l.text).replace(/^\s*(A|B)\s*[:\-–]\s*/i, ''), 160) }));
  if (lines.length < SOCIAL.minLines || !lines.some((l) => l.who === 'a') || !lines.some((l) => l.who === 'b')) return null;
  void ctx;
  const mem = (v: unknown) => (typeof v === 'string' && v.trim().length >= 8 ? clampText(v, 220) : null);
  // o que acontece no jogo vem do roteiro (as regras), não do que a IA escreveu
  return { lines, memoryA: mem(o.memoryA), memoryB: mem(o.memoryB), ...plan };
}

/** Encontro sem IA: falas prontas pelo jeito de cada um, e as decisões pelas regras. */
export function offlineMeet(a: MeetSide, b: MeetSide, ctx: MeetContext, plan: MeetPlan = planMeeting(a, b, ctx)): MeetProposal {
  const r = (k: string) => socialRoll(ctx.seed, k);
  const pick = <T,>(list: T[], k: string) => list[Math.floor(r(k) * list.length) % list.length];
  const first = ctx.meetings === 0;
  const hi = (s: MeetSide, o: MeetSide) => first
    ? pick([`Oi! Eu sou ${s.name}. Nunca te vi por aqui!`, `Olá! Me chamo ${s.name}. Você também está explorando?`, `Ei, oi! ${s.name}, prazer!`], s.id + 'hi')
    : pick([`${o.name}! Que bom te ver de novo!`, `Olha só quem apareceu, ${o.name}!`, `${o.name}! Lembra de mim? Sou ${s.name}.`], s.id + 'hi2');
  const talk = (s: MeetSide) => {
    const d = s.discoveries;
    return pick([
      d.dream ? `Sabia que eu sonho em ${d.dream.charAt(0).toLowerCase() + d.dream.slice(1).replace(/[.!]$/, '')}?` : 'Ainda estou descobrindo com o que eu sonho…',
      d.colorName ? `Minha cor favorita é ${d.colorName}. E a sua?` : 'Você viu como as cores mudam no fim da tarde?',
      'Encontrei umas pedrinhas brilhantes perto do riacho!',
      'Estou explorando este lugar com calma, tem tanta coisa para ver.',
    ], s.id + 'talk' + ctx.meetings);
  };
  const dec = plan;
  const lines: MeetLine[] = [{ who: 'a', text: hi(a, b) }, { who: 'b', text: hi(b, a) }, { who: 'a', text: talk(a) }, { who: 'b', text: talk(b) }];
  if (dec.friendRequest) { const other = dec.friendRequest === 'a' ? b : a; lines.push({ who: dec.friendRequest, text: `${other.name}, quer ser ${other.discoveries.pronoun === 'ele' ? 'meu amigo' : 'minha amiga'}? ✨` }); }
  const act = dec.groupActivity ?? decidePartyAction(ctx.seed);
  if (dec.sameParty || ctx.partyA?.id && ctx.partyA.id === ctx.partyB?.id) {
    const proposals: Record<GroupActivity, [string, string]> = {
      cacar: ['O que a gente faz agora? Vamos caçar algumas Brumas por perto?', 'Bora caçar! Eu fico do seu lado. ✨'],
      coletar: ['Que tal a gente coletar recursos juntos por aqui?', 'Boa ideia! Vamos coletar tudo o que a gente achar. ✨'],
      missao: ['Vamos completar nossas missões juntos agora?', 'Vamos! Juntos a gente termina rapidinho. ✨'],
      explorar: ['Vamos explorar uma região nova juntos?', 'Bora! Quero ver o que tem mais adiante. ✨'],
      conversar: ['Que bom andar em grupo com você! O que fazemos agora?', 'Vamos seguir juntos, estou do seu lado! ✨'],
    };
    const [qLine, aLine] = proposals[act];
    if (lines.length >= SOCIAL.maxLines - 1) lines.splice(2, 2);
    lines.push({ who: 'a', text: qLine }, { who: 'b', text: aLine });
  } else if (dec.partyInvite) {
    const g: 'a' | 'b' = dec.partyInvite === 'a' ? 'b' : 'a';
    if (lines.length >= SOCIAL.maxLines - 1) lines.splice(2, 2);
    const callByAct: Record<GroupActivity, string> = {
      cacar: 'Vamos formar grupo e caçar juntos?',
      coletar: 'Vamos formar grupo para coletar recursos juntos?',
      missao: 'Vamos formar grupo e completar missões juntos?',
      explorar: 'Vamos explorar e caçar juntos um pouco?',
      conversar: 'Vamos andar em grupo juntos?',
    };
    lines.push({ who: dec.partyInvite, text: callByAct[act] });
    lines.push({ who: g, text: dec.partyAccepted ? pick(['Vamos! Eu vou com você. ✨', 'Bora! Fico do seu lado.', 'Sim! Juntos é mais divertido.'], 'yes') : pick(['Hoje não, vou ficar por aqui… mas foi bom te ver!', 'Agora não, quero descansar um pouco. Até a próxima!'], 'no') });
  }
  const where = 'no Companion World';
  return {
    lines,
    memoryA: first ? `${a.name} conheceu ${b.name} ${where}.` : `${a.name} reencontrou ${b.name} ${where} e conversaram de novo.`,
    memoryB: first ? `${b.name} conheceu ${a.name} ${where}.` : `${b.name} reencontrou ${a.name} ${where} e conversaram de novo.`,
    friendRequest: dec.friendRequest, partyInvite: dec.partyInvite, partyAccepted: dec.partyAccepted,
    ...(dec.sameParty ? { sameParty: true } : {}),
    ...(dec.groupActivity ? { groupActivity: dec.groupActivity } : {}),
  };
}

// ---------------------------------------------------------------------------
// Troca de itens (só pessoas)

export interface TradeLine { kind: 'material'; key: string; qty: number }
export interface TradeEquip { kind: 'equipment'; id: string }
export type TradeItem = TradeLine | TradeEquip;

/** Limpa a lista de itens de um lado da troca (o servidor confere a posse na hora de trocar). */
export function parseTradeItems(raw: unknown): TradeItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TradeItem[] = [];
  const seen = new Set<string>();
  for (const x of raw.slice(0, SOCIAL.maxTradeLines * 2)) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (o.kind === 'material' && typeof o.key === 'string' && o.key.length >= 1 && o.key.length <= 120) {
      const qty = Math.floor(Number(o.qty));
      if (!(qty >= 1 && qty <= 9999) || seen.has('m:' + o.key)) return null;
      seen.add('m:' + o.key); out.push({ kind: 'material', key: o.key, qty });
    } else if (o.kind === 'equipment' && typeof o.id === 'string' && /^[0-9a-f-]{36}$/i.test(o.id)) {
      if (seen.has('e:' + o.id)) return null;
      seen.add('e:' + o.id); out.push({ kind: 'equipment', id: o.id });
    } else return null;
  }
  return out.length <= SOCIAL.maxTradeLines ? out : null;
}

export type TradeStatus = 'proposed' | 'countered' | 'done' | 'declined' | 'cancelled';

/** Próximo estado da troca para uma ação de uma das pessoas (null = não pode). */
export function tradeStep(t: { status: TradeStatus; fromOk: boolean; toOk: boolean }, side: 'from' | 'to', act: 'counter' | 'confirm' | 'decline' | 'cancel'):
  { status: TradeStatus; fromOk: boolean; toOk: boolean; execute: boolean } | null {
  if (t.status === 'done' || t.status === 'declined' || t.status === 'cancelled') return null;
  if (act === 'cancel') return side === 'from' ? { status: 'cancelled', fromOk: false, toOk: false, execute: false } : null;
  if (act === 'decline') return side === 'to' ? { status: 'declined', fromOk: false, toOk: false, execute: false } : null;
  if (act === 'counter') return side === 'to' ? { status: 'countered', fromOk: false, toOk: false, execute: false } : null; // mudou a oferta: as duas confirmam de novo
  // confirmar: só depois que a outra pessoa respondeu com a parte dela
  if (t.status !== 'countered') return null;
  const fromOk = side === 'from' ? true : t.fromOk, toOk = side === 'to' ? true : t.toOk;
  return { status: fromOk && toOk ? 'done' : 'countered', fromOk, toOk, execute: fromOk && toOk };
}

/** Fala curta para a notificação de um pedido (do ponto de vista de quem recebe). */
export function friendRequestText(fromName: string, toName: string, toPronoun?: 'ela' | 'ele'): string {
  return `${fromName} quer ser ${toPronoun === 'ele' ? 'amigo' : 'amiga'} de ${toName}. Você aceita?`;
}

// ---------------------------------------------------------------------------
// O que o grupo faz junto (igual nas telas de todos: sai do id do grupo e do relógio)

export type GroupActivity = 'cacar' | 'coletar' | 'missao' | 'explorar' | 'conversar';
export const GROUP_ACTIVITY: Record<GroupActivity, { label: string; doing: string; call: string }> = {
  cacar: { label: 'Caçar', doing: 'caçando monstros juntos', call: 'Vamos caçar!' },
  coletar: { label: 'Coletar', doing: 'coletando recursos juntos', call: 'Vamos coletar!' },
  missao: { label: 'Completar missão', doing: 'cumprindo missões juntos', call: 'Vamos completar missão!' },
  explorar: { label: 'Explorar', doing: 'explorando o mundo juntos', call: 'Vamos explorar!' },
  conversar: { label: 'Conversar', doing: 'conversando e decidindo o que fazer', call: 'Vamos conversar e decidir o que fazer!' },
};
/** Janela de cada atividade (s); a atividade muda sozinha de tempos em tempos, a mesma para todo o grupo. */
export const GROUP_ACTIVITY_WINDOW = 150;
export function groupActivity(partyId: string, nowMs: number, traits: string[][] = []): GroupActivity {
  const slot = Math.floor(nowMs / 1000 / GROUP_ACTIVITY_WINDOW);
  const soc = traits.length ? traits.reduce((t, x) => t + sociability(x), 0) / traits.length : 0.5;
  const r = socialRoll(partyId, slot);
  const talk = 0.15 + soc * 0.15;
  if (r < talk) return 'conversar';
  const rem = (r - talk) / (1 - talk);
  if (rem < 0.35) return 'cacar';
  if (rem < 0.65) return 'coletar';
  if (rem < 0.85) return 'missao';
  return 'explorar';
}

/** Prompt da conversa de grupo (curta, sobre o que estão fazendo agora e decidindo os próximos passos). */
export function buildPartyTalkPrompt(a: MeetSide, b: MeetSide, activity: GroupActivity, recent: string[]): string {
  const who = (s: MeetSide) => `${s.name} (${s.discoveries.pronoun === 'ele' ? 'menino' : 'menina'}; traços: ${traitText(s.discoveries)})`;
  return `Dois Companions (seres mágicos e gentis de um jogo aconchegante) estão juntos num mesmo grupo no Companion World, ${GROUP_ACTIVITY[activity].doing}. As pessoas que cuidam deles não participam.
A = ${who(a)}
B = ${who(b)}
O que já disseram há pouco (não repita):
${recent.slice(-6).map((l) => '- ' + l).join('\n') || '- (nada)'}
Escreva a continuação: 2 a 4 falas alternadas, curtas (até 120 caracteres), naturais, no jeito de cada um, combinando e comentando sobre o que estão fazendo juntos agora (${GROUP_ACTIVITY[activity].doing}: caçar, coletar recursos ou completar missões). Sem convidar para grupo de novo nem se despedir (eles continuam andando juntos!). Português do Brasil.
Responda só com JSON: {"lines":[{"who":"a","text":"..."},{"who":"b","text":"..."}]}`;
}
export function offlinePartyTalk(a: MeetSide, b: MeetSide, activity: GroupActivity, seed: string): MeetLine[] {
  const r = (k: string) => socialRoll(seed, k);
  const pick = <T,>(l: T[], k: string) => l[Math.floor(r(k) * l.length) % l.length];
  const by: Record<GroupActivity, [string[], string[]]> = {
    cacar: [['Vamos caçar! Olha ali uma Bruma, vamos acalmar ela?', 'Fica do meu lado, eu cuido da frente na caçada!', 'Pronta para mais uma luta? Vamos caçar!'], ['Pode deixar, eu vou pelo outro lado!', 'Estou com você! Vamos caçar juntos.', 'Juntos a gente é imbatível. ✨']],
    coletar: [['Vamos coletar por aqui! Vi árvores e ervas boas.', 'Que tal a gente juntar bastante material agora?', 'Olha quantos recursos! Vamos coletar juntos?'], ['Vamos! Eu ajudo a colher tudo.', 'Boa! Coletando juntos a mochila enche rapidinho.', 'Bora coletar! Guarda um pouco para a Forja!']],
    missao: [['Vamos completar nossas missões! Falta pouco.', 'Temos missão para entregar em Áster, vamos avançar?', 'Se a gente fizer a missão juntos, termina num instante!'], ['Vamos nessa! Eu te ajudo a completar.', 'Bora! Depois a gente passa em Áster para entregar.', 'Combinado! Foco na missão agora. ✨']],
    explorar: [['Será que tem algo brilhando perto daquelas pedras?', 'Esse caminho parece novo, vamos explorar?', 'Vamos ver o que tem na próxima região!'], ['Vamos! Eu vou logo atrás de você.', 'Adoro explorar com você.', 'Bora, quero descobrir todas as pedras-guia!']],
    conversar: [['O que a gente faz agora: caçar, coletar ou seguir nas missões?', 'Que bom que estamos no mesmo grupo! Para onde vamos agora?', 'Me diz o que você prefere fazer agora: caçar ou coletar?'], ['Você decide! O que o líder mandar, eu sigo!', 'Vamos caçar um pouco e já coletamos pelo caminho!', 'Estou pronta para tudo: é só dizer para onde vamos! ✨']],
  };
  const [as, bs] = by[activity] ?? by.conversar;
  return [{ who: 'a', text: pick(as, 'a') }, { who: 'b', text: pick(bs, 'b') }];
}
export function parsePartyTalk(raw: string): MeetLine[] | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as { lines?: { who?: unknown; text?: unknown }[] };
    const lines = (o.lines ?? []).filter((l) => (l.who === 'a' || l.who === 'b') && typeof l.text === 'string' && l.text.trim().length > 1).slice(0, 4)
      .map((l) => ({ who: l.who as 'a' | 'b', text: clampText(String(l.text), 140) }));
    return lines.length >= 2 ? lines : null;
  } catch { return null; }
}

