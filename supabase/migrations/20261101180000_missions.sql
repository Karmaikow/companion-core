-- Missões (Admin → Missões): o catálogo de missões e o andamento de cada Companion.
-- Regras em shared/rules/missions.ts; a função `refuge` confere requisitos e progresso e entrega os prêmios.
-- Também: a mochila de coleta deixa de guardar os ids dos recursos do mundo em ecos_profile.seen (cresceria sem fim).

-- 1) catálogo (igual aos outros do ADM: slug, nome, data, status)
create table if not exists public.missions (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.missions enable row level security;
drop policy if exists missions_read on public.missions;
create policy missions_read on public.missions for select to anon, authenticated
  using (status = 'published' or (select public.is_studio_admin()));
drop policy if exists missions_admin_insert on public.missions;
create policy missions_admin_insert on public.missions for insert to authenticated with check ((select public.is_studio_admin()));
drop policy if exists missions_admin_update on public.missions;
create policy missions_admin_update on public.missions for update to authenticated
  using ((select public.is_studio_admin())) with check ((select public.is_studio_admin()));
drop policy if exists missions_admin_delete on public.missions;
create policy missions_admin_delete on public.missions for delete to authenticated using ((select public.is_studio_admin()));
grant select on table public.missions to anon, authenticated;
grant insert, update, delete on table public.missions to authenticated;
grant all on table public.missions to service_role;

-- 2) andamento: uma linha por Companion × missão × período (uma vez = 'x'; diária = o dia; semanal = a semana)
create table if not exists public.companion_missions (
  companion_id uuid not null references public.companions(id) on delete cascade,
  mission text not null,
  period text not null,
  status text not null default 'ativa' check (status in ('ativa', 'concluida', 'abandonada')),
  accepted_at timestamptz not null default now(),
  delivered integer[] not null default '{}',
  completed_at timestamptz,
  primary key (companion_id, mission, period)
);
create index if not exists companion_missions_active_idx on public.companion_missions (companion_id) where status = 'ativa';
alter table public.companion_missions enable row level security;
grant all on table public.companion_missions to service_role;

-- 3) desbloqueios (variedades que só aparecem para quem concluiu certas missões)
alter table public.ecos_profile add column if not exists unlocks text[] not null default '{}';

-- 4) entregar materiais numa missão: tira da mochila e soma no objetivo na mesma transação, uma vez por pedido
create or replace function public.mission_deliver(
  p_request uuid, p_cid uuid, p_mission text, p_period text, p_idx integer, p_key text, p_qty integer, p_goal integer
) returns jsonb
language plpgsql set search_path = public as $$
declare r companion_missions; have integer; take integer; inbag integer; res jsonb;
begin
  if exists (select 1 from ecos_actions where request_id = p_request) then
    return (select result from ecos_actions where request_id = p_request) || jsonb_build_object('repeat', true);
  end if;
  select * into r from companion_missions where companion_id = p_cid and mission = p_mission and period = p_period for update;
  if not found or r.status <> 'ativa' then return jsonb_build_object('ok', false, 'reason', 'missao-inativa'); end if;
  have := coalesce(r.delivered[p_idx + 1], 0);
  take := least(greatest(p_qty, 0), p_goal - have);
  if take <= 0 then return jsonb_build_object('ok', false, 'reason', 'ja-completo'); end if;
  perform ecos_lock_profile(p_cid);
  select qty into inbag from ecos_bag where companion_id = p_cid and batch_key = p_key for update;
  if coalesce(inbag, 0) < take then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
  update ecos_bag set qty = qty - take, updated_at = now() where companion_id = p_cid and batch_key = p_key;
  update companion_missions set delivered[p_idx + 1] = have + take
  where companion_id = p_cid and mission = p_mission and period = p_period;
  -- posições vazias antes do índice viram 0
  update companion_missions set delivered = array(select coalesce(x, 0) from unnest(delivered) x)
  where companion_id = p_cid and mission = p_mission and period = p_period;
  res := jsonb_build_object('ok', true, 'accepted', take, 'delivered', have + take);
  insert into ecos_actions (request_id, companion_id, kind, status, result) values (p_request, p_cid, 'mission', 'done', res);
  return res;
end $$;

-- 5) concluir: passa de 'ativa' para 'concluida' uma vez só (os prêmios saem depois, com chaves idempotentes)
create or replace function public.mission_complete(p_cid uuid, p_mission text, p_period text, p_unlock text) returns jsonb
language plpgsql set search_path = public as $$
begin
  update companion_missions set status = 'concluida', completed_at = now()
  where companion_id = p_cid and mission = p_mission and period = p_period and status = 'ativa';
  if not found then return jsonb_build_object('ok', false, 'reason', 'missao-inativa'); end if;
  if p_unlock is not null then
    insert into ecos_profile (companion_id) values (p_cid) on conflict do nothing;
    update ecos_profile set unlocks = (select array(select distinct unnest(unlocks || array[p_unlock]))), updated_at = now() where companion_id = p_cid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.mission_deliver(uuid, uuid, text, text, integer, text, integer, integer), public.mission_complete(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mission_deliver(uuid, uuid, text, text, integer, text, integer, integer), public.mission_complete(uuid, text, text, text) to service_role;

-- 6) ecos_profile.seen: os recursos do mundo ("tipo@cx,cz#n") não entram (a coleta antiga acrescentava todo nó)
create or replace function public.ecos_profile_trim_seen() returns trigger
language plpgsql set search_path = public as $$
begin
  new.seen := array(select s from unnest(new.seen) s where position('@' in s) = 0);
  return new;
end $$;
drop trigger if exists ecos_profile_trim_seen on public.ecos_profile;
create trigger ecos_profile_trim_seen before update of seen on public.ecos_profile for each row execute function public.ecos_profile_trim_seen();
update public.ecos_profile set seen = seen where exists (select 1 from unnest(seen) s where position('@' in s) > 0);
