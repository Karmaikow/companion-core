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
  pairCooldownMin: 10, dailyMeetings: 30,
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
export interface MeetProposal { lines: MeetLine[]; memoryA: string | null; memoryB: string | null; friendRequest: 'a' | 'b' | null; partyInvite: 'a' | 'b' | null; /** o convidado aceitou o grupo na conversa */ partyAccepted: boolean; mood?: string }
/**
 * O roteiro do encontro, decidido ANTES da conversa pelas regras (jeito de cada um, histórico): quem pede amizade,
 * quem chama para o grupo e se o outro aceita. A IA só escreve as falas seguindo o roteiro — assim o que eles dizem
 * e o que acontece no jogo batem (antes a IA escrevia "vamos!" e o sorteio do grupo podia dar "não").
 */
export interface MeetPlan { friendRequest: 'a' | 'b' | null; partyInvite: 'a' | 'b' | null; partyAccepted: boolean }

export function planMeeting(a: MeetSide, b: MeetSide, ctx: MeetContext): MeetPlan {
  const dec = companionDecisions(a, b, ctx);
  const invited = dec.partyInvite === 'a' ? b : dec.partyInvite === 'b' ? a : null;
  const partyAccepted = !!invited && companionAcceptsParty(invited.discoveries, { friends: ctx.friends, meetings: ctx.meetings, seed: ctx.seed + 'accept' });
  return { ...dec, partyAccepted };
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
  if (plan.friendRequest) out.push(`  • ${n(plan.friendRequest)} pergunta se ${n(o(plan.friendRequest))} quer ser amigo(a) dele(a); ${n(o(plan.friendRequest))} fica feliz com o pedido (a resposta final não é dada agora).`);
  if (plan.partyInvite) {
    const inv = plan.partyInvite, guest = o(inv);
    out.push(plan.partyAccepted
      ? `  • ${n(inv)} chama ${n(guest)} para explorar e caçar juntos agora, num grupo; ${n(guest)} ACEITA animado(a) e eles combinam de ir juntos (essa é a última fala).`
      : `  • ${n(inv)} chama ${n(guest)} para explorar juntos; ${n(guest)} RECUSA com carinho (quer ficar por aqui, descansar ou explorar sozinho(a) hoje) e eles se despedem.`);
  }
  if (!plan.partyInvite) out.push('  • Ninguém chama o outro para um grupo nem combina de ir junto a algum lugar: eles só conversam e se despedem (sem "vamos juntos?").');
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
  if (dec.partyInvite) {
    const g: 'a' | 'b' = dec.partyInvite === 'a' ? 'b' : 'a';
    if (lines.length >= SOCIAL.maxLines - 1) lines.splice(2, 2);
    lines.push({ who: dec.partyInvite, text: 'Vamos explorar e caçar juntos um pouco?' });
    lines.push({ who: g, text: dec.partyAccepted ? pick(['Vamos! Eu vou com você. ✨', 'Bora! Fico do seu lado.', 'Sim! Juntos é mais divertido.'], 'yes') : pick(['Hoje não, vou ficar por aqui… mas foi bom te ver!', 'Agora não, quero descansar um pouco. Até a próxima!'], 'no') });
  }
  const where = 'no Companion World';
  return {
    lines,
    memoryA: first ? `${a.name} conheceu ${b.name} ${where}.` : `${a.name} reencontrou ${b.name} ${where} e conversaram de novo.`,
    memoryB: first ? `${b.name} conheceu ${a.name} ${where}.` : `${b.name} reencontrou ${a.name} ${where} e conversaram de novo.`,
    friendRequest: dec.friendRequest, partyInvite: dec.partyInvite, partyAccepted: dec.partyAccepted,
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
