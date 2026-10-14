import { createSharedChatHandler, SupabaseChatQuota } from './shared/server/shared-chat.js';
// Custom Ed25519 authentication: signed domain + timestamp + nonce + active Crystal session.
// JWT verification is disabled only because the Core uses its existing Crystal identity.
const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const secret=keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const quota=new SupabaseChatQuota(Deno.env.get('SUPABASE_URL')||'',secret);
Deno.serve(createSharedChatHandler(quota,Deno.env.get('GROQ_API_KEY')||''));
