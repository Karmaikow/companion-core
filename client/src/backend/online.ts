import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CompanionSetup } from '@rules';
import type { Backend, Snapshot, BarksRequest } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://rqdukyenuecrshzmofdo.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_fIg0d4DQ3aUpLL6541ZSaA_iYyRY7BW';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** A sessão não vale mais (venceu, foi encerrada, ou a conta entrou por outro lugar) e não deu para renovar. */
export class SessionExpired extends Error {}
export const SESSION_EXPIRED_TEXT = 'Sua sessão expirou. Entre de novo para continuar.';
/** Quem quer saber que a sessão caiu (o jogo volta para a tela de entrada). */
export const sessionEvents = { expired: null as null | (() => void) };

/**
 * O servidor recusou a sessão (401). Tenta renovar uma vez; `true` = renovou, pode repetir o pedido.
 * Só apaga a sessão guardada no aparelho quando o próprio servidor de login diz que ela não vale mais — falha de
 * rede não apaga nada (para quem joga sem conta, a sessão guardada é o único acesso ao Companion).
 */
async function renewSession(): Promise<boolean> {
  const auth = supabase().auth;
  try {
    const { data, error } = await auth.refreshSession();
    if (!error && data.session) return true;
    const status = (error as { status?: number } | null)?.status;
    // sem status = não chegou ao servidor (rede): a sessão pode estar boa
    if (error && status === undefined && !/session missing|refresh token/i.test(error.message)) return false;
    await auth.signOut({ scope: 'local' }).catch(() => undefined);
  } catch { return false; }
  sessionEvents.expired?.();
  throw new SessionExpired(SESSION_EXPIRED_TEXT);
}

export class OnlineBackend implements Backend {
  readonly kind = 'online' as const;
  private async call(action: string, extra: Record<string, unknown> = {}, retry = true): Promise<Snapshot> {
    const { data, error } = await supabase().functions.invoke('refuge', { body: { action, ...extra } });
    if (error) {
      const res = (error as { context?: Response }).context;
      let message = 'O Refúgio não respondeu. Verifique a conexão e tente de novo.';
      try {
        const body = await res?.json();
        if (body?.error) message = body.error;
      } catch { /* mantém mensagem padrão */ }
      // Sessão recusada: o token pode só ter vencido com a aba parada (o pedido saiu antes da renovação automática).
      // Renova e repete uma vez; se a sessão não vale mais, o jogo volta para a tela de entrada em vez de travar.
      if (res?.status === 401 && retry && (await renewSession())) return this.call(action, extra, false);
      throw new Error(message);
    }
    return data as Snapshot;
  }
  schools() { return this.call('schools.state') as unknown as Promise<{ schools: import('../../../shared/rules/combat/schoolJournal').SchoolJournal }>; }
  state() { return this.call('state'); }
  create(setup?: CompanionSetup) { return this.call('create', setup ? { setup } : {}); }
  chat(message: string) { return this.call('chat', { message }); }
  dream() { return this.call('dream'); }
  awaken() { return this.call('awaken'); }
  muse() { return this.call('muse'); }
  combatKill(slug: string, level: number, pos?: { x: number; z: number }, loot?: 'own' | 'none' | 'only') { return this.call('combat.kill', { slug, level, ...(pos ?? {}), ...(loot && loot !== 'own' ? { loot } : {}) }); }
  chests(action: string, body: Record<string, unknown> = {}) { return this.call(action, body) as unknown as Promise<import('../chests/chestStore').ChestsReply>; }
  inventory(action: 'inventory.discard' | 'inventory.grant', body: Record<string, unknown>) { return this.call(action, body); }
  ecos(action: string, body: Record<string, unknown> = {}) { return this.call(action, body) as unknown as Promise<import('../ecos/types').EcosReply>; }
  pacto(action: string, body: Record<string, unknown> = {}) { return this.call(action, body) as unknown as Promise<import('../pacto/types').PactoReply>; }
  missions(action: string, body: Record<string, unknown> = {}) { return this.call(action, body) as unknown as Promise<import('../missions/missionsStore').MissionsReply>; }
  build(action: string, body: Record<string, unknown> = {}) { return this.call(action, body) as unknown as Promise<import('../build/types').BuildReply>; }
  barks(req: BarksRequest) { return this.call('barks', req as unknown as Record<string, unknown>) as unknown as Promise<{ lines?: Record<string, string[]>; line?: string | null }>; }
  social(action: string, body: Record<string, unknown> = {}) { return this.call(action, body) as unknown as Promise<Record<string, unknown>>; }
  async signOut() { await supabase().auth.signOut(); }
}
