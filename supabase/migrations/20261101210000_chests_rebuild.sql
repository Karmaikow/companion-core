-- Baús de drop e a reconstrução de Áster (regras em shared/rules/chests.ts).
--  - companion_chests: o baú que o monstro deixou (conteúdo sorteado no servidor); abrir põe tudo na bolsa uma vez.
--  - city_rebuild: o estado de Áster (normal/destruída), a rodada e o progresso da reconstrução (meta do servidor
--    inteiro: Cristais Ápice, materiais da coleta e Lumes). Quem joga lê; só a função `refuge` escreve.
--  - city_rebuild_give: entrega atômica na Torre Central (tira da bolsa/mochila/Lumes e soma na meta, uma vez por pedido).

create table if not exists public.companion_chests (
  id uuid primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  creature text not null,
  tier text not null check (tier in ('comum', 'raro', 'lendario')),
  x numeric not null,
  z numeric not null,
  contents jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  opened_at timestamptz
);
create index if not exists companion_chests_open_idx on public.companion_chests (companion_id, created_at desc) where opened_at is null;
alter table public.companion_chests enable row level security;
grant all on table public.companion_chests to service_role;

create table if not exists public.city_rebuild (
  city text primary key check (city ~ '^[a-z0-9-]{2,40}$'),
  state text not null default 'normal' check (state in ('normal', 'destruida')),
  round integer not null default 0,
  progress jsonb not null default '{"crystals":0,"lumes":0,"materials":[]}'::jsonb,
  destroyed_at timestamptz,
  rebuilt_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.city_rebuild enable row level security;
drop policy if exists city_rebuild_read on public.city_rebuild;
create policy city_rebuild_read on public.city_rebuild for select to anon, authenticated using (true);
grant select on table public.city_rebuild to anon, authenticated;
grant all on table public.city_rebuild to service_role;
insert into public.city_rebuild (city) values ('aster') on conflict do nothing;

create table if not exists public.city_rebuild_contrib (
  request_id uuid primary key,
  city text not null,
  round integer not null,
  companion_id uuid not null references public.companions(id) on delete cascade,
  kind text not null check (kind in ('cristal', 'lumes', 'material')),
  idx integer not null default 0,
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now()
);
create index if not exists city_rebuild_contrib_round_idx on public.city_rebuild_contrib (city, round);
alter table public.city_rebuild_contrib enable row level security;
grant all on table public.city_rebuild_contrib to service_role;

-- p_goals: {"crystals": n, "lumes": n, "materials": [n, n, ...]} (a meta atual do Admin)
create or replace function public.city_rebuild_give(
  p_request uuid, p_cid uuid, p_city text, p_round integer, p_kind text, p_idx integer, p_key text, p_qty integer, p_goals jsonb
) returns jsonb
language plpgsql set search_path = public as $$
declare cr city_rebuild; pg jsonb; goal integer; have integer; take integer; inbag integer; pr pacto_profile;
        mats jsonb; i integer; done boolean; who uuid[];
begin
  if exists (select 1 from city_rebuild_contrib where request_id = p_request) then
    return jsonb_build_object('ok', true, 'repeat', true);
  end if;
  select * into cr from city_rebuild where city = p_city for update;
  if not found or cr.state <> 'destruida' then return jsonb_build_object('ok', false, 'reason', 'cidade-de-pe'); end if;
  if cr.round <> p_round then return jsonb_build_object('ok', false, 'reason', 'rodada-mudou'); end if;
  pg := cr.progress;
  if p_kind = 'cristal' then goal := (p_goals->>'crystals')::int; have := coalesce((pg->>'crystals')::int, 0);
  elsif p_kind = 'lumes' then goal := (p_goals->>'lumes')::int; have := coalesce((pg->>'lumes')::int, 0);
  elsif p_kind = 'material' and p_idx >= 0 and p_idx < jsonb_array_length(p_goals->'materials') then
    goal := (p_goals->'materials'->>p_idx)::int; have := coalesce((pg->'materials'->>p_idx)::int, 0);
  else return jsonb_build_object('ok', false, 'reason', 'pedido-invalido'); end if;
  take := least(greatest(p_qty, 0), goal - have);
  if take <= 0 then return jsonb_build_object('ok', false, 'reason', 'ja-completo'); end if;

  -- tira de onde vem (tudo conferido antes de mudar)
  if p_kind = 'cristal' then
    select qty into inbag from companion_inventory where companion_id = p_cid and item_key = 'cristal-apice' for update;
    if coalesce(inbag, 0) < take then return jsonb_build_object('ok', false, 'reason', 'faltam-cristais'); end if;
    update companion_inventory set qty = qty - take where companion_id = p_cid and item_key = 'cristal-apice';
  elsif p_kind = 'lumes' then
    pr := pacto_lock(p_cid);
    if pr.lumes < take then return jsonb_build_object('ok', false, 'reason', 'sem-lumes'); end if;
    update pacto_profile set lumes = lumes - take, updated_at = now() where companion_id = p_cid;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_request, p_cid, -take, 'reconstrucao', p_city);
  else
    perform ecos_lock_profile(p_cid);
    select qty into inbag from ecos_bag where companion_id = p_cid and batch_key = p_key for update;
    if coalesce(inbag, 0) < take then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
    update ecos_bag set qty = qty - take, updated_at = now() where companion_id = p_cid and batch_key = p_key;
  end if;

  -- soma na meta
  if p_kind = 'cristal' then pg := jsonb_set(pg, '{crystals}', to_jsonb(have + take));
  elsif p_kind = 'lumes' then pg := jsonb_set(pg, '{lumes}', to_jsonb(have + take));
  else
    mats := coalesce(pg->'materials', '[]'::jsonb);
    while jsonb_array_length(mats) <= p_idx loop mats := mats || to_jsonb(0); end loop;
    mats := jsonb_set(mats, array[p_idx::text], to_jsonb(have + take));
    pg := jsonb_set(pg, '{materials}', mats);
  end if;
  insert into city_rebuild_contrib (request_id, city, round, companion_id, kind, idx, qty) values (p_request, p_city, p_round, p_cid, p_kind, p_idx, take);

  -- meta completa? a cidade volta ao normal
  done := coalesce((pg->>'crystals')::int, 0) >= (p_goals->>'crystals')::int and coalesce((pg->>'lumes')::int, 0) >= (p_goals->>'lumes')::int;
  if done then
    for i in 0 .. jsonb_array_length(p_goals->'materials') - 1 loop
      if coalesce((pg->'materials'->>i)::int, 0) < (p_goals->'materials'->>i)::int then done := false; end if;
    end loop;
  end if;
  update city_rebuild set progress = pg, updated_at = now(),
    state = case when done then 'normal' else state end, rebuilt_at = case when done then now() else rebuilt_at end
  where city = p_city;
  if done then
    select array_agg(distinct companion_id) into who from city_rebuild_contrib where city = p_city and round = p_round;
  end if;
  return jsonb_build_object('ok', true, 'accepted', take, 'done', done, 'contributors', coalesce(to_jsonb(who), '[]'::jsonb));
end $$;

revoke execute on function public.city_rebuild_give(uuid, uuid, text, integer, text, integer, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.city_rebuild_give(uuid, uuid, text, integer, text, integer, text, integer, jsonb) to service_role;
