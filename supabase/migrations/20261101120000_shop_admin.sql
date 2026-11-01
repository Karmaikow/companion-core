-- Lojas pelo Administrador: preços, itens e limites ficam em game_config.values.shop (aba Lojas).
-- Aqui: o estoque diário global do Mercadão (quanto o servidor inteiro já comprou de cada item hoje) e a troca
-- atômica que confere esse estoque junto com Lumes, bolsa e mochila.

create table if not exists public.shop_stock (
  day text not null,          -- dia do Mercadão (horário de Brasília, AAAA-MM-DD)
  entry text not null,        -- id da entrada na configuração
  sold integer not null default 0 check (sold >= 0),
  primary key (day, entry)
);
alter table public.shop_stock enable row level security;
drop policy if exists shop_stock_read on public.shop_stock;
create policy shop_stock_read on public.shop_stock for select to authenticated using (true);
grant select on public.shop_stock to authenticated;
grant all on public.shop_stock to service_role;

-- shop_trade v3: + p_stock {day, entry, qty, max} (max 0 = sem limite). Substitui as versões anteriores.
drop function if exists public.shop_trade(uuid, uuid, bigint, text, jsonb, jsonb, jsonb);
drop function if exists public.shop_trade(uuid, uuid, bigint, text, jsonb, jsonb, jsonb, text);
create or replace function public.shop_trade(
  p_request uuid,
  p_cid uuid,
  p_delta bigint,   -- Lumes: negativo na compra, positivo na venda, 0 no preparo
  p_ref text,
  p_inv jsonb,      -- bolsa: [{key, qty (+ entra, - sai), meta}]
  p_bag jsonb,      -- mochila do Vale: lotes [{key, qty}] que saem
  p_equip jsonb,    -- ferramenta comprada: {id, blueprint, tool, durability, data} ou null
  p_reason text default null,
  p_stock jsonb default null
) returns jsonb
language plpgsql set search_path = public as $$
declare pr pacto_profile; it jsonb; have integer; dur integer; st shop_stock;
begin
  if exists (select 1 from pacto_ledger where request_id = p_request) then return jsonb_build_object('ok', true, 'repeat', true); end if;
  pr := pacto_lock(p_cid);
  if pr.lumes + p_delta < 0 then return jsonb_build_object('ok', false, 'reason', 'sem-lumes'); end if;

  -- conferências (nada mudou ainda)
  if p_stock is not null and coalesce((p_stock->>'max')::int, 0) > 0 then
    insert into shop_stock (day, entry) values (p_stock->>'day', p_stock->>'entry') on conflict do nothing;
    select * into st from shop_stock where day = p_stock->>'day' and entry = p_stock->>'entry' for update;
    if st.sold + (p_stock->>'qty')::int > (p_stock->>'max')::int then return jsonb_build_object('ok', false, 'reason', 'esgotado'); end if;
  end if;
  if jsonb_array_length(coalesce(p_bag, '[]'::jsonb)) > 0 then
    perform ecos_lock_profile(p_cid);
    if not ecos_bag_has(p_cid, p_bag) then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_inv, '[]'::jsonb)) loop
    if (it->>'qty')::int < 0 then
      select qty into have from companion_inventory where companion_id = p_cid and item_key = it->>'key' for update;
      if coalesce(have, 0) + (it->>'qty')::int < 0 then return jsonb_build_object('ok', false, 'reason', 'sem-item'); end if;
    end if;
  end loop;

  -- gravação
  if p_stock is not null and coalesce((p_stock->>'max')::int, 0) > 0 then
    update shop_stock set sold = sold + (p_stock->>'qty')::int where day = p_stock->>'day' and entry = p_stock->>'entry';
  end if;
  if jsonb_array_length(coalesce(p_bag, '[]'::jsonb)) > 0 then perform ecos_bag_add(p_cid, p_bag, -1); end if;
  for it in select * from jsonb_array_elements(coalesce(p_inv, '[]'::jsonb)) loop
    if (it->>'qty')::int < 0 then
      update companion_inventory set qty = qty + (it->>'qty')::int where companion_id = p_cid and item_key = it->>'key';
    else
      insert into companion_inventory (companion_id, item_key, qty, meta) values (p_cid, it->>'key', least(9999, (it->>'qty')::int), coalesce(it->'meta', '{}'::jsonb))
      on conflict (companion_id, item_key) do update set qty = least(9999, companion_inventory.qty + excluded.qty), meta = companion_inventory.meta || excluded.meta, acquired_at = now();
    end if;
  end loop;
  if p_equip is not null then
    dur := greatest(1, (p_equip->>'durability')::int);
    insert into pacto_equipment (id, owner, blueprint, kind, tool, data, durability, max_durability)
    values ((p_equip->>'id')::uuid, p_cid, p_equip->>'blueprint', 'ferramenta', p_equip->>'tool', coalesce(p_equip->'data', '{}'::jsonb), dur, dur);
  end if;
  update pacto_profile set lumes = lumes + p_delta, updated_at = now() where companion_id = p_cid;
  insert into pacto_ledger (request_id, companion_id, delta, reason, ref)
  values (p_request, p_cid, p_delta, coalesce(p_reason, case when p_delta < 0 then 'loja-compra' else 'loja-venda' end), p_ref);
  return jsonb_build_object('ok', true, 'lumes', pr.lumes + p_delta);
end $$;

revoke execute on function public.shop_trade(uuid, uuid, bigint, text, jsonb, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.shop_trade(uuid, uuid, bigint, text, jsonb, jsonb, jsonb, text, jsonb) to service_role;
