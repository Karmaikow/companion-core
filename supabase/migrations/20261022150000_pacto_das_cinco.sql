-- Pacto das Cinco — Ofícios da Criação (primeira entrega).
-- Aplicada no projeto em partes (pacto_tables, pacto_fn_*), com o mesmo conteúdo deste arquivo.
--
-- Segurança: o cliente só LÊ o que é seu (RLS). Toda escrita passa pela função `refuge` (service_role) e por estas
-- funções, cada uma numa transação, com travas de linha e request_id/ids idempotentes. Materiais reservados saem
-- da mochila no início (não dá para gastar duas vezes) e voltam no cancelamento; Lumes sempre passam pelo livro-razão.
-- Observação: o executor de migrações deste projeto cancela comandos de remoção de linhas; nada aqui apaga linhas
-- (estados como 'reciclado', 'cancelada' e qty 0 marcam o fim).

-- ferramentas grátis do Ecos acabaram (ferramenta é equipamento: só a Forja Taurina conclui)
alter table public.ecos_profile alter column tools set default '{}';
update public.ecos_profile set tools = '{}';

create table if not exists public.pacto_profile (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  lumes bigint not null default 0 check (lumes >= 0),
  starter_given boolean not null default false,
  test_class text check (test_class in ('serpente', 'passaro', 'felino', 'touro', 'mistica')),
  updated_at timestamptz not null default now()
);

