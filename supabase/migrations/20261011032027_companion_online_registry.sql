-- Only the Edge Function accesses session state. No Core data or private keys are stored here.
create table public.companion_session_registry (
  registry_key text primary key check (registry_key ~ '^MC-[A-Za-z0-9-]{1,100}:[a-f0-9]{64}$'),
  revision bigint not null default 1 check (revision > 0 and revision < 9007199254740991),
  entry jsonb not null check (
    coalesce(jsonb_typeof(entry) = 'object'
      and entry->>'status' in ('active','recollected')
      and jsonb_typeof(entry->'publicKey') = 'string'
      and jsonb_typeof(entry->'device') = 'object'
      and entry->>'sessionHash' ~ '^[a-f0-9]{64}$'
      and entry->>'recoveryHash' ~ '^[a-f0-9]{64}$'
      and not (entry ?| array['privateKey','password','memories','ciphertext'])
      and pg_column_size(entry) <= 524288, false)
  )
);
comment on table public.companion_session_registry is
  'Server-only Companion session authorizations. Ed25519 requests are verified by the Edge Function; secrets are stored only as hashes.';
alter table public.companion_session_registry enable row level security;
revoke all on table public.companion_session_registry from public, anon, authenticated, service_role;
grant select, insert, update on table public.companion_session_registry to service_role;
create policy registry_service_only on public.companion_session_registry
  for all to service_role using (true) with check (true);

-- UPDATE's row lock and revision predicate arbitrate claims across independent workers.
create function public.companion_registry_cas(
  p_key text, p_expected_revision bigint, p_entry jsonb
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare changed integer;
begin
  if p_expected_revision is null then
    insert into public.companion_session_registry (registry_key, revision, entry)
    values (p_key, 1, p_entry) on conflict (registry_key) do nothing;
  else
    update public.companion_session_registry
    set revision = revision + 1, entry = p_entry
    where registry_key = p_key and revision = p_expected_revision;
  end if;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.companion_registry_cas(text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.companion_registry_cas(text,bigint,jsonb) to service_role;

