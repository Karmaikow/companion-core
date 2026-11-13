/**
 * Dois jogos de verdade (duas instâncias do módulo de rede) ligados por um canal falso, com o relógio controlado.
 * Confere o que importa para "o mesmo monstro nas duas telas": um dono só, o estado chegando ao outro, os golpes
 * indo para o dono, a troca de dono e o custo em mensagens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatureState } from '@rules';

type Sync = typeof import('./creatureSync');
interface Client { id: string; pos: { x: number; z: number }; sync: Sync; handlers: Map<string, Set<(d: unknown, from: string) => void>> }

const clients: Client[] = [];
/** mensagens que passaram pelo canal: cada transmissão conta 1 para quem envia + 1 por quem recebe (regra do Realtime) */
let billed = 0;

async function join(id: string, x: number, z: number): Promise<Client> {
  const c = { id, pos: { x, z }, handlers: new Map() } as unknown as Client;
  vi.resetModules();
  vi.doMock('./presence', () => ({
    presenceId: () => c.id,
    // os outros jogadores, como a presença os entrega (posição recente)
    get remotePoses() { return new Map(clients.filter((o) => o !== c).map((o) => [o.id, { x: o.pos.x, z: o.pos.z }])); },
    sendExtra: (k: string, d: unknown) => {
      const data = JSON.parse(JSON.stringify(d)); // o canal só leva JSON
      const others = clients.filter((o) => o !== c);
      billed += 1 + others.length;
      for (const o of others) o.handlers.get(k)?.forEach((f) => f(data, c.id));
      return true;
    },
    onExtra: (k: string, cb: (d: unknown, from: string) => void) => { if (!c.handlers.has(k)) c.handlers.set(k, new Set()); c.handlers.get(k)!.add(cb); return () => c.handlers.get(k)?.delete(cb); },
  }));
  vi.doMock('../scene/world', () => ({ companionFocus: c.pos }));
  c.sync = await import('./creatureSync');
  clients.push(c);
  return c;
}

const SPAWN = { x: 0, z: 0 }, ID = '0:0:1';
const state = (o: Partial<CreatureState> = {}): CreatureState => ({ id: ID, x: 0, z: 0, yaw: 0, hp: 1, act: 'idle', dead: false, engaged: false, ...o });
/** Um quadro de cada jogo: quem for dono publica o estado que `sim` der. Devolve o modo de cada um. */
function frame(sim: (c: Client) => { s: CreatureState; active: boolean; engaged: boolean }) {
  return clients.map((c) => {
    const { s, active, engaged } = sim(c), own = c.sync.creatureOwner(ID, SPAWN, engaged);
    if (own.mode === 'me') c.sync.publishCreature(s, active);
    return own;
  });
}
/** Roda `seconds` de jogo a 20 quadros por segundo. */
function run(seconds: number, sim: Parameters<typeof frame>[0]) {
  let last = frame(sim);
  for (let t = 0; t < seconds * 1000; t += 50) { vi.advanceTimersByTime(50); last = frame(sim); }
  return last;
}
const idle = () => ({ s: state(), active: false, engaged: false });

beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] }); clients.length = 0; billed = 0; });
afterEach(() => { vi.useRealTimers(); vi.doUnmock('./presence'); vi.doUnmock('../scene/world'); });

