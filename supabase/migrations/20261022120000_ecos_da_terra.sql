-- Ecos da Terra (primeira entrega): coleta no Vale dos Ecos, mochila de materiais, cadeia de descoberta, jardim de
-- manejo e a obra comunitária Ponte do Riacho.
--
-- Aplicada no projeto em partes (ecos_da_terra_tables, ecos_fn_*), com o mesmo conteúdo deste arquivo.
--
-- Regras de segurança:
--  * O cliente nunca grava nestas tabelas: só lê o que é seu. Toda escrita passa pela função `refuge` (service_role)
--    e pelas funções abaixo, que fazem cada operação numa transação, com travas de linha.
--  * Toda ação tem um request_id (UUID gerado no cliente). Repetir o mesmo pedido (reconexão, clique duplo) devolve o
--    resultado guardado em vez de aplicar de novo.
--  * Mochila cheia rejeita a coleta inteira ANTES de gastar o recurso (nada se perde em silêncio).
--  * Contribuições para a obra são descontadas da mochila e somadas à obra na mesma transação, uma única vez.

create table if not exists public.ecos_profile (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  tools text[] not null default '{faca,machado,picareta}',
  seen text[] not null default '{}',
  known_materials text[] not null default '{}',
  techniques text[] not null default '{}',
  chain jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.ecos_bag (
  companion_id uuid not null references public.companions(id) on delete cascade,
  batch_key text not null check (char_length(batch_key) between 1 and 120),
  qty integer not null check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (companion_id, batch_key)
);

-- disponibilidade INDIVIDUAL dos nós (cada pessoa tem o seu vale; sem disputa de recurso comum)
create table if not exists public.ecos_nodes (
  companion_id uuid not null references public.companions(id) on delete cascade,
  node_id text not null,
  amount numeric not null,
  at timestamptz not null default now(),
  primary key (companion_id, node_id)
);

create table if not exists public.ecos_actions (
  request_id uuid primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  kind text not null,
  node_id text,
  approach text,
  started_at timestamptz not null default now(),
  status text not null default 'running' check (status in ('running', 'done', 'rejected')),
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ecos_actions_companion_idx on public.ecos_actions (companion_id, created_at desc);

create table if not exists public.ecos_sites (
  companion_id uuid not null references public.companions(id) on delete cascade,
  site_id text not null,
  stored numeric not null default 0,
  at timestamptz not null default now(),
  cared_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (companion_id, site_id)
);

-- obra COMPARTILHADA por todos os jogadores
create table if not exists public.ecos_projects (
  project_id text primary key,
  stage integer not null default 0,
  progress integer[] not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ecos_contributions (
  id bigserial primary key,
  request_id uuid not null unique,
  project_id text not null,
  stage integer not null,
  need integer not null,
  companion_id uuid not null references public.companions(id) on delete cascade,
  batch_key text not null,
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now()
);
create index if not exists ecos_contrib_stage_idx on public.ecos_contributions (project_id, stage, companion_id);

alter table public.ecos_profile enable row level security;
alter table public.ecos_bag enable row level security;
alter table public.ecos_nodes enable row level security;
alter table public.ecos_actions enable row level security;
alter table public.ecos_sites enable row level security;
alter table public.ecos_projects enable row level security;
alter table public.ecos_contributions enable row level security;

create policy ecos_profile_read on public.ecos_profile for select to authenticated using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy ecos_bag_read on public.ecos_bag for select to authenticated using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy ecos_nodes_read on public.ecos_nodes for select to authenticated using ((select public.owns_companion(companion_id)));
create policy ecos_actions_read on public.ecos_actions for select to authenticated using ((select public.owns_companion(companion_id)));
create policy ecos_sites_read on public.ecos_sites for select to authenticated using ((select public.owns_companion(companion_id)));
create policy ecos_projects_read on public.ecos_projects for select to authenticated using (true);
create policy ecos_contrib_read on public.ecos_contributions for select to authenticated using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));

grant select on public.ecos_profile, public.ecos_bag, public.ecos_nodes, public.ecos_actions, public.ecos_sites, public.ecos_projects, public.ecos_contributions to authenticated;
grant all on public.ecos_profile, public.ecos_bag, public.ecos_nodes, public.ecos_actions, public.ecos_sites, public.ecos_projects, public.ecos_contributions to service_role;
grant usage, select on sequence public.ecos_contributions_id_seq to service_role;

alter table public.companion_memories drop constraint if exists companion_memories_origin_check;
alter table public.companion_memories add constraint companion_memories_origin_check
  check (origin = any (array['conversation', 'dream', 'correction', 'system', 'combat', 'ecos']));

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------

-- garante o perfil e trava a linha (serializa as operações de mochila de um mesmo Companion)
create or replace function public.ecos_lock_profile(p_cid uuid) returns void
language plpgsql set search_path = public as $$
begin
  insert into ecos_profile (companion_id) values (p_cid) on conflict do nothing;
  perform 1 from ecos_profile where companion_id = p_cid for update;
end $$;

create or replace function public.ecos_bag_used(p_cid uuid) returns integer
language sql stable set search_path = public as $$
  select coalesce(sum(qty), 0)::int from ecos_bag where companion_id = p_cid
$$;

-- soma/subtrai lotes ({key, qty}) — chamada dentro das funções abaixo, já com o perfil travado
create or replace function public.ecos_bag_add(p_cid uuid, p_items jsonb, p_sign integer) returns void
language plpgsql set search_path = public as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if p_sign > 0 then
      insert into ecos_bag (companion_id, batch_key, qty) values (p_cid, it->>'key', (it->>'qty')::int)
      on conflict (companion_id, batch_key) do update set qty = ecos_bag.qty + excluded.qty, updated_at = now();
    else
      update ecos_bag set qty = qty - (it->>'qty')::int, updated_at = now() where companion_id = p_cid and batch_key = it->>'key';
    end if;
  end loop;
  -- lotes zerados ficam com qty 0 (a leitura ignora)
end $$;

-- confere se a mochila tem todos os lotes pedidos
create or replace function public.ecos_bag_has(p_cid uuid, p_items jsonb) returns boolean
language sql stable set search_path = public as $$
  select coalesce(bool_and(coalesce(b.qty, 0) >= t.q), true)
  from (select it->>'key' as k, sum((it->>'qty')::int) as q from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it group by 1) t
  left join ecos_bag b on b.companion_id = p_cid and b.batch_key = t.k
$$;

create or replace function public.ecos_items_total(p_items jsonb) returns integer
language sql immutable as $$
  select coalesce(sum((it->>'qty')::int), 0)::int from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Coleta em duas fases: começar (marca o relógio do servidor) e terminar (confere tempo, abundância e mochila)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.ecos_start(p_request uuid, p_cid uuid, p_node text, p_approach text) returns jsonb
language plpgsql set search_path = public as $$
declare r ecos_actions;
begin
  insert into ecos_actions (request_id, companion_id, kind, node_id, approach) values (p_request, p_cid, 'gather', p_node, p_approach)
  on conflict (request_id) do nothing;
  select * into r from ecos_actions where request_id = p_request;
  if r.companion_id <> p_cid then return jsonb_build_object('ok', false, 'reason', 'pedido-invalido'); end if;
  return jsonb_build_object('ok', true, 'status', r.status, 'started_at', r.started_at, 'result', r.result);
end $$;

create or replace function public.ecos_finish_gather(
  p_request uuid, p_cid uuid, p_node text, p_approach text,
  p_cost numeric, p_cap numeric, p_regen numeric, p_min_seconds numeric, p_items jsonb, p_bag_cap integer
) returns jsonb
language plpgsql set search_path = public as $$
declare
  r ecos_actions; n ecos_nodes; cur numeric; used int; incoming int; res jsonb;
begin
  select * into r from ecos_actions where request_id = p_request for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nao-iniciada'); end if;
  if r.companion_id <> p_cid or r.kind <> 'gather' or r.node_id <> p_node or r.approach <> p_approach then
    return jsonb_build_object('ok', false, 'reason', 'pedido-invalido');
  end if;
  if r.status <> 'running' then return r.result || jsonb_build_object('repeat', true); end if;
  if extract(epoch from (now() - r.started_at)) < p_min_seconds then
    return jsonb_build_object('ok', false, 'reason', 'cedo', 'wait', p_min_seconds - extract(epoch from (now() - r.started_at)));
  end if;

  perform ecos_lock_profile(p_cid);
  insert into ecos_nodes (companion_id, node_id, amount, at) values (p_cid, p_node, p_cap, now()) on conflict do nothing;
  select * into n from ecos_nodes where companion_id = p_cid and node_id = p_node for update;
  cur := least(p_cap, n.amount + p_regen * extract(epoch from (now() - n.at)) / 3600.0);

  if cur < p_cost then
    res := jsonb_build_object('ok', false, 'reason', 'esgotado', 'amount', cur);
  else
    used := ecos_bag_used(p_cid); incoming := ecos_items_total(p_items);
    if used + incoming > p_bag_cap then
      res := jsonb_build_object('ok', false, 'reason', 'mochila-cheia', 'used', used, 'incoming', incoming, 'cap', p_bag_cap);
    else
      update ecos_nodes set amount = cur - p_cost, at = now() where companion_id = p_cid and node_id = p_node;
      perform ecos_bag_add(p_cid, p_items, 1);
      update ecos_profile set seen = (select array(select distinct unnest(seen || array[p_node]))),
        known_materials = (select array(select distinct unnest(known_materials || array(select split_part(it->>'key', '|', 1) from jsonb_array_elements(p_items) it)))),
        updated_at = now()
      where companion_id = p_cid;
      res := jsonb_build_object('ok', true, 'items', p_items, 'amount', cur - p_cost);
    end if;
  end if;
  update ecos_actions set status = case when (res->>'ok')::boolean then 'done' else 'rejected' end, result = res where request_id = p_request;
  return res;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Troca na mochila (fabricar): tira e dá lotes, opcionalmente uma ferramenta ou um item do inventário
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.ecos_bag_apply(
  p_request uuid, p_cid uuid, p_kind text, p_take jsonb, p_give jsonb, p_bag_cap integer, p_tool text, p_item jsonb
) returns jsonb
language plpgsql set search_path = public as $$
declare r ecos_actions; res jsonb; used int;
begin
  select * into r from ecos_actions where request_id = p_request;
  if found then
    if r.companion_id <> p_cid then return jsonb_build_object('ok', false, 'reason', 'pedido-invalido'); end if;
    return r.result || jsonb_build_object('repeat', true);
  end if;
  perform ecos_lock_profile(p_cid);
  if not ecos_bag_has(p_cid, p_take) then
    res := jsonb_build_object('ok', false, 'reason', 'faltam-materiais');
  else
    used := ecos_bag_used(p_cid) - ecos_items_total(p_take) + ecos_items_total(p_give);
    if used > p_bag_cap then
      res := jsonb_build_object('ok', false, 'reason', 'mochila-cheia');
    else
      perform ecos_bag_add(p_cid, p_take, -1);
      perform ecos_bag_add(p_cid, p_give, 1);
      if p_tool is not null then
        update ecos_profile set tools = (select array(select distinct unnest(tools || array[p_tool]))), updated_at = now() where companion_id = p_cid;
      end if;
      if p_item is not null then
        insert into companion_inventory (companion_id, item_key, qty, meta) values (p_cid, p_item->>'item_key', 1, coalesce(p_item->'meta', '{}'::jsonb))
        on conflict (companion_id, item_key) do update set qty = companion_inventory.qty + 1, meta = excluded.meta;
      end if;
      res := jsonb_build_object('ok', true, 'took', p_take, 'gave', p_give, 'tool', p_tool, 'item', p_item);
    end if;
  end if;
  insert into ecos_actions (request_id, companion_id, kind, status, result) values (p_request, p_cid, p_kind, case when (res->>'ok')::boolean then 'done' else 'rejected' end, res);
  return res;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Cadeia de descoberta: avançar (comparar-e-trocar) e concluir com a escolha (recompensa uma única vez)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.ecos_chain_advance(p_cid uuid, p_chain text, p_from integer) returns jsonb
language plpgsql set search_path = public as $$
declare cur int;
begin
  perform ecos_lock_profile(p_cid);
  select coalesce((chain->p_chain->>'step')::int, 0) into cur from ecos_profile where companion_id = p_cid;
  if cur <> p_from then return jsonb_build_object('ok', false, 'step', cur); end if;
  update ecos_profile set chain = jsonb_set(chain, array[p_chain], coalesce(chain->p_chain, '{}'::jsonb) || jsonb_build_object('step', p_from + 1, 'at', now())), updated_at = now()
  where companion_id = p_cid;
  return jsonb_build_object('ok', true, 'step', p_from + 1);
end $$;

create or replace function public.ecos_chain_finish(
  p_request uuid, p_cid uuid, p_chain text, p_steps integer, p_choice text, p_give jsonb, p_bag_cap integer, p_site text, p_technique text
) returns jsonb
language plpgsql set search_path = public as $$
declare r ecos_actions; c jsonb; res jsonb;
begin
  select * into r from ecos_actions where request_id = p_request;
  if found then return r.result || jsonb_build_object('repeat', true); end if;
  perform ecos_lock_profile(p_cid);
  select chain->p_chain into c from ecos_profile where companion_id = p_cid;
  if coalesce((c->>'step')::int, 0) < p_steps then
    res := jsonb_build_object('ok', false, 'reason', 'etapas-pendentes');
  elsif c ? 'completedAt' then
    res := jsonb_build_object('ok', false, 'reason', 'ja-concluida');
  elsif ecos_bag_used(p_cid) + ecos_items_total(p_give) > p_bag_cap then
    res := jsonb_build_object('ok', false, 'reason', 'mochila-cheia');
  else
    perform ecos_bag_add(p_cid, p_give, 1);
    update ecos_profile set chain = jsonb_set(chain, array[p_chain], c || jsonb_build_object('choice', p_choice, 'completedAt', now())),
      techniques = case when p_technique is null then techniques else (select array(select distinct unnest(techniques || array[p_technique]))) end,
      updated_at = now()
    where companion_id = p_cid;
    if p_site is not null then insert into ecos_sites (companion_id, site_id, stored, at) values (p_cid, p_site, 0, now()) on conflict do nothing; end if;
    res := jsonb_build_object('ok', true, 'choice', p_choice, 'gave', p_give, 'site', p_site);
  end if;
  insert into ecos_actions (request_id, companion_id, kind, status, result) values (p_request, p_cid, 'chain', case when (res->>'ok')::boolean then 'done' else 'rejected' end, res);
  return res;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Jardim (ponto de manejo): produção preguiçosa com teto, cuidado opcional que acelera, colheita idempotente
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.ecos_site_now(s ecos_sites, p_cap numeric, p_regen numeric, p_boost numeric, p_care_hours numeric) returns numeric
language plpgsql stable as $$
declare stored numeric := s.stored; t timestamptz := s.at; boost_end timestamptz; until timestamptz;
begin
  if s.cared_at is not null then
    boost_end := s.cared_at + make_interval(secs => p_care_hours * 3600);
    if boost_end > t then
      until := least(now(), boost_end);
      stored := stored + extract(epoch from (until - t)) / 3600.0 * p_regen * p_boost; t := until;
    end if;
  end if;
  if now() > t then stored := stored + extract(epoch from (now() - t)) / 3600.0 * p_regen; end if;
  return least(p_cap, stored);
end $$;

create or replace function public.ecos_site_harvest(
  p_request uuid, p_cid uuid, p_site text, p_cap numeric, p_regen numeric, p_boost numeric, p_care_hours numeric, p_max integer, p_key text, p_bag_cap integer
) returns jsonb
language plpgsql set search_path = public as $$
declare r ecos_actions; s ecos_sites; cur numeric; take int; free int; res jsonb;
begin
  select * into r from ecos_actions where request_id = p_request;
  if found then return r.result || jsonb_build_object('repeat', true); end if;
  perform ecos_lock_profile(p_cid);
  select * into s from ecos_sites where companion_id = p_cid and site_id = p_site for update;
  if not found then
    res := jsonb_build_object('ok', false, 'reason', 'sem-jardim');
  else
    cur := ecos_site_now(s, p_cap, p_regen, p_boost, p_care_hours);
    free := p_bag_cap - ecos_bag_used(p_cid);
    take := least(floor(cur)::int, p_max, free);
    if floor(cur) < 1 then res := jsonb_build_object('ok', false, 'reason', 'nada-pronto', 'stored', cur);
    elsif take < 1 then res := jsonb_build_object('ok', false, 'reason', 'mochila-cheia');
    else
      -- o que não coube fica no jardim (nada se perde)
      update ecos_sites set stored = cur - take, at = now(), cared_at = case when cared_at is not null and cared_at + make_interval(secs => p_care_hours * 3600) > now() then cared_at else null end
      where companion_id = p_cid and site_id = p_site;
      perform ecos_bag_add(p_cid, jsonb_build_array(jsonb_build_object('key', p_key, 'qty', take)), 1);
      res := jsonb_build_object('ok', true, 'items', jsonb_build_array(jsonb_build_object('key', p_key, 'qty', take)), 'left', cur - take);
    end if;
  end if;
  insert into ecos_actions (request_id, companion_id, kind, status, result) values (p_request, p_cid, 'site', case when (res->>'ok')::boolean then 'done' else 'rejected' end, res);
  return res;
end $$;

create or replace function public.ecos_site_care(p_cid uuid, p_site text, p_cap numeric, p_regen numeric, p_boost numeric, p_care_hours numeric, p_cooldown_hours numeric) returns jsonb
language plpgsql set search_path = public as $$
declare s ecos_sites; cur numeric;
begin
  select * into s from ecos_sites where companion_id = p_cid and site_id = p_site for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'sem-jardim'); end if;
  if s.cared_at is not null and s.cared_at + make_interval(secs => p_cooldown_hours * 3600) > now() then
    return jsonb_build_object('ok', false, 'reason', 'ja-cuidado', 'next', s.cared_at + make_interval(secs => p_cooldown_hours * 3600));
  end if;
  cur := ecos_site_now(s, p_cap, p_regen, p_boost, p_care_hours);
  update ecos_sites set stored = cur, at = now(), cared_at = now() where companion_id = p_cid and site_id = p_site;
  return jsonb_build_object('ok', true, 'stored', cur);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Obra comunitária: contribuição atômica (mochila → obra), metas e cota anti-monopólio
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.ecos_contribute(
  p_request uuid, p_cid uuid, p_project text, p_stage integer, p_need integer, p_key text, p_qty integer,
  p_goals integer[], p_next_goals integer[], p_stages integer, p_cap_total integer, p_cap_hours numeric
) returns jsonb
language plpgsql set search_path = public as $$
declare
  prev ecos_contributions; pj ecos_projects; have int; mine int; missing int; cap_left int; acc int; res jsonb; done boolean; contributors uuid[];
