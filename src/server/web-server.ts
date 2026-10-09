import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AIConnectionError } from '../ai/openai-provider.js';
import { createAIProvider } from '../ai/provider-factory.js';
import { LocalAuth, AuthError } from './local-auth.js';
import { CompanionRuntime, HubError } from './companion-runtime.js';
import { PairingError, parseRemoteOrigin, RemotePairing } from './remote-pairing.js';

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';
const WEB_ROOT = path.resolve(process.cwd(), 'web');
const mock = process.env.MAYUNA_AI_PROVIDER === 'mock';
const auth = new LocalAuth();
const provider = createAIProvider();
const runtime = new CompanionRuntime(provider);
const remoteOrigin = parseRemoteOrigin(process.env.MAYUNA_REMOTE_ORIGIN);
const pairing = new RemotePairing(remoteOrigin);

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (body.length > 64_000) {
      throw new Error('Payload muito grande.');
    }
  }

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

async function serveStatic(urlPath: string, res: ServerResponse): Promise<void> {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const decoded = decodeURIComponent(requested.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^([.][.][/\\])+/, '');
  const filePath = path.resolve(WEB_ROOT, `.${normalized.startsWith('/') ? normalized : `/${normalized}`}`);

  if (!filePath.startsWith(WEB_ROOT + path.sep)) {
    json(res, 403, { error: 'Acesso negado.' });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error('Not a file');
    }

    const extension = path.extname(filePath).toLowerCase();
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=300'
    });
    res.end(content);
  } catch {
    json(res, 404, { error: 'Arquivo não encontrado.' });
  }
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  if (req.method === 'GET' && pathname === '/api/health') {
    json(res, 200, { ok: true, service: 'Companion Core' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auth/status') { json(res,200,auth.status(req)); return; }
  if (req.method === 'POST' && pathname.startsWith('/api/auth/')) {
    try {
      if (pathname === '/api/auth/logout') { auth.logout(req,res); json(res,200,{ok:true}); return; }
      const body=await readJsonBody(req);
      if (pathname === '/api/auth/setup') await auth.setup(req,res,body);
      else if (pathname === '/api/auth/login') await auth.login(req,res,body);
      else { json(res,404,{error:'Rota não encontrada.'}); return; }
      json(res,200,{ok:true});
    } catch(error) {
      json(res,error instanceof AuthError ? error.status : error instanceof SyntaxError ? 400 : 500,
        {error:error instanceof AuthError ? error.message : 'Não foi possível concluir o acesso local.'});
    }
    return;
  }

  // Pairing code creation is available only to the authenticated local owner.
  if (pathname === '/api/remote/pairing/status' || pathname === '/api/remote/pairing/code') {
    if (!auth.authorized(req)) { json(res, 401, { error: 'Entre localmente para parear uma interface.' }); return; }
    if (req.method === 'GET' && pathname.endsWith('/status')) { json(res, 200, pairing.status()); return; }
    if (req.method === 'POST' && pathname.endsWith('/code')) {
      try { json(res, 200, pairing.createCode()); }
      catch (error) { json(res, error instanceof PairingError ? error.status : 500, { error: error instanceof Error ? error.message : 'Falha ao gerar o código.' }); }
      return;
    }
  }

  if (pathname.startsWith('/api/remote/')) {
    if (req.method === 'POST' && pathname === '/api/remote/connect') {
      try {
        const body = await readJsonBody(req) as { code?: unknown };
        json(res, 200, pairing.exchange(body.code, req.headers.origin, req.socket.remoteAddress ?? 'unknown'));
      } catch (error) {
        json(res, error instanceof PairingError ? error.status : error instanceof SyntaxError ? 400 : 500,
          { error: error instanceof Error ? error.message : 'Falha no pareamento.' });
      }
      return;
    }
    const token = pairing.authorize(req.headers.authorization, req.headers.origin);
    if (!token) { json(res, 401, { error: 'Conexão expirada. Gere um novo código no Core local.' }); return; }
    if (req.method === 'POST' && pathname === '/api/remote/logout') { pairing.revoke(token); json(res, 200, { ok: true }); return; }
    if (req.method === 'GET' && pathname === '/api/remote/state') { json(res, 200, runtime.getClientState()); return; }
    if (req.method === 'GET' && pathname === '/api/remote/verify') {
      const verification = runtime.verify();
      json(res, verification.valid ? 200 : 409, { valid: verification.valid, reason: verification.reason, trustedSequence: verification.trustedSequence, acceptedEvents: verification.acceptedEvents });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/remote/chat') {
      try {
        const body = await readJsonBody(req) as { message?: unknown };
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (!message) { json(res, 400, { error: 'Mensagem vazia.' }); return; }
        if (message.length > 2000) { json(res, 400, { error: 'Mensagem muito longa.' }); return; }
        json(res, 200, await runtime.chat(message));
      } catch (error) {
        console.error('[Companion Core] Falha no chat remoto:', chatErrorDetail(error));
        json(res, 503, { error: 'Mayuna não conseguiu responder agora.', detail: chatErrorDetail(error) });
      }
      return;
    }
    json(res, 404, { error: 'Rota remota não encontrada.' });
    return;
  }

  if (!auth.authorized(req)) { json(res,401,{error:'Entre para acessar sua Companion.'}); return; }

  if (req.method === 'GET' && pathname === '/api/companions') {
    try { json(res, 200, { companions: await runtime.listCompanions(), activeId: runtime.getClientState().identity.id, creationPolicy: runtime.getCreationPolicy() }); }
    catch (error) { json(res, 409, { error: error instanceof Error ? error.message : 'Não foi possível carregar o Hub.' }); }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/companions') {
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      if (!body || typeof body.name !== 'string' || typeof body.ownerName !== 'string' || typeof body.preferredAddress !== 'string') {
        json(res, 400, { error: 'Preencha nome, como quer ser chamado e personalidade.' }); return;
      }
      const state = await runtime.createCompanion({ name: body.name, ownerName: body.ownerName, preferredAddress: body.preferredAddress, archetype: typeof body.archetype === 'string' ? body.archetype : undefined, soulColor: body.soulColor, traits: body.traits });
      json(res, 201, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível criar a Companion.';
      json(res, error instanceof HubError ? error.status : 500, { error: error instanceof HubError ? message : 'Não foi possível criar a Companion.' });
    }
    return;
  }

  const activateMatch = pathname.match(/^\/api\/companions\/(MC-[A-Z0-9-]+)\/activate$/i);
  if (req.method === 'POST' && activateMatch) {
    try { json(res, 200, await runtime.activateCompanion(activateMatch[1])); }
    catch (error) { json(res, error instanceof HubError ? error.status : 500, { error: error instanceof Error ? error.message : 'Não foi possível selecionar a Companion.' }); }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/companion/state') {
    json(res, 200, runtime.getClientState());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/companion/verify') {
    const verification = runtime.verify();
    json(res, verification.valid ? 200 : 409, {
      valid: verification.valid,
      reason: verification.reason,
      trustedSequence: verification.trustedSequence,
      acceptedEvents: verification.acceptedEvents
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/companion/chat') {
    try {
      const body = await readJsonBody(req) as { message?: unknown };
      const message = typeof body.message === 'string' ? body.message.trim() : '';

      if (!message) {
        json(res, 400, { error: 'Mensagem vazia.' });
        return;
      }

      if (message.length > 2000) {
        json(res, 400, { error: 'Mensagem muito longa.' });
        return;
      }

      const result = await runtime.chat(message);
      json(res, 200, result);
    } catch (error) {
      console.error('[Companion Core] Falha no chat:', chatErrorDetail(error));
      json(res, 503, {
        error: 'Mayuna não conseguiu responder agora.',
        detail: chatErrorDetail(error)
      });
    }
    return;
  }

  json(res, 404, { error: 'Rota não encontrada.' });
}

function chatErrorDetail(error: unknown): string {
  if (error instanceof AIConnectionError) return error.message;
  return 'Não foi possível concluir a conversa. Confira o provider configurado e os logs locais.';
}

async function main(): Promise<void> {
  await auth.initialize();
  await runtime.initialize();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      // Owner routes stay same-origin; remote interaction requires an exact configured origin.
      const hostname = url.hostname;
      if (!['localhost', '127.0.0.1', '[::1]', HOST].includes(hostname)) {
        json(res, 403, { error: 'Host não autorizado.' }); return;
      }
      const ownerPairingRoute = url.pathname === '/api/remote/pairing/status' || url.pathname === '/api/remote/pairing/code';
      const remoteRequest = url.pathname.startsWith('/api/remote/') && !ownerPairingRoute;
      const allowedRemoteOrigin = !!remoteOrigin && req.headers.origin === remoteOrigin;
      if (req.method === 'OPTIONS' && remoteRequest && allowedRemoteOrigin) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': remoteOrigin!,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '300',
          'Vary': 'Origin',
          'Cache-Control': 'no-store'
        });
        res.end(); return;
      }
      if (remoteRequest && req.headers.origin) {
        if (!allowedRemoteOrigin) { json(res, 403, { error: 'Origem não autorizada.' }); return; }
        res.setHeader('Access-Control-Allow-Origin', remoteOrigin!);
        res.setHeader('Vary', 'Origin');
      } else if (req.headers.origin && req.headers.origin !== url.origin) {
        json(res, 403, { error: 'Origem não autorizada.' }); return;
      }
      if (req.method === 'POST' && !(req.headers['content-type'] ?? '').startsWith('application/json')) { json(res,415,{error:'Envie JSON.'}); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url.pathname);
        return;
      }

      await serveStatic(url.pathname, res);
    } catch (error) {
      console.error('[Mayuna Web] Erro inesperado:', error);
      json(res, 500, { error: 'Erro interno.' });
    }
  });

  server.on('error', error => {
    console.error((error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      ? `A porta ${PORT} já está em uso. Confira se o Core já está rodando.`
      : 'Não foi possível abrir a API local. Confira host e porta.');
    process.exitCode = 1;
  });
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║              COMPANION CORE WEB v0.7                    ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`Interface: http://${HOST}:${PORT}`);
    console.log(`IA: ${provider.name}${mock ? ' · simulada, dados isolados' : ''}`);
    console.log('');
  });
}

void main();
