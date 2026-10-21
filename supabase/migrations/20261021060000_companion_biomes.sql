-- Bioma do Refúgio por Companion: todos usam o bioma padrão "refugio"; a Fábrica pode dar a um Companion evoluído
-- um Refúgio próprio (qualquer bioma publicado, inclusive um feito só para ele e fora do mundo aberto).
-- Quem joga só lê o do próprio Companion; só administradores escolhem.

create table if not exists public.companion_biomes (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  biome_slug text not null references public.biomes(slug) on update cascade on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.companion_biomes enable row level security;

create policy companion_biomes_read on public.companion_biomes for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy companion_biomes_admin_insert on public.companion_biomes for insert to authenticated
  with check ((select public.is_studio_admin()));
create policy companion_biomes_admin_update on public.companion_biomes for update to authenticated
  using ((select public.is_studio_admin())) with check ((select public.is_studio_admin()));
create policy companion_biomes_admin_delete on public.companion_biomes for delete to authenticated
  using ((select public.is_studio_admin()));

-- este projeto não concede privilégios automáticos em tabelas novas
grant select, insert, update, delete on table public.companion_biomes to authenticated;
grant all on table public.companion_biomes to service_role;