describe('monstros compartilhados entre dois jogos', () => {
  it('sozinho no mapa: simula como antes e não manda nada', async () => {
    const a = await join('a', 2, 0);
    expect(run(3, idle)[0].mode).toBe('solo');
    expect(billed).toBe(0);
    expect(a.sync.syncStats.sent).toBe(0);
  });

  it('dois perto da mesma toca: um dono só (o mais perto), e o outro recebe o estado dele', async () => {
    await join('a', 2, 0); await join('b', 30, 0);
    const [ra, rb] = run(3, (c) => ({ s: state({ x: c.id === 'a' ? 1.5 : 99, hp: c.id === 'a' ? 0.8 : 0.1 }), active: false, engaged: false }));
    expect(ra.mode).toBe('me');
    expect(rb.mode).toBe('remote');
    if (rb.mode !== 'remote') return;
    expect(rb.owner).toBe('a');
    expect(rb.state).toMatchObject({ x: 1.5, hp: 0.8 }); // o que vale é o que o dono simulou, não o que B simularia
  });

  it('o monstro brigando chega 4 vezes por segundo; passeando, uma vez a cada 2 s', async () => {
    const a = await join('a', 2, 0); await join('b', 30, 0);
    run(2.5, idle);
    const idleSent = a.sync.syncStats.sent;
    run(4, idle);
    expect(a.sync.syncStats.sent - idleSent).toBe(2); // 4 s parado → 2 envios
    const before = a.sync.syncStats.sent;
    let x = 0;
    const [, rb] = run(2, (c) => ({ s: state({ x: c.id === 'a' ? (x += 0.05) : 0, act: 'run', engaged: true }), active: true, engaged: c.id === 'a' }));
    const sent = a.sync.syncStats.sent - before;
    expect(sent).toBeGreaterThanOrEqual(7); expect(sent).toBeLessThanOrEqual(9); // 2 s × 4/s
    // e a tela de B está no máximo um envio atrás da de A
    if (rb.mode !== 'remote' || !rb.state) throw new Error('B deveria estar seguindo A');
    expect(rb.state.engaged).toBe(true);
    expect(Math.abs(rb.state.x - x)).toBeLessThan(0.05 * 20 * 0.3);
  });

  it('o golpe de quem não é dono vai para o dono, e só para ele', async () => {
    const a = await join('a', 2, 0), b = await join('b', 30, 0), c = await join('c', 40, 0);
    run(1, idle);
    const got: unknown[] = [], wrong: unknown[] = [];
    a.sync.onCreatureHit(ID, (raw, from) => got.push([raw, from]));
    c.sync.onCreatureHit(ID, (raw) => wrong.push(raw));
    b.sync.sendCreatureHit(ID, 'a', 37, { key: 'queimando', seconds: 3, dps: 4 });
    expect(got).toEqual([[{ id: ID, to: 'a', dmg: 37, status: { key: 'queimando', seconds: 3, dps: 4 } }, 'b']]);
    expect(wrong).toEqual([]);
  });

  it('a morte e a volta chegam na hora, sem esperar o ritmo lento', async () => {
    await join('a', 2, 0); await join('b', 30, 0);
    run(2.5, idle);
    let dead = true;
    const sim = (c: Client) => ({ s: state({ dead: c.id === 'a' ? dead : false, hp: dead ? 0 : 1 }), active: false, engaged: false });
    let [, rb] = run(0.3, sim);
    expect(rb.mode === 'remote' && rb.state?.dead).toBe(true);
    dead = false;
    [, rb] = run(0.3, sim);
    expect(rb.mode === 'remote' && rb.state?.dead).toBe(false);
  });

  it('o dono vai embora e o outro chega perto: a vez passa, e nunca ficam dois donos de vez', async () => {
    const a = await join('a', 2, 0), b = await join('b', 30, 0);
    run(2.5, idle);
    a.pos.x = 60; b.pos.x = 3; // A se afasta da toca, B chega
    let both = 0, none = 0;
    for (let i = 0; i < 80; i++) { vi.advanceTimersByTime(50); const r = frame(idle); const owners = r.filter((o) => o.mode === 'me').length; if (owners > 1) both++; if (owners === 0) none++; }
    const [ra, rb] = frame(idle);
    expect(rb.mode).toBe('me');
    expect(ra.mode).toBe('remote');
    expect(both).toBe(0);
    expect(none).toBeLessThanOrEqual(1);
  });

  it('brigando, o dono não perde a vez mesmo com o outro mais perto da toca', async () => {
    const a = await join('a', 20, 0), b = await join('b', 30, 0);
    const fight = (c: Client) => ({ s: state({ engaged: c.id === 'a' }), active: true, engaged: c.id === 'a' });
    run(1, fight);
    b.pos.x = 1; // B chega bem mais perto da toca no meio da luta de A
    const [ra, rb] = run(3, fight);
    expect(ra.mode).toBe('me');
    expect(rb.mode).toBe('remote');
    void a;
  });

  it('os dois se achando donos ao mesmo tempo: em pouco tempo sobra um', async () => {
    const a = await join('a', 5, 0), b = await join('b', 5.1, 0);
    // os dois publicam no mesmo instante, antes de ouvir o outro
    for (const c of [a, b]) c.sync.publishCreature(state(), false);
    const r = run(3, idle);
    expect(r.filter((o) => o.mode === 'me').length).toBe(1);
    expect(r[0].mode).toBe('me'); // o mais perto da toca
  });

  it('longe um do outro: ninguém transmite nada (o monstro nem aparece na tela do outro)', async () => {
    await join('a', 2, 0); await join('b', 600, 0);
    const [ra] = run(5, idle);
    expect(ra.mode).toBe('solo');
    expect(billed).toBe(0);
  });

  it('custo medido: 1 h parados juntos e 1 h com um lutando', async () => {
    const a = await join('a', 2, 0); await join('b', 30, 0);
    run(60, idle);
    const idlePerHour = billed * 60;
    billed = 0;
    run(60, (c) => ({ s: state({ act: 'run', engaged: c.id === 'a' }), active: true, engaged: c.id === 'a' }));
    const fightPerHour = billed * 60;
    // um monstro: parado 0,5 envio/s × 2 (quem envia + quem recebe) = 3.600/h; lutando 4/s × 2 = 28.800/h
    expect(idlePerHour).toBeGreaterThan(3000); expect(idlePerHour).toBeLessThan(4200);
    expect(fightPerHour).toBeGreaterThan(27000); expect(fightPerHour).toBeLessThan(30500);
    void a;
  });
});
