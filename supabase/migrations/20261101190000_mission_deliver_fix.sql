-- Correção de mission_deliver: num array vazio, "delivered[2] = x" cria um array com índice começando em 2, e a
-- normalização seguinte o movia para a posição 1 (o objetivo errado). Agora o array é completado com zeros até a
-- posição do objetivo antes de gravar.

create or replace function public.mission_deliver(
  p_request uuid, p_cid uuid, p_mission text, p_period text, p_idx integer, p_key text, p_qty integer, p_goal integer
) returns jsonb
language plpgsql set search_path = public as $$
declare r companion_missions; d integer[]; have integer; take integer; inbag integer; res jsonb;
begin
  if exists (select 1 from ecos_actions where request_id = p_request) then
    return (select result from ecos_actions where request_id = p_request) || jsonb_build_object('repeat', true);
  end if;
  if p_idx < 0 or p_idx > 20 then return jsonb_build_object('ok', false, 'reason', 'pedido-invalido'); end if;
  select * into r from companion_missions where companion_id = p_cid and mission = p_mission and period = p_period for update;
  if not found or r.status <> 'ativa' then return jsonb_build_object('ok', false, 'reason', 'missao-inativa'); end if;
  d := array(select coalesce(x, 0) from unnest(coalesce(r.delivered, '{}')) x);
  while coalesce(array_length(d, 1), 0) < p_idx + 1 loop d := d || 0; end loop;
  have := d[p_idx + 1];
  take := least(greatest(p_qty, 0), p_goal - have);
  if take <= 0 then return jsonb_build_object('ok', false, 'reason', 'ja-completo'); end if;
  perform ecos_lock_profile(p_cid);
  select qty into inbag from ecos_bag where companion_id = p_cid and batch_key = p_key for update;
  if coalesce(inbag, 0) < take then return jsonb_build_object('ok', false, 'reason', 'faltam-materiais'); end if;
  update ecos_bag set qty = qty - take, updated_at = now() where companion_id = p_cid and batch_key = p_key;
  d[p_idx + 1] := have + take;
  update companion_missions set delivered = d where companion_id = p_cid and mission = p_mission and period = p_period;
  res := jsonb_build_object('ok', true, 'accepted', take, 'delivered', have + take);
  insert into ecos_actions (request_id, companion_id, kind, status, result) values (p_request, p_cid, 'mission', 'done', res);
  return res;
end $$;

revoke execute on function public.mission_deliver(uuid, uuid, text, text, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.mission_deliver(uuid, uuid, text, text, integer, text, integer, integer) to service_role;

-- a única entrega feita antes da correção (primeiras-ervas: 2 folhas no objetivo 2, gravadas na posição 1)
update public.companion_missions set delivered = '{0,2}'
where mission = 'primeiras-ervas' and status = 'ativa' and delivered = '{2}';
