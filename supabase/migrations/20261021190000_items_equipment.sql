-- Arsenal (catálogo de armas e equipamentos, mesmo molde de skills/creatures) e o que cada Companion tem equipado.
create table if not exists public.items (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.items enable row level security;
create policy items_read on public.items for select to anon, authenticated
  using (status = 'published' or (select public.is_studio_admin()));
create policy items_admin_insert on public.items for insert to authenticated with check ((select public.is_studio_admin()));
create policy items_admin_update on public.items for update to authenticated
  using ((select public.is_studio_admin())) with check ((select public.is_studio_admin()));
create policy items_admin_delete on public.items for delete to authenticated using ((select public.is_studio_admin()));

-- Equipado ({ weapon, offhand, head, back, accessory } → slug). O dono grava; as regras (validateEquipped) conferem
-- ao carregar e, com a batalha, no servidor. Por enquanto só itens do arsenal inicial podem ser equipados.
create table if not exists public.companion_equipment (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  equipped jsonb not null default '{}'::jsonb check (jsonb_typeof(equipped) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.companion_equipment enable row level security;
create policy equipment_read on public.companion_equipment for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy equipment_insert on public.companion_equipment for insert to authenticated with check ((select public.owns_companion(companion_id)));
create policy equipment_update on public.companion_equipment for update to authenticated
  using ((select public.owns_companion(companion_id))) with check ((select public.owns_companion(companion_id)));

-- este projeto não concede privilégios automáticos em tabelas novas
grant select on table public.items to anon, authenticated;
grant insert, update, delete on table public.items to authenticated;
grant select, insert, update on table public.companion_equipment to authenticated;
grant all on table public.items, public.companion_equipment to service_role;
