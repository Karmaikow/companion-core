const CORE_URL = 'http://127.0.0.1:4173';
let accessToken = '';
let tokenExpiresAt = 0;

const ROUTES = {
  '/api/companion/state': '/api/remote/state',
  '/api/companion/interaction': '/api/remote/interaction',
  '/api/companion/chat': '/api/remote/chat',
  '/api/companion/verify': '/api/remote/verify',
  '/api/auth/logout': '/api/remote/logout'
};

export async function connectWithCode(code) {
  accessToken = '';
  tokenExpiresAt = 0;
  const response = await fetch(`${CORE_URL}/api/remote/connect`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    redirect: 'error',
    targetAddressSpace: 'loopback',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível parear com o Core local.');
  if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error('O Core retornou uma sessão inválida.');
  accessToken = data.token;
  tokenExpiresAt = Date.parse(data.expiresAt) || Date.now() + 2 * 60 * 60_000;
  return data;
}

export async function remoteRequest(url, options = {}) {
  if (url === '/api/auth/logout') {
    try {
      if (accessToken) await fetch(`${CORE_URL}${ROUTES[url]}`, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
        targetAddressSpace: 'loopback', signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: '{}'
      }).catch(() => {});
    } finally { clearRemoteSession(); }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (!accessToken || tokenExpiresAt <= Date.now()) {
    clearRemoteSession();
    return new Response(JSON.stringify({ error: 'A conexão expirou. Gere um novo código no Core local.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const artRoute=/^\/api\/companion\/art\/MC-[A-Z0-9-]+\/[a-f0-9]{64}$/.test(url) ? url.replace('/api/companion/art/','/api/remote/art/') : null;
  const route = ROUTES[url] || artRoute;
  if (!route) throw new Error('Rota não disponível na conexão remota.');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${CORE_URL}${route}`, {
    ...options,
    headers,
    mode: 'cors',
    credentials: 'omit',
    redirect: 'error',
    targetAddressSpace: 'loopback'
  });
  if (response.status === 401) clearRemoteSession();
  return response;
}

export function clearRemoteSession() { accessToken = ''; tokenExpiresAt = 0; }