create table if not exists public.pacto_ledger (
  id bigserial primary key,
  request_id uuid not null unique,
  companion_id uuid not null references public.companions(id) on delete cascade,
  delta bigint not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists pacto_ledger_cid_idx on public.pacto_ledger (companion_id, created_at desc);

create table if not exists public.pacto_equipment (
  id uuid primary key,
  owner uuid not null references public.companions(id) on delete cascade,
  blueprint text not null,
  kind text not null check (kind in ('equipamento', 'ferramenta')),
  tool text,
  data jsonb not null,
  durability integer not null check (durability >= 0),
  max_durability integer not null check (max_durability >= 0),
  status text not null default 'ativo' check (status in ('ativo', 'reciclado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pacto_equipment_owner_idx on public.pacto_equipment (owner, status);

create table if not exists public.pacto_jobs (
  request_id uuid primary key,
  artisan uuid not null references public.companions(id) on delete cascade,
  kind text not null check (kind in ('forja', 'oficio')),
  ref text not null,
  order_id uuid,
  plan jsonb not null,
  reserved_bag jsonb not null default '[]'::jsonb,
  reserved_deposit jsonb not null default '[]'::jsonb,
  fee bigint not null default 0,
  seconds numeric not null,
  started_at timestamptz not null default now(),
  status text not null default 'running' check (status in ('running', 'done', 'cancelled')),
  result jsonb
);
create index if not exists pacto_jobs_running_idx on public.pacto_jobs (status, artisan);

create table if not exists public.pacto_orders (
  id uuid primary key,
  client uuid not null references public.companions(id) on delete cascade,
  artisan uuid references public.companions(id) on delete set null,
  blueprint text not null,
  requirements jsonb not null default '{}'::jsonb,
  deposit jsonb not null default '[]'::jsonb,
  substitutions boolean not null default false,
  payment bigint not null check (payment >= 0),
  deadline timestamptz not null,
  status text not null default 'aberta' check (status in ('aberta', 'aceita', 'em_forja', 'entregue', 'cancelada', 'expirada')),
  history jsonb not null default '[]'::jsonb,
  item uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pacto_orders_status_idx on public.pacto_orders (status, created_at desc);

create table if not exists public.pacto_board (
  id uuid primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  kind text not null check (kind in ('oportunidade', 'servico')),
  text text not null check (char_length(text) between 1 and 200),
  node_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.pacto_profile enable row level security;
alter table public.pacto_ledger enable row level security;
alter table public.pacto_equipment enable row level security;
alter table public.pacto_jobs enable row level security;
alter table public.pacto_orders enable row level security;
alter table public.pacto_board enable row level security;
create policy pacto_profile_read on public.pacto_profile for select to authenticated using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy pacto_ledger_read on public.pacto_ledger for select to authenticated using ((select public.owns_companion(companion_id)));
create policy pacto_equipment_read on public.pacto_equipment for select to authenticated using ((select public.owns_companion(owner)) or (select public.is_studio_admin()));
create policy pacto_jobs_read on public.pacto_jobs for select to authenticated using ((select public.owns_companion(artisan)));
-- o quadro é público (transparência): qualquer pessoa logada vê as encomendas e anúncios
create policy pacto_orders_read on public.pacto_orders for select to authenticated using (true);
create policy pacto_board_read on public.pacto_board for select to authenticated using (true);
grant select on public.pacto_profile, public.pacto_ledger, public.pacto_equipment, public.pacto_jobs, public.pacto_orders, public.pacto_board to authenticated;
grant all on public.pacto_profile, public.pacto_ledger, public.pacto_equipment, public.pacto_jobs, public.pacto_orders, public.pacto_board to service_role;
grant usage, select on sequence public.pacto_ledger_id_seq to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Lumes
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.pacto_lock(p_cid uuid) returns pacto_profile
language plpgsql set search_path = public as $$
declare r pacto_profile;
begin
  insert into pacto_profile (companion_id) values (p_cid) on conflict do nothing;
  select * into r from pacto_profile where companion_id = p_cid for update;
  return r;
end $$;

-- soma/subtrai Lumes uma vez por request_id; nunca deixa negativo
create or replace function public.pacto_lumes(p_request uuid, p_cid uuid, p_delta bigint, p_reason text, p_ref text) returns jsonb
language plpgsql set search_path = public as $$
declare pr pacto_profile;
begin
  if exists (select 1 from pacto_ledger where request_id = p_request) then return jsonb_build_object('ok', true, 'repeat', true); end if;
  pr := pacto_lock(p_cid);
  if pr.lumes + p_delta < 0 then return jsonb_build_object('ok', false, 'reason', 'sem-lumes', 'lumes', pr.lumes); end if;
  update pacto_profile set lumes = lumes + p_delta, updated_at = now() where companion_id = p_cid;
  insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_request, p_cid, p_delta, p_reason, p_ref);
  return jsonb_build_object('ok', true, 'lumes', pr.lumes + p_delta);
end $$;

-- bolsa do despertar: uma vez por Companion (origem declarada e finita)
create or replace function public.pacto_starter(p_cid uuid, p_amount bigint) returns jsonb
language plpgsql set search_path = public as $$
declare pr pacto_profile;
begin
  pr := pacto_lock(p_cid);
  if pr.starter_given then return jsonb_build_object('ok', false); end if;
  update pacto_profile set lumes = lumes + p_amount, starter_given = true, updated_at = now() where companion_id = p_cid;
  insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), p_cid, p_amount, 'bolsa-do-despertar', null);
  return jsonb_build_object('ok', true, 'lumes', pr.lumes + p_amount);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Trabalhos (ofício e forja): começar reserva materiais e taxa; terminar entrega; cancelar devolve
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.pacto_job_start(
  p_request uuid, p_cid uuid, p_kind text, p_ref text, p_plan jsonb, p_bag jsonb, p_deposit jsonb, p_order uuid,
  p_fee bigint, p_seconds numeric, p_slots integer, p_per_artisan integer
) returns jsonb
language plpgsql set search_path = public as $$
declare j pacto_jobs; pr pacto_profile; o pacto_orders; running int; mine int; it jsonb; have int; dep jsonb;
begin
  select * into j from pacto_jobs where request_id = p_request;
  if found then
    if j.artisan <> p_cid then return jsonb_build_object('ok', false, 'reason', 'pedido-invalido'); end if;
    return jsonb_build_object('ok', true, 'repeat', true, 'status', j.status, 'started_at', j.started_at, 'seconds', j.seconds);
  end if;
  perform ecos_lock_profile(p_cid);
  pr := pacto_lock(p_cid);
  if p_kind = 'forja' then
    select count(*) into running from pacto_jobs where status = 'running' and kind = 'forja';
    select count(*) into mine from pacto_jobs where status = 'running' and kind = 'forja' and artisan = p_cid;
    if running >= p_slots then return jsonb_build_object('ok', false, 'reason', 'oficina-cheia'); end if;
    if mine >= p_per_artisan then return jsonb_build_object('ok', false, 'reason', 'limite-artesao'); end if;
  end if;
  if not ecos_bag_has(p_cid, p_bag) then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
  if pr.lumes < p_fee then return jsonb_build_object('ok', false, 'reason', 'sem-lumes'); end if;
  if p_order is not null then
    select * into o from pacto_orders where id = p_order for update;
    if not found or o.artisan is distinct from p_cid or o.status not in ('aceita') then return jsonb_build_object('ok', false, 'reason', 'encomenda-invalida'); end if;
    dep := o.deposit;
    for it in select * from jsonb_array_elements(coalesce(p_deposit, '[]'::jsonb)) loop
      select coalesce(sum((d->>'qty')::int), 0) into have from jsonb_array_elements(dep) d where d->>'key' = it->>'key';
      if have < (it->>'qty')::int then return jsonb_build_object('ok', false, 'reason', 'deposito-insuficiente'); end if;
      dep := (select coalesce(jsonb_agg(case when d->>'key' = it->>'key' then jsonb_build_object('key', d->>'key', 'qty', (d->>'qty')::int - (it->>'qty')::int) else d end), '[]'::jsonb) from jsonb_array_elements(dep) d);
    end loop;
    update pacto_orders set deposit = dep, status = 'em_forja', updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'forja iniciada', 'by', p_cid)) where id = p_order;
  end if;
  perform ecos_bag_add(p_cid, p_bag, -1);
  if p_fee > 0 then
    update pacto_profile set lumes = lumes - p_fee, updated_at = now() where companion_id = p_cid;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_request, p_cid, -p_fee, 'nucleos-da-oficina', p_ref);
  end if;
  insert into pacto_jobs (request_id, artisan, kind, ref, order_id, plan, reserved_bag, reserved_deposit, fee, seconds)
  values (p_request, p_cid, p_kind, p_ref, p_order, p_plan, coalesce(p_bag, '[]'::jsonb), coalesce(p_deposit, '[]'::jsonb), p_fee, p_seconds);
  return jsonb_build_object('ok', true, 'status', 'running', 'started_at', now(), 'seconds', p_seconds);
