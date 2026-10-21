-- O painel do ADM (módulos de XP e de clima) edita game_config.values direto; a política game_config_admin_write
-- já restringe a escrita a administradores. Faltavam os privilégios de tabela (este projeto não concede automático).
grant select, update on table public.game_config to authenticated;
grant select on table public.game_config to anon;
create policy game_config_read_anon on public.game_config for select to anon using (true);
