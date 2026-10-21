-- A função refuge (service_role) precisa ler studio_admins para liberar a Fábrica de Companions.
-- Este projeto não concede privilégios automáticos em tabelas novas.
grant select on table public.studio_admins to service_role;