end $$;

-- terminar: entrega o produto (lotes na mochila e/ou equipamento novo). Equipamento só se o servidor validou a classe.
create or replace function public.pacto_job_finish(
  p_request uuid, p_cid uuid, p_min_seconds numeric, p_give jsonb, p_equipment jsonb, p_bag_cap integer
) returns jsonb
language plpgsql set search_path = public as $$
declare j pacto_jobs; res jsonb; eid uuid;
begin
  select * into j from pacto_jobs where request_id = p_request for update;
  if not found or j.artisan <> p_cid then return jsonb_build_object('ok', false, 'reason', 'nao-iniciada'); end if;
  if j.status <> 'running' then return coalesce(j.result, jsonb_build_object('ok', false, 'reason', j.status)) || jsonb_build_object('repeat', true); end if;
  if extract(epoch from (now() - j.started_at)) < p_min_seconds then
    return jsonb_build_object('ok', false, 'reason', 'cedo', 'wait', p_min_seconds - extract(epoch from (now() - j.started_at)));
  end if;
  perform ecos_lock_profile(p_cid);
  if ecos_bag_used(p_cid) + ecos_items_total(p_give) > p_bag_cap then
    return jsonb_build_object('ok', false, 'reason', 'mochila-cheia');
  end if;
  perform ecos_bag_add(p_cid, p_give, 1);
  if p_equipment is not null then
    eid := (p_equipment->>'id')::uuid;
    insert into pacto_equipment (id, owner, blueprint, kind, tool, data, durability, max_durability)
    values (eid, p_cid, p_equipment->>'blueprint', p_equipment->>'kind', p_equipment->>'tool', p_equipment->'data', (p_equipment->>'durability')::int, (p_equipment->>'durability')::int);
    if j.order_id is not null then update pacto_orders set item = eid, updated_at = now(), history = history || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'peça forjada', 'by', p_cid)) where id = j.order_id; end if;
  end if;
  res := jsonb_build_object('ok', true, 'gave', p_give, 'equipment', eid);
  update pacto_jobs set status = 'done', result = res where request_id = p_request;
  return res;
end $$;

