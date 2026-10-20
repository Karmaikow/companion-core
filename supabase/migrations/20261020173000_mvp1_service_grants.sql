-- MVP 1: a função `refuge` (service_role) é a única que escreve.
-- Este projeto não concede privilégios automáticos em tabelas novas,
-- então os grants precisam ser explícitos. Cliente continua sem escrita direta.
grant select, insert, update, delete on public.companions, public.companion_quests, public.companion_memories,
  public.companion_diary, public.companion_inventory, public.visual_jobs to service_role;
-- eventos são imutáveis (o gatilho forbid_event_mutation bloqueia update/delete)
grant select, insert on public.companion_events to service_role;
grant select on public.game_config to service_role;
grant usage, select on all sequences in schema public to service_role;
