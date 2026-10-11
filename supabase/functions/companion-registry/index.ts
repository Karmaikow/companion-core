import { createRegistryHandler, SupabaseRegistryStore } from './shared/portability/online-registry.js';

// Requests are authenticated by the Companion's Ed25519 signature, timestamp and nonce.
// No private Companion key or Supabase server credential is supplied by the caller.
const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const secret=keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const store=new SupabaseRegistryStore(Deno.env.get('SUPABASE_URL')||'',secret);
Deno.serve(createRegistryHandler(store));