-- cancelar um trabalho em andamento: devolve materiais (mochila e depósito da encomenda) e a taxa
create or replace function public.pacto_job_cancel(p_request uuid, p_cid uuid) returns jsonb
language plpgsql set search_path = public as $$
declare j pacto_jobs; o pacto_orders; it jsonb; dep jsonb;
begin
  select * into j from pacto_jobs where request_id = p_request for update;
  if not found or j.artisan <> p_cid then return jsonb_build_object('ok', false, 'reason', 'nao-iniciada'); end if;
  if j.status <> 'running' then return jsonb_build_object('ok', false, 'reason', j.status); end if;
  perform ecos_lock_profile(p_cid);
  perform ecos_bag_add(p_cid, j.reserved_bag, 1);
  if j.fee > 0 then
    update pacto_profile set lumes = lumes + j.fee, updated_at = now() where companion_id = p_cid;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), p_cid, j.fee, 'nucleos-devolvidos', j.ref);
  end if;
  if j.order_id is not null then
    select * into o from pacto_orders where id = j.order_id for update;
    dep := o.deposit;
    for it in select * from jsonb_array_elements(j.reserved_deposit) loop
      dep := (select coalesce(jsonb_agg(case when d->>'key' = it->>'key' then jsonb_build_object('key', d->>'key', 'qty', (d->>'qty')::int + (it->>'qty')::int) else d end), '[]'::jsonb) from jsonb_array_elements(dep) d);
    end loop;
    update pacto_orders set deposit = dep, status = case when status = 'em_forja' then 'aceita' else status end, updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'forja interrompida (materiais devolvidos ao depósito)', 'by', p_cid)) where id = j.order_id;
  end if;
  update pacto_jobs set status = 'cancelled', result = jsonb_build_object('ok', false, 'reason', 'cancelada') where request_id = p_request;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Encomendas: criar (reserva), aceitar, entregar (só se cumprir), cancelar/expirar (devolução sem duplicar)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.pacto_order_create(
  p_id uuid, p_cid uuid, p_blueprint text, p_requirements jsonb, p_deposit jsonb, p_substitutions boolean, p_payment bigint, p_deadline timestamptz
) returns jsonb
language plpgsql set search_path = public as $$
declare pr pacto_profile;
begin
  if exists (select 1 from pacto_orders where id = p_id) then return jsonb_build_object('ok', true, 'repeat', true); end if;
  perform ecos_lock_profile(p_cid);
  pr := pacto_lock(p_cid);
  if not ecos_bag_has(p_cid, p_deposit) then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
  if pr.lumes < p_payment then return jsonb_build_object('ok', false, 'reason', 'sem-lumes'); end if;
  perform ecos_bag_add(p_cid, p_deposit, -1);
  update pacto_profile set lumes = lumes - p_payment, updated_at = now() where companion_id = p_cid;
  insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_id, p_cid, -p_payment, 'reserva-encomenda', p_id::text);
  insert into pacto_orders (id, client, blueprint, requirements, deposit, substitutions, payment, deadline, history)
  values (p_id, p_cid, p_blueprint, p_requirements, coalesce(p_deposit, '[]'::jsonb), p_substitutions, p_payment, p_deadline,
    jsonb_build_array(jsonb_build_object('at', now(), 'what', 'encomenda aberta', 'by', p_cid)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pacto_order_accept(p_id uuid, p_artisan uuid, p_max_active integer) returns jsonb
language plpgsql set search_path = public as $$
declare o pacto_orders; active int;
begin
  select * into o from pacto_orders where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nao-existe'); end if;
  if o.artisan = p_artisan and o.status in ('aceita', 'em_forja') then return jsonb_build_object('ok', true, 'repeat', true); end if;
  if o.status <> 'aberta' then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  if o.client = p_artisan then return jsonb_build_object('ok', false, 'reason', 'propria'); end if;
  if o.deadline < now() then return jsonb_build_object('ok', false, 'reason', 'expirada'); end if;
  select count(*) into active from pacto_orders where artisan = p_artisan and status in ('aceita', 'em_forja');
  if active >= p_max_active then return jsonb_build_object('ok', false, 'reason', 'limite-artesao'); end if;
  update pacto_orders set artisan = p_artisan, status = 'aceita', updated_at = now(),
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'aceita', 'by', p_artisan)) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pacto_order_deliver(p_id uuid, p_artisan uuid, p_item uuid, p_fee bigint, p_request uuid) returns jsonb
language plpgsql set search_path = public as $$
declare o pacto_orders; e pacto_equipment;
begin
  select * into o from pacto_orders where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nao-existe'); end if;
  if o.status = 'entregue' then return jsonb_build_object('ok', true, 'repeat', true); end if;
  if o.artisan is distinct from p_artisan or o.status not in ('aceita', 'em_forja') then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  select * into e from pacto_equipment where id = p_item for update;
  if not found or e.owner <> p_artisan or e.status <> 'ativo' or e.blueprint <> o.blueprint then return jsonb_build_object('ok', false, 'reason', 'peca-invalida'); end if;
  if exists (select 1 from pacto_jobs where order_id = p_id and status = 'running') then return jsonb_build_object('ok', false, 'reason', 'forja-em-andamento'); end if;
  perform ecos_lock_profile(o.client);
  -- peça para o cliente, sobra do depósito volta ao cliente, pagamento (menos a taxa) ao artesão
  update pacto_equipment set owner = o.client, updated_at = now(), data = jsonb_set(data, '{history}', coalesce(data->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'entregue por encomenda'))) where id = p_item;
  perform ecos_bag_add(o.client, (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(o.deposit) d where (d->>'qty')::int > 0), 1);
  perform pacto_lock(p_artisan);
  update pacto_profile set lumes = lumes + (o.payment - p_fee), updated_at = now() where companion_id = p_artisan;
  insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_request, p_artisan, o.payment - p_fee, 'pagamento-encomenda', p_id::text);
  update pacto_orders set status = 'entregue', item = p_item, deposit = '[]'::jsonb, updated_at = now(),
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'entregue (taxa ' || p_fee || ')', 'by', p_artisan)) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- cancelar/expirar: devolve depósito (inclusive o reservado por uma forja em andamento) e divide o pagamento
create or replace function public.pacto_order_cancel(p_id uuid, p_by uuid, p_status text, p_to_client bigint, p_to_artisan bigint, p_request uuid) returns jsonb
language plpgsql set search_path = public as $$
declare o pacto_orders; j pacto_jobs; dep jsonb; it jsonb;
begin
  select * into o from pacto_orders where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nao-existe'); end if;
  if o.status in ('cancelada', 'expirada') then return jsonb_build_object('ok', true, 'repeat', true); end if;
  if o.status = 'entregue' then return jsonb_build_object('ok', false, 'reason', 'ja-entregue'); end if;
  if p_to_client + p_to_artisan <> o.payment then return jsonb_build_object('ok', false, 'reason', 'divisao-invalida'); end if;
  dep := o.deposit;
  for j in select * from pacto_jobs where order_id = p_id and status = 'running' for update loop
    for it in select * from jsonb_array_elements(j.reserved_deposit) loop
      dep := (select coalesce(jsonb_agg(case when d->>'key' = it->>'key' then jsonb_build_object('key', d->>'key', 'qty', (d->>'qty')::int + (it->>'qty')::int) else d end), '[]'::jsonb) from jsonb_array_elements(dep) d);
    end loop;
    perform ecos_lock_profile(j.artisan);
    perform ecos_bag_add(j.artisan, j.reserved_bag, 1);
    update pacto_jobs set status = 'cancelled', result = jsonb_build_object('ok', false, 'reason', 'encomenda-cancelada') where request_id = j.request_id;
  end loop;
  perform ecos_lock_profile(o.client);
  perform ecos_bag_add(o.client, (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(dep) d where (d->>'qty')::int > 0), 1);
  perform pacto_lock(o.client);
  if p_to_client > 0 then
    update pacto_profile set lumes = lumes + p_to_client, updated_at = now() where companion_id = o.client;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_request, o.client, p_to_client, 'devolucao-encomenda', p_id::text);
  end if;
  if p_to_artisan > 0 and o.artisan is not null then
    perform pacto_lock(o.artisan);
    update pacto_profile set lumes = lumes + p_to_artisan, updated_at = now() where companion_id = o.artisan;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), o.artisan, p_to_artisan, 'compensacao-encomenda', p_id::text);
  end if;
  update pacto_orders set status = p_status, deposit = '[]'::jsonb, updated_at = now(),
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'what', p_status || ' (cliente ' || p_to_client || ', artesão ' || p_to_artisan || ')', 'by', p_by)) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Ciclo de vida: reparo com kit, reciclagem, desgaste, troca de dono só por encomenda
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.pacto_equipment_repair(p_cid uuid, p_item uuid, p_kit text, p_amount integer) returns jsonb
language plpgsql set search_path = public as $$
declare e pacto_equipment;
begin
  perform ecos_lock_profile(p_cid);
  select * into e from pacto_equipment where id = p_item for update;
  if not found or e.owner <> p_cid or e.status <> 'ativo' then return jsonb_build_object('ok', false, 'reason', 'peca-invalida'); end if;
  if e.durability >= e.max_durability then return jsonb_build_object('ok', false, 'reason', 'inteira'); end if;
  if not ecos_bag_has(p_cid, jsonb_build_array(jsonb_build_object('key', p_kit, 'qty', 1))) then return jsonb_build_object('ok', false, 'reason', 'sem-kit'); end if;
  perform ecos_bag_add(p_cid, jsonb_build_array(jsonb_build_object('key', p_kit, 'qty', 1)), -1);
  update pacto_equipment set durability = least(max_durability, durability + p_amount), updated_at = now() where id = p_item;
  return jsonb_build_object('ok', true, 'durability', least(e.max_durability, e.durability + p_amount));
