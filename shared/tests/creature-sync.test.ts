import { describe, it, expect } from 'vitest';
import {
  SYNC_HYSTERESIS, SYNC_RANGE, packCreature, pickOwner, readCreatureHit, resolveClaim, syncInterval, syncMessagesPerHour, unpackCreatures,
  type CreatureState,
} from '../rules/index';

const spawn = { x: 0, z: 0 };
const A = { id: 'a', x: 5, z: 0 }, B = { id: 'b', x: 20, z: 0 };

describe('monstros compartilhados: quem é o dono', () => {
  it('é o jogador mais perto da toca; sozinho, sou eu', () => {
    expect(pickOwner(spawn, [A], null)).toBe('a');
    expect(pickOwner(spawn, [A, B], null)).toBe('a');
    expect(pickOwner(spawn, [B, A], null)).toBe('a'); // a ordem da lista não muda a resposta
  });

  it('empate de distância: o menor id, igual em todos os jogos', () => {
    const p = [{ id: 'z', x: 3, z: 0 }, { id: 'c', x: -3, z: 0 }];
    expect(pickOwner(spawn, p, null)).toBe('c');
    expect(pickOwner(spawn, [...p].reverse(), null)).toBe('c');
  });

  it('ninguém perto da toca: sem dono', () => {
    expect(pickOwner(spawn, [{ id: 'a', x: SYNC_RANGE + 1, z: 0 }], null)).toBe(null);
  });

  it('o dono continua enquanto o monstro briga com ele, mesmo com outro mais perto', () => {
    expect(pickOwner(spawn, [A, B], { id: 'b', engaged: true })).toBe('b');
  });

  it('fora da luta, só troca de dono se o outro estiver bem mais perto (sem ficar trocando na fronteira)', () => {
    const near = { id: 'a', x: 10, z: 0 }, cur = { id: 'b', x: 10 + SYNC_HYSTERESIS - 1, z: 0 };
    expect(pickOwner(spawn, [near, cur], { id: 'b', engaged: false })).toBe('b');
    expect(pickOwner(spawn, [near, { id: 'b', x: 10 + SYNC_HYSTERESIS + 1, z: 0 }], { id: 'b', engaged: false })).toBe('a');
  });

  it('o dono saiu do alcance (ou sumiu): a conta recomeça', () => {
    expect(pickOwner(spawn, [A], { id: 'b', engaged: true })).toBe('a');
    expect(pickOwner(spawn, [A, { id: 'b', x: SYNC_RANGE + 5, z: 0 }], { id: 'b', engaged: true })).toBe('a');
  });

  it('dois se achando donos: vence quem está brigando; no empate, o menor id — e os dois lados concordam', () => {
    expect(resolveClaim({ id: 'b', engaged: true }, { id: 'a', engaged: false })).toBe(true);
    expect(resolveClaim({ id: 'a', engaged: false }, { id: 'b', engaged: true })).toBe(false);
    for (const [x, y] of [[true, true], [false, false]] as const) {
      const me = resolveClaim({ id: 'a', engaged: x }, { id: 'b', engaged: y }), other = resolveClaim({ id: 'b', engaged: y }, { id: 'a', engaged: x });
      expect(me).toBe(true); expect(other).toBe(false); // exatamente um fica
    }
  });
});

describe('monstros compartilhados: o que viaja pelo canal', () => {
  const s: CreatureState = { id: '3:-2:1', x: 12.345, z: -7.891, yaw: 1.23456, hp: 0.4567, act: 'run', dead: false, engaged: true };

  it('estado vai e volta (com a precisão reduzida de propósito)', () => {
    const back = unpackCreatures([packCreature(s)])[0];
    expect(back).toEqual({ id: '3:-2:1', x: 12.3, z: -7.9, yaw: 1.23, hp: 0.46, act: 'run', dead: false, engaged: true });
    expect(unpackCreatures([packCreature({ ...s, dead: true, engaged: false, act: 'idle' })])[0]).toMatchObject({ dead: true, engaged: false, act: 'idle' });
  });

  it('o que chega de outro jogador não é de confiança: lixo é descartado e os números ficam em faixa', () => {
    expect(unpackCreatures(null)).toEqual([]);
    expect(unpackCreatures('x')).toEqual([]);
    expect(unpackCreatures([null, 5, [], ['a'], [1, 2, 3, 4, 5, 6, 7], ['', 0, 0, 0, 1, 0, 0], ['a', NaN, 0, 0, 1, 0, 0], ['a', 0, 0, 0, 1, 'x', 0], ['x'.repeat(65), 0, 0, 0, 1, 0, 0]])).toEqual([]);
    const [c] = unpackCreatures([['ok', 1, 2, 0, 99, 42, 3]]);
    expect(c.hp).toBe(1); expect(c.act).toBe('hurt'); expect(c.dead).toBe(true); expect(c.engaged).toBe(true);
    expect(unpackCreatures([['ok', 1, 2, 0, -5, -3, 0]])[0]).toMatchObject({ hp: 0, act: 'idle' });
    expect(unpackCreatures(Array.from({ length: 500 }, (_, i) => ['m' + i, 0, 0, 0, 1, 0, 0])).length).toBe(80);
  });

  it('golpe recebido: forma conferida e dano limitado à vida do monstro', () => {
    expect(readCreatureHit(null, 100)).toBe(null);
    expect(readCreatureHit({ id: 'm', to: 'a', dmg: 'muito' }, 100)).toBe(null);
    expect(readCreatureHit({ id: 'm', to: 'a', dmg: 37.6 }, 100)).toEqual({ id: 'm', to: 'a', dmg: 38 });
    expect(readCreatureHit({ id: 'm', to: 'a', dmg: 1e9 }, 100)?.dmg).toBe(100);
    expect(readCreatureHit({ id: 'm', to: 'a', dmg: -50 }, 100)?.dmg).toBe(0);
    expect(readCreatureHit({ id: 'm', to: 'a', dmg: 10, status: { key: 'envenenado', seconds: 999, dps: 1e6 } }, 100)?.status).toEqual({ key: 'envenenado', seconds: 15, dps: 20 });
    expect(readCreatureHit({ id: 'm', to: 'a', dmg: 10, status: { key: 'invencivel', seconds: 5, dps: 1 } }, 100)?.status).toBeUndefined();
  });

  it('ritmo e custo: ativo 4×/s, parado a cada 2 s; dois jogadores com um brigando = 28.800 mensagens/h', () => {
    expect(syncInterval(true)).toBe(250);
    expect(syncInterval(false)).toBe(2000);
    expect(syncMessagesPerHour(1, 2)).toBe(28_800);
    expect(syncMessagesPerHour(2, 2)).toBe(57_600);
    expect(syncMessagesPerHour(1, 1)).toBe(14_400);
  });
});
