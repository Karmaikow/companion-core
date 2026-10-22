-- Análise de Partículas: o bestiário do Companion (quantas vezes derrotou cada criatura e as partículas recolhidas).
-- Só a função `refuge` grava (ação combat.kill); o dono lê. As Memórias de Combate entram em companion_memories
-- com origin = 'combat'.

create table if not exists public.companion_bestiary (
  companion_id uuid not null references public.companions(id) on delete cascade,
  creature_slug text not null check (creature_slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  kills integer not null default 0 check (kills >= 0),
  particles integer not null default 0 check (particles >= 0),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (companion_id, creature_slug)
);

alter table public.companion_bestiary enable row level security;

create policy bestiary_read on public.companion_bestiary for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));

grant select on table public.companion_bestiary to authenticated;
grant all on table public.companion_bestiary to service_role;

alter table public.companion_memories drop constraint if exists companion_memories_origin_check;
alter table public.companion_memories add constraint companion_memories_origin_check
  check (origin = any (array['conversation', 'dream', 'correction', 'system', 'combat']));