end $$;

create or replace function public.pacto_equipment_recycle(p_cid uuid, p_item uuid, p_give jsonb, p_bag_cap integer) returns jsonb
language plpgsql set search_path = public as $$
declare e pacto_equipment;
begin
  perform ecos_lock_profile(p_cid);
  select * into e from pacto_equipment where id = p_item for update;
  if not found or e.owner <> p_cid then return jsonb_build_object('ok', false, 'reason', 'peca-invalida'); end if;
  if e.status <> 'ativo' then return jsonb_build_object('ok', true, 'repeat', true); end if;
  if ecos_bag_used(p_cid) + ecos_items_total(p_give) > p_bag_cap then return jsonb_build_object('ok', false, 'reason', 'mochila-cheia'); end if;
  perform ecos_bag_add(p_cid, p_give, 1);
  update pacto_equipment set status = 'reciclado', updated_at = now() where id = p_item;
  return jsonb_build_object('ok', true, 'gave', p_give);
end $$;

create or replace function public.pacto_equipment_wear(p_cid uuid, p_tool text, p_item uuid, p_amount integer) returns jsonb
language plpgsql set search_path = public as $$
declare e pacto_equipment;
begin
  if p_item is not null then
    select * into e from pacto_equipment where id = p_item and owner = p_cid and status = 'ativo' and durability > 0 for update;
  else
    select * into e from pacto_equipment where owner = p_cid and status = 'ativo' and kind = 'ferramenta' and tool = p_tool and durability > 0 order by durability asc limit 1 for update;
  end if;
  if not found then return jsonb_build_object('ok', false); end if;
  update pacto_equipment set durability = greatest(0, durability - p_amount), updated_at = now() where id = e.id;
  return jsonb_build_object('ok', true, 'id', e.id, 'durability', greatest(0, e.durability - p_amount));
