-- Mural de trocas (Casa dos Ecos): regras em shared/rules/trade.ts. A oferta fica em garantia ao abrir o pedido;
-- aceitar move as duas partes numa transação só; cancelar ou vencer devolve a garantia. Só a função `refuge` escreve.

create table if not exists public.trade_orders (
  id uuid primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  status text not null default 'aberta' check (status in ('aberta', 'concluida', 'cancelada', 'vencida')),
  offer jsonb not null,   -- {kind:'material', key, qty} | {kind:'lumes', qty}
  want jsonb not null,    -- {kind:'material', material, prop?, min?, qty} | {kind:'lumes', qty}
  fee integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  filled_by uuid references public.companions(id) on delete set null,
  closed_at timestamptz
);
create index if not exists trade_orders_open_idx on public.trade_orders (created_at desc) where status = 'aberta';
create index if not exists trade_orders_owner_idx on public.trade_orders (companion_id, status);
alter table public.trade_orders enable row level security;
grant all on table public.trade_orders to service_role;

-- devolve a garantia de um pedido (uso interno)
create or replace function public.trade_refund(o trade_orders) returns void
language plpgsql set search_path = public as $$
begin
  if o.offer->>'kind' = 'lumes' then
    perform pacto_lock(o.companion_id);
    update pacto_profile set lumes = lumes + (o.offer->>'qty')::bigint, updated_at = now() where companion_id = o.companion_id;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), o.companion_id, (o.offer->>'qty')::bigint, 'troca-devolvida', o.id::text);
  else
    perform ecos_bag_add(o.companion_id, jsonb_build_array(jsonb_build_object('key', o.offer->>'key', 'qty', (o.offer->>'qty')::int)), 1);
  end if;
end $$;

-- abrir: confere o limite, cobra a taxa e guarda a oferta (tudo ou nada; o mesmo id não abre duas vezes)
create or replace function public.trade_post(
  p_id uuid, p_cid uuid, p_offer jsonb, p_want jsonb, p_fee integer, p_hours integer, p_max_open integer
) returns jsonb
language plpgsql set search_path = public as $$
declare pr pacto_profile; open_n integer; need_lumes bigint; inbag integer;
begin
  if exists (select 1 from trade_orders where id = p_id) then return jsonb_build_object('ok', true, 'repeat', true); end if;
  select count(*) into open_n from trade_orders where companion_id = p_cid and status = 'aberta' and expires_at > now();
  if open_n >= p_max_open then return jsonb_build_object('ok', false, 'reason', 'muitos-pedidos'); end if;
  pr := pacto_lock(p_cid);
  need_lumes := p_fee + case when p_offer->>'kind' = 'lumes' then (p_offer->>'qty')::bigint else 0 end;
  if pr.lumes < need_lumes then return jsonb_build_object('ok', false, 'reason', 'sem-lumes'); end if;
  if p_offer->>'kind' = 'material' then
    perform ecos_lock_profile(p_cid);
    select qty into inbag from ecos_bag where companion_id = p_cid and batch_key = p_offer->>'key' for update;
    if coalesce(inbag, 0) < (p_offer->>'qty')::int then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
    update ecos_bag set qty = qty - (p_offer->>'qty')::int, updated_at = now() where companion_id = p_cid and batch_key = p_offer->>'key';
  end if;
  if need_lumes > 0 then
    update pacto_profile set lumes = lumes - need_lumes, updated_at = now() where companion_id = p_cid;
    if p_fee > 0 then insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), p_cid, -p_fee, 'troca-taxa', p_id::text); end if;
    if need_lumes > p_fee then insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_id, p_cid, -(need_lumes - p_fee), 'troca-garantia', p_id::text); end if;
  end if;
  insert into trade_orders (id, companion_id, offer, want, fee, expires_at) values (p_id, p_cid, p_offer, p_want, p_fee, now() + make_interval(hours => p_hours));
  return jsonb_build_object('ok', true);
