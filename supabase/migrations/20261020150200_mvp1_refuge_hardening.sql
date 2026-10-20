-- MVP 1 (3/3): nenhuma escrita direta pelo cliente
revoke insert, update, delete on public.companions, public.companion_events, public.companion_memories,
  public.companion_diary, public.companion_quests, public.companion_inventory, public.visual_jobs from anon, authenticated;
revoke all on public.game_config from anon;
revoke execute on function public.is_studio_admin() from anon, public;
revoke execute on function public.owns_companion(uuid) from anon, public;
grant execute on function public.is_studio_admin() to authenticated;
grant execute on function public.owns_companion(uuid) to authenticated;
revoke execute on function public.forbid_event_mutation() from anon, authenticated, public;
