-- Lojas de Áster (etapa 1): comprar e vender numa transação só, com a moeda do Pacto (Lumes pelo livro-razão).
--
-- Quem calcula preço e o que entra/sai é a função `refuge` (regras em shared/rules/shop.ts); aqui só se confere e
-- grava atomicamente: tudo é checado ANTES de mudar qualquer coisa, e o mesmo request_id não paga duas vezes.
-- Nada aqui apaga linhas (qty 0 marca o fim, como no resto do projeto).

create or replace function public.shop_trade(
  p_request uuid,
  p_cid uuid,
  p_delta bigint,   -- Lumes: negativo na compra, positivo na venda
  p_ref text,
  p_inv jsonb,      -- bolsa: [{key, qty (+ entra, - sai), meta}]
  p_bag jsonb,      -- mochila do Vale: lotes [{key, qty}] que saem (venda)
  p_equip jsonb     -- ferramenta comprada: {id, blueprint, tool, durability, data} ou null
) returns jsonb
language plpgsql set search_path = public as $$
declare pr pacto_profile; it jsonb; have integer; dur integer;
begin
  if exists (select 1 from pacto_ledger where request_id = p_request) then return jsonb_build_object('ok', true, 'repeat', true); end if;
  pr := pacto_lock(p_cid);
  if pr.lumes + p_delta < 0 then return jsonb_build_object('ok', false, 'reason', 'sem-lumes'); end if;

  -- conferências (nada mudou ainda)
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
  insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (p_request, p_cid, p_delta, case when p_delta < 0 then 'loja-compra' else 'loja-venda' end, p_ref);
  return jsonb_build_object('ok', true, 'lumes', pr.lumes + p_delta);
end $$;

revoke execute on function public.shop_trade(uuid, uuid, bigint, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.shop_trade(uuid, uuid, bigint, text, jsonb, jsonb, jsonb) to service_role;
