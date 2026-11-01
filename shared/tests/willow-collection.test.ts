import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// um salgueiro do mundo aberto (os recursos nascem por chunk pelos biomas) posto no módulo do cliente
async function willow() {
  const R = await import('../rules/index');
  const w = R.makeCompanionWorld(R.WORLD_SEED, R.worldBiomeList([]));
  (await import('../../client/src/ecos/worldNodes')).setEcosWorld(w);
  let n = null;
  for (let r = 20; !n && r < 300; r += 20) n = R.nodesNear(w, 0, 0, r).find((x) => x.kind === 'salgueiro') ?? null;
  return n!;
}

describe('Salgueiro: coleta local pelo fluxo existente do Core', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('exige machado, respeita duração, entrega madeira uma vez e persiste a recuperação', async () => {
    let { localEcos, localHooks } = await import('../../client/src/ecos/localEcos');
    const n = await willow();
    const body = { node: n.id, approach: 'cortar', request: 'willow-cut', x: n.x, z: n.z };
    await expect(localEcos('ecos.start', body)).rejects.toThrow('machado');
    localHooks.tools = () => ['machado'];
    const wear = vi.fn(); localHooks.wear = wear;
    const start = await localEcos('ecos.start', body);
    expect((await localEcos('ecos.finish', body)).gather?.reason).toBe('cedo');
    vi.advanceTimersByTime(start.started!.seconds * 1000 + 1);
    const result = await localEcos('ecos.finish', body);
    expect(result.gather?.ok).toBe(true);
    const qty = result.ecos!.bag.reduce((n, b) => n + b.qty, 0);
    expect(qty).toBeGreaterThanOrEqual(4); expect(qty).toBeLessThanOrEqual(6);
    expect(result.ecos!.bag.every((b) => b.key.startsWith('madeira-salgueiro|'))).toBe(true);
    expect(result.ecos!.nodes[body.node].amount).toBe(2);
    expect((await localEcos('ecos.finish', body)).gather?.repeat).toBe(true);
    expect(wear).toHaveBeenCalledTimes(1);
    const again = { ...body, request: 'second-cut' };
    await localEcos('ecos.start', again);
    vi.advanceTimersByTime(start.started!.seconds * 1000 + 1);
    expect((await localEcos('ecos.finish', again)).gather?.reason).toBe('esgotado');
    expect(wear).toHaveBeenCalledTimes(1);
    vi.resetModules();
    ({ localEcos, localHooks } = await import('../../client/src/ecos/localEcos'));
    await willow();
    const restored = (await localEcos('ecos.state')).ecos!;
    expect(restored.bag.reduce((n, b) => n + b.qty, 0)).toBe(qty);
    expect(restored.nodes[body.node].amount).toBe(2);
    const { abundanceNow } = await import('../rules/index');
    expect(abundanceNow(n, restored.nodes[body.node], Date.now() + 2 * 3600000)).toBe(8);
  });

  it('recusa mochila cheia sem gastar o salgueiro nem o machado', async () => {
    const { localEcos, localHooks, localBag } = await import('../../client/src/ecos/localEcos');
    localHooks.tools = () => ['machado'];
    const wear = vi.fn(); localHooks.wear = wear;
    const { batchKey, DEFAULT_ECOS } = await import('../rules/index');
    localBag.apply([], [{ key: batchKey('madeira-salgueiro', {}), qty: DEFAULT_ECOS.bag }]);
    const n = await willow();
    const body = { node: n.id, approach: 'cortar', request: 'full-bag', x: n.x, z: n.z };
    const start = await localEcos('ecos.start', body);
    vi.advanceTimersByTime(start.started!.seconds * 1000 + 1);
    const result = await localEcos('ecos.finish', body);
    expect(result.gather?.reason).toBe('mochila-cheia');
    expect(result.ecos!.nodes[body.node]).toBeUndefined();
    expect(wear).not.toHaveBeenCalled();
  });
});
