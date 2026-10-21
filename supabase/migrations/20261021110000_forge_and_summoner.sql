-- Forja de Batalha (habilidades genéricas) e Invocador de Monstros (catálogo de criaturas).
-- Mesmo molde dos biomas: todos leem o que está publicado; só administradores da Fábrica criam e editam.
-- Os dados de cada item ficam em `data` (jsonb), validados pelas regras (shared/rules: sanitizeSkill / sanitizeCreature).

create table if not exists public.skills (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.creatures (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.skills enable row level security;
alter table public.creatures enable row level security;

create policy skills_read on public.skills for select to anon, authenticated
  using (status = 'published' or (select public.is_studio_admin()));
create policy skills_admin_insert on public.skills for insert to authenticated with check ((select public.is_studio_admin()));
create policy skills_admin_update on public.skills for update to authenticated
  using ((select public.is_studio_admin())) with check ((select public.is_studio_admin()));
create policy skills_admin_delete on public.skills for delete to authenticated using ((select public.is_studio_admin()));

create policy creatures_read on public.creatures for select to anon, authenticated
  using (status = 'published' or (select public.is_studio_admin()));
create policy creatures_admin_insert on public.creatures for insert to authenticated with check ((select public.is_studio_admin()));
create policy creatures_admin_update on public.creatures for update to authenticated
  using ((select public.is_studio_admin())) with check ((select public.is_studio_admin()));
create policy creatures_admin_delete on public.creatures for delete to authenticated using ((select public.is_studio_admin()));

-- este projeto não concede privilégios automáticos em tabelas novas
grant select on table public.skills, public.creatures to anon, authenticated;
grant insert, update, delete on table public.skills, public.creatures to authenticated;
grant all on table public.skills, public.creatures to service_role;
