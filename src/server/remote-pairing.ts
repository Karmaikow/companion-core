import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export class PairingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function parseRemoteOrigin(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('MAYUNA_REMOTE_ORIGIN precisa ser uma origem HTTPS válida.'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MAYUNA_REMOTE_ORIGIN aceita uma origem HTTPS exata; HTTP só é aceito para localhost em desenvolvimento.');
  }
  return url.origin;
}

type PairCode = { value: string; expiresAt: number; failures: number };
type RemoteSession = { origin: string; expiresAt: number };
type Attempts = { count: number; startedAt: number };
const CODE_TTL = 2 * 60_000;
const SESSION_TTL = 2 * 60 * 60_000;

/** Short-lived, origin-bound access. Secrets exist only in this process memory. */
export class RemotePairing {
  private pending: PairCode | null = null;
  private readonly sessions = new Map<string, RemoteSession>();
  private readonly attempts = new Map<string, Attempts>();

  constructor(private readonly allowedOrigin: string | null, private readonly now: () => number = Date.now) {}

  status() { return { enabled: !!this.allowedOrigin, codeTtlSeconds: CODE_TTL / 1000, sessionTtlSeconds: SESSION_TTL / 1000 }; }

  createCode(): { code: string; expiresAt: string } {
    if (!this.allowedOrigin) throw new PairingError(503, 'Configure MAYUNA_REMOTE_ORIGIN antes de parear a interface online.');
    const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    const expiresAt = this.now() + CODE_TTL;
    this.pending = { value: code, expiresAt, failures: 0 };
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  exchange(codeInput: unknown, origin: string | undefined, address: string): { token: string; expiresAt: string } {
    if (!this.allowedOrigin || origin !== this.allowedOrigin) throw new PairingError(403, 'Origem não autorizada.');
    const now = this.now();
    for (const [key, attempt] of this.attempts) if (now - attempt.startedAt >= 15 * 60_000) this.attempts.delete(key);
    const attempt = this.attempts.get(address) ?? { count: 0, startedAt: now };
    if (attempt.count >= 10) throw new PairingError(429, 'Muitas tentativas de pareamento. Aguarde 15 minutos.');
    attempt.count++;
    this.attempts.set(address, attempt);

    const input = typeof codeInput === 'string' ? codeInput : '';
    const pending = this.pending;
    if (!pending || pending.expiresAt <= now || pending.failures >= 5 || !/^\d{8}$/.test(input)) {
      this.pending = pending && pending.expiresAt > now && pending.failures < 5 ? pending : null;
      throw new PairingError(401, 'Código inválido ou expirado. Gere outro código no Core local.');
    }
    const match = timingSafeEqual(Buffer.from(input), Buffer.from(pending.value));
    if (!match) {
      pending.failures++;
      if (pending.failures >= 5) this.pending = null;
      throw new PairingError(401, 'Código inválido ou expirado. Gere outro código no Core local.');
    }

    for (const [token, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(token);
    if (this.sessions.size >= 4) throw new PairingError(429, 'Limite de interfaces pareadas. Revogue uma sessão e tente novamente.');
    this.pending = null;
    const token = Buffer.from(randomBytes(32)).toString('hex');
    const expiresAt = now + SESSION_TTL;
    this.sessions.set(token, { origin: this.allowedOrigin, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  authorize(header: string | undefined, origin: string | undefined): string | null {
    if (!this.allowedOrigin || origin !== this.allowedOrigin) return null;
    const token = /^Bearer ([a-f0-9]{64})$/.exec(header ?? '')?.[1];
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= this.now() || session.origin !== origin) {
      this.sessions.delete(token);
      return null;
    }
    return token;
  }

  revoke(token: string | null): void { if (token) this.sessions.delete(token); }
}
