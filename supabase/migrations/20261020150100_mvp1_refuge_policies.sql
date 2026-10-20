-- MVP 1 (2/3): imutabilidade de eventos, helpers e políticas de leitura

create or replace function public.forbid_event_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Permite apenas a remoção em cascata quando o Companion inteiro é apagado.
  if tg_op = 'DELETE' and not exists (select 1 from public.companions c where c.id = old.companion_id) then
    return old;
  end if;
  raise exception 'companion_events é imutável';
end $$;
create trigger companion_events_immutable before update or delete on public.companion_events
  for each row execute function public.forbid_event_mutation();

create or replace function public.is_studio_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid()));
$$;

create or replace function public.owns_companion(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companions c where c.id = cid and c.owner_id = (select auth.uid()));
$$;

create policy game_config_read on public.game_config for select to authenticated using (true);
create policy game_config_admin_write on public.game_config for update to authenticated
  using ((select public.is_studio_admin())) with check ((select public.is_studio_admin()));
create policy companions_read on public.companions for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_studio_admin()));
create policy companion_events_read on public.companion_events for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy companion_memories_read on public.companion_memories for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy companion_diary_read on public.companion_diary for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy companion_quests_read on public.companion_quests for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy companion_inventory_read on public.companion_inventory for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy visual_jobs_read on public.visual_jobs for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
