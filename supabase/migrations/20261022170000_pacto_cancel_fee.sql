-- cancelar encomenda com forja em andamento também devolve a taxa dos núcleos ao artesão
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
    if j.fee > 0 then
      perform pacto_lock(j.artisan);
      update pacto_profile set lumes = lumes + j.fee, updated_at = now() where companion_id = j.artisan;
      insert into pacto_ledger (request_id, companion_id, delta, reason, ref) values (gen_random_uuid(), j.artisan, j.fee, 'nucleos-devolvidos', j.ref);
    end if;
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
revoke execute on function public.pacto_order_cancel(uuid, uuid, text, bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.pacto_order_cancel(uuid, uuid, text, bigint, bigint, uuid) to service_role;
