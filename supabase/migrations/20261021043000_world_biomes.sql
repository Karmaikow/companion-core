-- Estúdio de Biomas: configuração de cada bioma (paleta + modelos .GLB) e um bucket público para os modelos do mundo.
-- Quem joga só lê biomas publicados; só administradores da Fábrica criam, editam e enviam arquivos.

create table if not exists public.biomes (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  palette jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  assets jsonb not null default '[]'::jsonb check (jsonb_typeof(assets) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.biomes enable row level security;

create policy biomes_read on public.biomes for select to anon, authenticated
  using (status = 'published' or exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy biomes_admin_insert on public.biomes for insert to authenticated
  with check (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy biomes_admin_update on public.biomes for update to authenticated
  using (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy biomes_admin_delete on public.biomes for delete to authenticated
  using (exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));

-- este projeto não concede privilégios automáticos em tabelas novas
grant select on table public.biomes to anon, authenticated;
grant insert, update, delete on table public.biomes to authenticated;
grant all on table public.biomes to service_role;

-- bucket público (leitura por URL pública) só para modelos .GLB e texturas do mundo
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('world-assets', 'world-assets', true, 52428800, array['model/gltf-binary', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy world_assets_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'world-assets' and exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy world_assets_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'world-assets' and exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
create policy world_assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'world-assets' and exists (select 1 from public.studio_admins a where a.user_id = (select auth.uid())));
