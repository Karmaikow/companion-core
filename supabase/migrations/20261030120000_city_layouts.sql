-- Estúdio da Cidade: o layout de cada cidade fixa (por enquanto só Áster), montado à mão no Administrador.
-- `data` segue shared/rules/aster.ts (CityLayout): peças .GLB, marcadores (portões, lojas, forja, escolas…),
-- o modelo da cidade vista de fora e as cores do chão. Os .GLB ficam no bucket world-assets (city/<slug>/...).
-- Quem joga só lê layouts publicados; só administradores da Fábrica criam e editam.

create table if not exists public.city_layouts (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.city_layouts enable row level security;

create policy city_layouts_read on public.city_layouts for select to anon, authenticated
  using (status = 'published' or exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy city_layouts_admin_insert on public.city_layouts for insert to authenticated
  with check (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy city_layouts_admin_update on public.city_layouts for update to authenticated
  using (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy city_layouts_admin_delete on public.city_layouts for delete to authenticated
  using (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));

-- este projeto não concede privilégios automáticos em tabelas novas
grant select on table public.city_layouts to anon, authenticated;
grant insert, update, delete on table public.city_layouts to authenticated;
grant all on table public.city_layouts to service_role;
