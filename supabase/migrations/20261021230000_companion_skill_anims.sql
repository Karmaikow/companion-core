-- Animação escolhida pelo ADM para cada habilidade de um Companion (e para o ataque básico), pelo nome do clipe
-- do modelo 3D: { "<slug da habilidade>" | "__basic": "<nome do clipe>" }. O ADM grava (O Administrador → Companions);
-- o dono lê para o jogo tocar o clipe certo.

create table if not exists public.companion_skill_anims (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  anims jsonb not null default '{}'::jsonb check (jsonb_typeof(anims) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.companion_skill_anims enable row level security;

create policy skill_anims_read on public.companion_skill_anims for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy skill_anims_admin_insert on public.companion_skill_anims for insert to authenticated
  with check ((select public.is_studio_admin()));
create policy skill_anims_admin_update on public.companion_skill_anims for update to authenticated
  using ((select public.is_studio_admin())) with check ((select public.is_studio_admin()));
create policy skill_anims_admin_delete on public.companion_skill_anims for delete to authenticated
  using ((select public.is_studio_admin()));

grant select, insert, update, delete on table public.companion_skill_anims to authenticated;
grant all on table public.companion_skill_anims to service_role;
