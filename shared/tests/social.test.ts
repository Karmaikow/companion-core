import { describe, it, expect } from 'vitest';
import { sociability, companionDecisions, companionAcceptsParty, meetAllowance, parseMeet, offlineMeet, parseTradeItems, tradeStep, buildMeetPrompt, SOCIAL, type MeetSide, type MeetContext } from '../rules/social.ts';

const side = (id: string, name: string, traits: string[], pronoun: 'ela' | 'ele' = 'ela'): MeetSide => ({ id, name, discoveries: { name, traits, pronoun, colorName: 'azul' }, memories: [], about: [] });
const A = side('a1', 'Maya', ['sociavel', 'brincalhona', 'sanguinea']);
const B = side('b1', 'Luna', ['reservada', 'serena']);
const ctx = (o: Partial<MeetContext> = {}): MeetContext => ({ meetings: 0, friends: false, pendingFriend: false, partyA: null, partyB: null, seed: 's', ...o });

describe('MMO social', () => {
  it('sociabilidade segue os traços', () => {
    expect(sociability(A.discoveries.traits)).toBeGreaterThan(sociability(B.discoveries.traits));
  });
  it('amizade só depois do segundo encontro e nunca com pedido pendente ou já amigos', () => {
    expect(meetAllowance(A, B, ctx()).canFriend).toBe(false);
    expect(meetAllowance(A, B, ctx({ meetings: 1 })).canFriend).toBe(true);
    expect(meetAllowance(A, B, ctx({ meetings: 3, pendingFriend: true })).canFriend).toBe(false);
    expect(meetAllowance(A, B, ctx({ meetings: 3, friends: true })).canFriend).toBe(false);
  });
  it('o Companion mais sociável é quem pede amizade', () => {
    let asked = 0;
    for (let i = 0; i < 40; i++) { const d = companionDecisions(A, B, ctx({ meetings: 2, seed: 'x' + i })); if (d.friendRequest) { expect(d.friendRequest).toBe('a'); asked++; } }
    expect(asked).toBeGreaterThan(10);
  });
  it('grupo: não chama quem já tem grupo nem passa do tamanho máximo', () => {
    expect(meetAllowance(A, B, ctx({ partyB: { id: 'p', size: 2 } })).inviteA).toBe(false);
    expect(meetAllowance(A, B, ctx({ partyA: { id: 'p', size: SOCIAL.maxParty } })).inviteA).toBe(false);
    expect(meetAllowance(A, B, ctx({ partyA: { id: 'p', size: 2 } })).inviteA).toBe(true);
  });
  it('amigos sociáveis aceitam grupo com mais frequência', () => {
    const n = (friends: boolean, d = A.discoveries) => Array.from({ length: 200 }, (_, i) => companionAcceptsParty(d, { friends, meetings: 1, seed: 'k' + i })).filter(Boolean).length;
    expect(n(true)).toBeGreaterThan(n(false));
    expect(n(true, B.discoveries)).toBeLessThan(n(true));
  });
  it('a IA não consegue pedir amizade fora da regra', () => {
    const raw = JSON.stringify({ lines: [{ who: 'a', text: 'Oi!' }, { who: 'b', text: 'Olá!' }], memoryA: 'Maya conheceu Luna no rio.', memoryB: 'Luna conheceu Maya no rio.', friendRequest: 'a', partyInvite: 'b' });
    const p = parseMeet(raw, A, B, ctx({ partyA: { id: 'p', size: 1 } }))!;
    expect(p.friendRequest).toBeNull(); // primeiro encontro
    expect(p.partyInvite).toBeNull(); // A já tem grupo, B não pode chamar
    expect(p.lines).toHaveLength(2);
    expect(parseMeet('{"lines":[{"who":"a","text":"oi"}]}', A, B, ctx())).toBeNull();
  });
  it('encontro offline tem os dois falando e memória para os dois', () => {
    const p = offlineMeet(A, B, ctx());
    expect(p.lines.some((l) => l.who === 'a') && p.lines.some((l) => l.who === 'b')).toBe(true);
    expect(p.memoryA).toMatch(/Maya conheceu Luna/);
    expect(p.memoryB).toMatch(/Luna conheceu Maya/);
  });
  it('prompt diz o que é permitido', () => {
    expect(buildMeetPrompt(A, B, ctx())).toMatch(/friendRequest: sempre null/);
    expect(buildMeetPrompt(A, B, ctx({ meetings: 2 }))).toMatch(/"a" ou "b" se um deles pedir/);
  });
  it('itens da troca: limpa e recusa repetidos ou inválidos', () => {
    expect(parseTradeItems([{ kind: 'material', key: 'seiva', qty: 3 }, { kind: 'equipment', id: '11111111-1111-1111-1111-111111111111' }])).toHaveLength(2);
    expect(parseTradeItems([{ kind: 'material', key: 'seiva', qty: 0 }])).toBeNull();
    expect(parseTradeItems([{ kind: 'material', key: 'seiva', qty: 1 }, { kind: 'material', key: 'seiva', qty: 2 }])).toBeNull();
    expect(parseTradeItems([{ kind: 'gold', qty: 1 }])).toBeNull();
  });
  it('troca: só vale com as duas confirmações depois da resposta', () => {
    let t = { status: 'proposed' as const, fromOk: false, toOk: false };
    expect(tradeStep(t, 'from', 'confirm')).toBeNull();
    const c = tradeStep(t, 'to', 'counter')!;
    expect(c.status).toBe('countered');
    const f = tradeStep(c, 'from', 'confirm')!;
    expect(f.execute).toBe(false);
    const done = tradeStep(f, 'to', 'confirm')!;
    expect(done.execute).toBe(true);
    expect(done.status).toBe('done');
    expect(tradeStep(t, 'to', 'cancel')).toBeNull();
    expect(tradeStep(t, 'from', 'decline')).toBeNull();
    void t; t = t;
  });
});