end $$;

-- aceitar: quem aceita entrega o pedido (os lotes já conferidos pela função) e leva a oferta
create or replace function public.trade_fill(p_order uuid, p_cid uuid, p_picks jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare o trade_orders; pr pacto_profile; it jsonb; inbag integer; q bigint;
begin
  select * into o from trade_orders where id = p_order for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'pedido-sumiu'); end if;
  if o.status <> 'aberta' or o.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'pedido-fechado'); end if;
  if o.companion_id = p_cid then return jsonb_build_object('ok', false, 'reason', 'proprio'); end if;
  -- quem aceita entrega o que foi pedido
  if o.want->>'kind' = 'lumes' then
    q := (o.want->>'qty')::bigint;
    pr := pacto_lock(p_cid);
    if pr.lumes < q then return jsonb_build_object('ok', false, 'reason', 'sem-lumes'); end if;
    update pacto_profile set lumes = lumes - q, updated_at = now() where companion_id = p_cid;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), p_cid, -q, 'troca', o.id::text);
    perform pacto_lock(o.companion_id);
    update pacto_profile set lumes = lumes + q, updated_at = now() where companion_id = o.companion_id;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), o.companion_id, q, 'troca', o.id::text);
  else
    perform ecos_lock_profile(p_cid);
    for it in select * from jsonb_array_elements(p_picks) loop
      select qty into inbag from ecos_bag where companion_id = p_cid and batch_key = it->>'key' for update;
      if coalesce(inbag, 0) < (it->>'qty')::int then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
    end loop;
    perform ecos_bag_add(p_cid, p_picks, -1);
    perform ecos_bag_add(o.companion_id, p_picks, 1);
  end if;
  -- e leva a oferta (que estava em garantia)
  if o.offer->>'kind' = 'lumes' then
    q := (o.offer->>'qty')::bigint;
    perform pacto_lock(p_cid);
    update pacto_profile set lumes = lumes + q, updated_at = now() where companion_id = p_cid;
    insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), p_cid, q, 'troca', o.id::text);
  else
    perform ecos_bag_add(p_cid, jsonb_build_array(jsonb_build_object('key', o.offer->>'key', 'qty', (o.offer->>'qty')::int)), 1);
  end if;
  update trade_orders set status = 'concluida', filled_by = p_cid, closed_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'owner', o.companion_id);
end $$;

-- cancelar: só o dono, só aberto; a garantia volta (a taxa não)
create or replace function public.trade_cancel(p_order uuid, p_cid uuid) returns jsonb
language plpgsql set search_path = public as $$
declare o trade_orders;
begin
  select * into o from trade_orders where id = p_order and companion_id = p_cid for update;
  if not found or o.status <> 'aberta' then return jsonb_build_object('ok', false, 'reason', 'pedido-fechado'); end if;
  update trade_orders set status = 'cancelada', closed_at = now() where id = o.id;
  perform trade_refund(o);
  return jsonb_build_object('ok', true);
end $$;

-- vencidos: fecha e devolve a garantia (chamado ao ler o mural)
create or replace function public.trade_expire() returns integer
language plpgsql set search_path = public as $$
declare o trade_orders; n integer := 0;
begin
  for o in select * from trade_orders where status = 'aberta' and expires_at <= now() for update skip locked loop
    update trade_orders set status = 'vencida', closed_at = now() where id = o.id;
    perform trade_refund(o);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.trade_refund(trade_orders), public.trade_post(uuid, uuid, jsonb, jsonb, integer, integer, integer),
  public.trade_fill(uuid, uuid, jsonb), public.trade_cancel(uuid, uuid), public.trade_expire() from public, anon, authenticated;
grant execute on function public.trade_refund(trade_orders), public.trade_post(uuid, uuid, jsonb, jsonb, integer, integer, integer),
  public.trade_fill(uuid, uuid, jsonb), public.trade_cancel(uuid, uuid), public.trade_expire() to service_role;