end $$;

create or replace function public.pacto_equipment_update(p_cid uuid, p_item uuid, p_data jsonb, p_take jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare e pacto_equipment;
begin
  perform ecos_lock_profile(p_cid);
  select * into e from pacto_equipment where id = p_item for update;
  if not found or e.owner <> p_cid or e.status <> 'ativo' then return jsonb_build_object('ok', false, 'reason', 'peca-invalida'); end if;
  if not ecos_bag_has(p_cid, p_take) then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
  perform ecos_bag_add(p_cid, p_take, -1);
  update pacto_equipment set data = p_data, updated_at = now() where id = p_item;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.pacto_lock(uuid), public.pacto_lumes(uuid, uuid, bigint, text, text), public.pacto_starter(uuid, bigint),
  public.pacto_job_start(uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, bigint, numeric, integer, integer),
  public.pacto_job_finish(uuid, uuid, numeric, jsonb, jsonb, integer), public.pacto_job_cancel(uuid, uuid),
  public.pacto_order_create(uuid, uuid, text, jsonb, jsonb, boolean, bigint, timestamptz), public.pacto_order_accept(uuid, uuid, integer),
  public.pacto_order_deliver(uuid, uuid, uuid, bigint, uuid), public.pacto_order_cancel(uuid, uuid, text, bigint, bigint, uuid),
  public.pacto_equipment_repair(uuid, uuid, text, integer), public.pacto_equipment_recycle(uuid, uuid, jsonb, integer),
  public.pacto_equipment_wear(uuid, text, uuid, integer), public.pacto_equipment_update(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.pacto_lock(uuid), public.pacto_lumes(uuid, uuid, bigint, text, text), public.pacto_starter(uuid, bigint),
  public.pacto_job_start(uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, bigint, numeric, integer, integer),
  public.pacto_job_finish(uuid, uuid, numeric, jsonb, jsonb, integer), public.pacto_job_cancel(uuid, uuid),
  public.pacto_order_create(uuid, uuid, text, jsonb, jsonb, boolean, bigint, timestamptz), public.pacto_order_accept(uuid, uuid, integer),
  public.pacto_order_deliver(uuid, uuid, uuid, bigint, uuid), public.pacto_order_cancel(uuid, uuid, text, bigint, bigint, uuid),
  public.pacto_equipment_repair(uuid, uuid, text, integer), public.pacto_equipment_recycle(uuid, uuid, jsonb, integer),
  public.pacto_equipment_wear(uuid, text, uuid, integer), public.pacto_equipment_update(uuid, uuid, jsonb, jsonb)
  to service_role;
