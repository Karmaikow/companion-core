-- Pontos de habilidade distribuídos na árvore do Companion ({ nó: pontos }).
-- O dono lê e grava; a regra (shared/rules/combat/tree.ts → validateAllocation) confere no cliente ao carregar e,
-- quando a batalha existir, no servidor (battle.resolve recalcula antes de usar).

create table if not exists public.companion_skill_alloc (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  alloc jsonb not null default '{}'::jsonb check (jsonb_typeof(alloc) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.companion_skill_alloc enable row level security;

create policy skill_alloc_read on public.companion_skill_alloc for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy skill_alloc_insert on public.companion_skill_alloc for insert to authenticated
  with check ((select public.owns_companion(companion_id)));
create policy skill_alloc_update on public.companion_skill_alloc for update to authenticated
  using ((select public.owns_companion(companion_id))) with check ((select public.owns_companion(companion_id)));

-- este projeto não concede privilégios automáticos em tabelas novas
grant select, insert, update on table public.companion_skill_alloc to authenticated;
grant all on table public.companion_skill_alloc to service_role;