begin
  select * into prev from ecos_contributions where request_id = p_request;
  if found then return jsonb_build_object('ok', true, 'accepted', prev.qty, 'repeat', true); end if;
  perform 1 from ecos_actions where request_id = p_request;
  if found then return (select result from ecos_actions where request_id = p_request) || jsonb_build_object('repeat', true); end if;

  insert into ecos_projects (project_id, stage, progress) values (p_project, 0, array_fill(0, array[coalesce(array_length(p_goals, 1), 1)])) on conflict do nothing;
  select * into pj from ecos_projects where project_id = p_project for update;
  perform ecos_lock_profile(p_cid);

  if pj.completed_at is not null then res := jsonb_build_object('ok', false, 'reason', 'obra-concluida');
  elsif pj.stage <> p_stage then res := jsonb_build_object('ok', false, 'reason', 'etapa-mudou', 'stage', pj.stage);
  else
    select qty into have from ecos_bag where companion_id = p_cid and batch_key = p_key;
    have := coalesce(have, 0);
    select coalesce(sum(qty), 0) into mine from ecos_contributions where project_id = p_project and stage = p_stage and companion_id = p_cid;
    missing := greatest(0, p_goals[p_need + 1] - coalesce(pj.progress[p_need + 1], 0));
    cap_left := case when now() - pj.started_at >= make_interval(secs => p_cap_hours * 3600) then 2147483647 else greatest(0, p_cap_total - mine) end;
    acc := least(p_qty, have, missing, cap_left);
    if have < 1 then res := jsonb_build_object('ok', false, 'reason', 'faltam-materiais');
    elsif missing < 1 then res := jsonb_build_object('ok', false, 'reason', 'ja-completo');
    elsif acc < 1 then res := jsonb_build_object('ok', false, 'reason', 'cota-pessoal', 'mine', mine, 'cap', p_cap_total);
    else
      update ecos_bag set qty = qty - acc, updated_at = now() where companion_id = p_cid and batch_key = p_key;
      pj.progress[p_need + 1] := coalesce(pj.progress[p_need + 1], 0) + acc;
      insert into ecos_contributions (request_id, project_id, stage, need, companion_id, batch_key, qty) values (p_request, p_project, p_stage, p_need, p_cid, p_key, acc);
      done := true;
      for i in 1 .. coalesce(array_length(p_goals, 1), 0) loop
        if coalesce(pj.progress[i], 0) < p_goals[i] then done := false; end if;
      end loop;
      if done then
        select array_agg(distinct companion_id) into contributors from ecos_contributions where project_id = p_project and stage = p_stage;
        if p_stage + 1 >= p_stages then
          update ecos_projects set progress = pj.progress, completed_at = now(), stage = p_stage + 1, updated_at = now() where project_id = p_project;
        else
          update ecos_projects set stage = p_stage + 1, progress = array_fill(0, array[coalesce(array_length(p_next_goals, 1), 1)]), started_at = now(), updated_at = now() where project_id = p_project;
        end if;
      else
        update ecos_projects set progress = pj.progress, updated_at = now() where project_id = p_project;
      end if;
      res := jsonb_build_object('ok', true, 'accepted', acc, 'stageDone', done, 'contributors', to_jsonb(coalesce(contributors, '{}')));
    end if;
  end if;
  if not (res->>'ok')::boolean then
    insert into ecos_actions (request_id, companion_id, kind, status, result) values (p_request, p_cid, 'contribute', 'rejected', res);
  end if;
  return res;
