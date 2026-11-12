import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/catalog';

function mockRes() {
  const r = { code: 0, headers: {} as Record<string, string>, body: undefined as unknown,
    status(c: number) { r.code = c; return r; }, setHeader(k: string, v: string) { r.headers[k] = v; },
    json(b: unknown) { r.body = b; }, end() { /* */ } };
  return r;
}

describe('api/catalog', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('devolve o catálogo com cache na borda', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ slug: 'a', name: 'A', data: {} }] });
    vi.stubGlobal('fetch', f);
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'creatures' } }, res);
    expect(res.code).toBe(200);
    expect(res.headers['Cache-Control']).toContain('s-maxage=300');
    expect(res.body).toEqual([{ slug: 'a', name: 'A', data: {} }]);
    expect(String(f.mock.calls[0][0])).toContain('/rest/v1/creatures?select=slug,name,data&status=eq.published');
  });

  it('recusa catálogo desconhecido sem chamar o banco', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'companions' } }, res);
    expect(res.code).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('não guarda erro em cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'items' } }, res);
    expect(res.code).toBe(502);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
