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

export class OnlineBackend implements Backend {
  readonly kind = 'online' as const;
  private async call(action: string, extra: Record<string, unknown> = {}): Promise<Snapshot> {
    const { data, error } = await supabase().functions.invoke('refuge', { body: { action, ...extra } });
    if (error) {
      let message = 'O Refúgio não respondeu. Verifique a conexão e tente de novo.';
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch { /* mantém mensagem padrão */ }
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
  combatKill(slug: string, level: number, pos?: { x: number; z: number }) { return this.call('combat.kill', { slug, level, ...(pos ?? {}) }); }
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
