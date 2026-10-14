-- Server-only quotas. No prompts, replies or raw session tokens are persisted.
create table public.companion_chat_usage (
  nonce text primary key,
  registry_key text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index companion_chat_usage_created on public.companion_chat_usage(created_at);
create index companion_chat_usage_identity_created on public.companion_chat_usage(registry_key,created_at);
alter table public.companion_chat_usage enable row level security;
revoke all on public.companion_chat_usage from public,anon,authenticated;
grant select,insert,delete on public.companion_chat_usage to service_role;
create function public.companion_chat_reserve(p_key text,p_session_hash text,p_nonce text)
returns integer language plpgsql security invoker set search_path='' as $$
declare registry_entry jsonb; day_start timestamptz:=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
begin
  -- One short transaction arbitrates all reservations, including the global ceiling.
  perform pg_advisory_xact_lock(662901477);
  select entry into registry_entry from public.companion_session_registry where registry_key=p_key for share;
  if registry_entry is null or registry_entry->>'status'<>'active' or registry_entry->>'sessionHash' is distinct from p_session_hash then return 401; end if;
  if p_nonce is null or p_nonce !~ '^[a-f0-9-]{36}$' then return 401; end if;
  if exists(select 1 from public.companion_chat_usage where nonce=p_nonce) then return 409; end if;
  if (select count(*) from public.companion_chat_usage where created_at>=day_start)>=500
    or (select count(*) from public.companion_chat_usage where registry_key=p_key and created_at>=day_start)>=30
    or (select count(*) from public.companion_chat_usage where registry_key=p_key and created_at>clock_timestamp()-interval '1 minute')>=4 then return 429; end if;
  insert into public.companion_chat_usage(nonce,registry_key) values(p_nonce,p_key);
  delete from public.companion_chat_usage where created_at<day_start-interval '2 days';
  return 200;
end;
$$;
revoke all on function public.companion_chat_reserve(text,text,text) from public,anon,authenticated;
grant execute on function public.companion_chat_reserve(text,text,text) to service_role;
