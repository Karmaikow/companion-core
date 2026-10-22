-- Linhagem (late game): essências e formas extras de um Companion. A identidade de nascença nunca muda; a linhagem soma.
-- Concessão só pelo servidor (quests futuras; por ora, teste de admin na homologação), com histórico.
create table if not exists public.companion_lineage (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  forms text[] not null default '{}',
  essences text[] not null default '{}',
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.companion_lineage enable row level security;
create policy lineage_read_own on public.companion_lineage for select to authenticated
  using (exists (select 1 from public.companions c where c.id = companion_id and c.owner_id = auth.uid()));

-- conceder (ou retirar, p_on = false) uma forma/essência; idempotente; respeita o limite
create or replace function public.lineage_set(p_cid uuid, p_kind text, p_value text, p_on boolean, p_max integer, p_source text) returns jsonb
language plpgsql set search_path = public as $$
declare l companion_lineage; arr text[];
begin
  if p_kind not in ('form', 'essence') then return jsonb_build_object('ok', false, 'reason', 'tipo-invalido'); end if;
  insert into companion_lineage (companion_id) values (p_cid) on conflict (companion_id) do nothing;
  select * into l from companion_lineage where companion_id = p_cid for update;
  arr := case when p_kind = 'form' then l.forms else l.essences end;
  if p_on then
    if p_value = any(arr) then return jsonb_build_object('ok', true, 'repeat', true); end if;
    if coalesce(array_length(arr, 1), 0) >= p_max then return jsonb_build_object('ok', false, 'reason', 'limite'); end if;
    arr := arr || p_value;
  else
    if not (p_value = any(arr)) then return jsonb_build_object('ok', true, 'repeat', true); end if;
    arr := array_remove(arr, p_value);
  end if;
  update companion_lineage set
    forms = case when p_kind = 'form' then arr else forms end,
    essences = case when p_kind = 'essence' then arr else essences end,
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'kind', p_kind, 'value', p_value, 'on', p_on, 'source', p_source)),
    updated_at = now()
  where companion_id = p_cid;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.lineage_set(uuid, text, text, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.lineage_set(uuid, text, text, boolean, integer, text) to service_role;
