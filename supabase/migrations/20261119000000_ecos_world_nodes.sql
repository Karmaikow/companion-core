-- Mundo compartilhado, etapa 3: os recursos de coleta passam a ser UM só para todos os jogadores.
--
-- Antes, cada Companion tinha o próprio vale (ecos_nodes por companion_id): o que um colhia continuava cheio para o
-- outro. Agora a quantidade de cada recurso fica numa linha só por recurso (ecos_world_nodes): quem colher primeiro
-- leva, e o recurso esvazia para todos e se recupera com o tempo, como antes.
--
-- Esta migração só ACRESCENTA (tabela e função novas). A função antiga ecos_finish_gather e a tabela ecos_nodes ficam
-- como estão, então aplicar isto não muda nada no jogo até a função `refuge` nova (que chama
-- ecos_finish_gather_shared) ser publicada. Para voltar atrás, basta publicar a função anterior.

create table if not exists public.ecos_world_nodes (
  node_id text primary key,
  amount numeric not null,
  at timestamptz not null default now()
);
-- leitura e escrita só pelo servidor (a função refuge, com service_role)
alter table public.ecos_world_nodes enable row level security;
grant all on table public.ecos_world_nodes to service_role;

-- A mesma conta da ecos_finish_gather, com a quantidade na linha compartilhada do recurso. A trava da linha
-- (`for update`) põe em fila quem termina a coleta do mesmo recurso ao mesmo tempo: o segundo vê o que sobrou.
create or replace function public.ecos_finish_gather_shared(
  p_request uuid, p_cid uuid, p_node text, p_approach text,
  p_cost numeric, p_cap numeric, p_regen numeric, p_min_seconds numeric, p_items jsonb, p_bag_cap integer
) returns jsonb
language plpgsql set search_path = public as $$
declare
  r ecos_actions; n ecos_world_nodes; cur numeric; used int; incoming int; res jsonb;
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
  insert into ecos_world_nodes (node_id, amount, at) values (p_node, p_cap, now()) on conflict do nothing;
  select * into n from ecos_world_nodes where node_id = p_node for update;
  cur := least(p_cap, n.amount + p_regen * extract(epoch from (now() - n.at)) / 3600.0);

  if cur < p_cost then
    res := jsonb_build_object('ok', false, 'reason', 'esgotado', 'amount', cur);
  else
    used := ecos_bag_used(p_cid); incoming := ecos_items_total(p_items);
    if used + incoming > p_bag_cap then
      res := jsonb_build_object('ok', false, 'reason', 'mochila-cheia', 'used', used, 'incoming', incoming, 'cap', p_bag_cap);
    else
      update ecos_world_nodes set amount = cur - p_cost, at = now() where node_id = p_node;
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

revoke execute on function public.ecos_finish_gather_shared(uuid, uuid, text, text, numeric, numeric, numeric, numeric, jsonb, integer) from public, anon, authenticated;
grant execute on function public.ecos_finish_gather_shared(uuid, uuid, text, text, numeric, numeric, numeric, numeric, jsonb, integer) to service_role;
