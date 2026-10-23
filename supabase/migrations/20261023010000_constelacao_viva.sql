-- Constelação Viva: atributos distribuíveis, Ressonância e perfis do Companion.
-- O estado autoritativo fica aqui; o cliente só lê o próprio (RLS). Toda escrita passa pela função refuge
-- (service_role), que valida orçamento, valores e elegibilidade antes de chamar build_write.
-- Nada antigo é apagado: a árvore de habilidades (companion_skill_alloc) continua igual; a tendência racial antiga
-- fica registrada em `migrated` na primeira vez que a build é criada.
create table if not exists public.companion_build (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  alloc jsonb not null check (jsonb_typeof(alloc) = 'object'),
  resonance text check (resonance is null or resonance in ('fluxo-arcano', 'canal-profundo', 'bastiao', 'impacto', 'precisao', 'passo-leve')),
  profiles jsonb not null default '[]'::jsonb check (jsonb_typeof(profiles) = 'array'),
  pending jsonb check (pending is null or jsonb_typeof(pending) = 'object'),
  migrated jsonb,
  applied_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.companion_build enable row level security;
create policy build_read_own on public.companion_build for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));

-- pedidos já processados (repetir o mesmo request_id devolve o mesmo resultado)
create table if not exists public.companion_build_requests (
  request_id uuid primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists companion_build_requests_cid on public.companion_build_requests (companion_id, created_at desc);
alter table public.companion_build_requests enable row level security;

grant select on public.companion_build to authenticated;
grant all on public.companion_build, public.companion_build_requests to service_role;
-- correção: a linhagem foi criada sem grants (o projeto não concede privilégios automáticos em tabelas novas)
grant select on public.companion_lineage to authenticated;
grant all on public.companion_lineage to service_role;

-- cria a build (migração) se ainda não existe; idempotente
create or replace function public.build_init(p_cid uuid, p_alloc jsonb, p_migrated jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare b companion_build;
begin
  insert into companion_build (companion_id, alloc, migrated) values (p_cid, p_alloc, p_migrated) on conflict (companion_id) do nothing;
  select * into b from companion_build where companion_id = p_cid;
  return to_jsonb(b);
end $$;

-- escrita atômica: trava a linha, confere a versão (concorrência) e o request_id (repetição), aplica o patch e
-- sobe a versão. Campos do patch: alloc, resonance (ou "resonance_clear"), profiles, pending (ou "pending_clear"), applied.
create or replace function public.build_write(p_cid uuid, p_request uuid, p_kind text, p_version integer, p_patch jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare b companion_build; prev jsonb; res jsonb;
begin
  select result into prev from companion_build_requests where request_id = p_request;
  if found then return prev || jsonb_build_object('repeat', true); end if;
  select * into b from companion_build where companion_id = p_cid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'sem-build'); end if;
  if b.version <> p_version then
    return jsonb_build_object('ok', false, 'reason', 'versao', 'version', b.version);
  end if;
  update companion_build set
    alloc = coalesce(p_patch->'alloc', alloc),
    resonance = case when p_patch ? 'resonance_clear' then null when p_patch ? 'resonance' then p_patch->>'resonance' else resonance end,
    profiles = coalesce(p_patch->'profiles', profiles),
    pending = case when p_patch ? 'pending_clear' then null when p_patch ? 'pending' then p_patch->'pending' else pending end,
    applied_at = case when p_patch ? 'applied' then now() else applied_at end,
    version = version + 1,
    updated_at = now()
  where companion_id = p_cid
  returning * into b;
  res := jsonb_build_object('ok', true, 'version', b.version);
  insert into companion_build_requests (request_id, companion_id, kind, result) values (p_request, p_cid, p_kind, res);
  return res;
end $$;

revoke execute on function public.build_init(uuid, jsonb, jsonb), public.build_write(uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.build_init(uuid, jsonb, jsonb), public.build_write(uuid, uuid, text, integer, jsonb) to service_role;
