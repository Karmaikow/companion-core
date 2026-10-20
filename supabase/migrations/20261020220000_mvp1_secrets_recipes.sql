-- MVP 1.1: quests secretas, livro de receitas e impulso de XP.
alter table public.companions add column if not exists xp_boost integer not null default 0 check (xp_boost >= 0);

create table if not exists public.companion_secrets (
  companion_id uuid not null references public.companions(id) on delete cascade,
  secret_key text not null,
  achieved_at timestamptz not null default now(),
  source_event_id bigint,
  primary key (companion_id, secret_key)
);

create table if not exists public.companion_recipes (
  id bigint generated always as identity primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 300),
  ingredients jsonb not null default '[]'::jsonb,
  source_event_ids bigint[] not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists companion_recipes_name_uq on public.companion_recipes (companion_id, lower(name));

alter table public.companion_secrets enable row level security;
alter table public.companion_recipes enable row level security;

create policy companion_secrets_read on public.companion_secrets for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));
create policy companion_recipes_read on public.companion_recipes for select to authenticated
  using ((select public.owns_companion(companion_id)) or (select public.is_studio_admin()));

-- só a função refuge (service_role) escreve
grant select, insert, update, delete on public.companion_secrets, public.companion_recipes to service_role;
grant usage, select on all sequences in schema public to service_role;