end $$;

revoke execute on function public.ecos_lock_profile(uuid), public.ecos_bag_used(uuid), public.ecos_bag_add(uuid, jsonb, integer), public.ecos_bag_has(uuid, jsonb),
  public.ecos_items_total(jsonb), public.ecos_site_now(public.ecos_sites, numeric, numeric, numeric, numeric),
  public.ecos_start(uuid, uuid, text, text), public.ecos_finish_gather(uuid, uuid, text, text, numeric, numeric, numeric, numeric, jsonb, integer),
  public.ecos_bag_apply(uuid, uuid, text, jsonb, jsonb, integer, text, jsonb), public.ecos_chain_advance(uuid, text, integer),
  public.ecos_chain_finish(uuid, uuid, text, integer, text, jsonb, integer, text, text),
  public.ecos_site_harvest(uuid, uuid, text, numeric, numeric, numeric, numeric, integer, text, integer),
  public.ecos_site_care(uuid, text, numeric, numeric, numeric, numeric, numeric),
  public.ecos_contribute(uuid, uuid, text, integer, integer, text, integer, integer[], integer[], integer, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.ecos_lock_profile(uuid), public.ecos_bag_used(uuid), public.ecos_bag_add(uuid, jsonb, integer), public.ecos_bag_has(uuid, jsonb),
  public.ecos_items_total(jsonb), public.ecos_site_now(public.ecos_sites, numeric, numeric, numeric, numeric),
  public.ecos_start(uuid, uuid, text, text), public.ecos_finish_gather(uuid, uuid, text, text, numeric, numeric, numeric, numeric, jsonb, integer),
  public.ecos_bag_apply(uuid, uuid, text, jsonb, jsonb, integer, text, jsonb), public.ecos_chain_advance(uuid, text, integer),
  public.ecos_chain_finish(uuid, uuid, text, integer, text, jsonb, integer, text, text),
  public.ecos_site_harvest(uuid, uuid, text, numeric, numeric, numeric, numeric, integer, text, integer),
  public.ecos_site_care(uuid, text, numeric, numeric, numeric, numeric, numeric),
  public.ecos_contribute(uuid, uuid, text, integer, integer, text, integer, integer[], integer[], integer, integer, numeric)
  to service_role;
