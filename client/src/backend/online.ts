import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CompanionSetup } from '@rules';
import type { Backend, Snapshot } from './types';

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
  state() { return this.call('state'); }
  create(setup?: CompanionSetup) { return this.call('create', setup ? { setup } : {}); }
  chat(message: string) { return this.call('chat', { message }); }
  dream() { return this.call('dream'); }
  awaken() { return this.call('awaken'); }
  muse() { return this.call('muse'); }
  async signOut() { await supabase().auth.signOut(); }
}
