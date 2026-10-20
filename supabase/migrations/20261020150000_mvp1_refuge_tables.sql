-- MVP 1 — Refúgio e Despertar (1/3): tabelas
-- Servidor autoritativo: clientes só LEEM; toda escrita passa pela Edge Function `refuge`.

create table if not exists public.game_config (
  id smallint primary key default 1 check (id = 1),
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.game_config (id) values (1) on conflict do nothing;

create table if not exists public.companions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stage text not null default 'particles' check (stage in ('particles', 'awakened')),
  discoveries jsonb not null default '{}'::jsonb,
  bond_xp integer not null default 0 check (bond_xp >= 0),
  identity_contract jsonb,
  identity_version integer not null default 0,
  awakened_at timestamptz,
  last_dream_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companions_owner_idx on public.companions(owner_id);

-- Log factual imutável (GDD 8 — Eventos).
create table if not exists public.companion_events (
  id bigint generated always as identity primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  actor text not null check (actor in ('player', 'companion', 'system')),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists companion_events_cid_idx on public.companion_events(companion_id, id desc);
create index if not exists companion_events_kind_idx on public.companion_events(companion_id, kind, created_at desc);

-- Memórias consolidadas com proveniência (GDD 8 — Memórias).
create table if not exists public.companion_memories (
  id bigint generated always as identity primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  subject text not null check (subject in ('player', 'companion', 'shared')),
  content text not null check (char_length(content) between 3 and 400),
  importance smallint not null default 3 check (importance between 1 and 5),
  source_event_ids bigint[] not null check (cardinality(source_event_ids) > 0),
  origin text not null default 'conversation' check (origin in ('conversation', 'dream', 'correction', 'system')),
  status text not null default 'active' check (status in ('active', 'superseded', 'corrected')),
  replaced_by bigint references public.companion_memories(id),
  created_at timestamptz not null default now()
);
create index if not exists companion_memories_cid_idx on public.companion_memories(companion_id, status, importance desc, id desc);

-- Diário narrativo (não substitui o registro factual).
create table if not exists public.companion_diary (
  id bigint generated always as identity primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  game_day integer not null,
  body text not null,
  source_event_ids bigint[] not null default '{}',
  memory_ids bigint[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists companion_diary_cid_idx on public.companion_diary(companion_id, id desc);

create table if not exists public.companion_quests (
  companion_id uuid not null references public.companions(id) on delete cascade,
  quest_key text not null check (quest_key in ('identity', 'species', 'color', 'traits', 'essence', 'bond', 'dream')),
  status text not null default 'active' check (status in ('active', 'done')),
  completed_at timestamptz,
  source_event_id bigint references public.companion_events(id),
  primary key (companion_id, quest_key)
);

create table if not exists public.companion_inventory (
  companion_id uuid not null references public.companions(id) on delete cascade,
  item_key text not null,
  qty integer not null default 0 check (qty >= 0),
  meta jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default now(),
  primary key (companion_id, item_key)
);

-- Fábrica de personagens: status rastreável da geração visual (GDD 5.2).
create table if not exists public.visual_jobs (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references public.companions(id) on delete cascade,
  contract_version integer not null,
  contract jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'generating', 'review', 'approved', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visual_jobs_cid_idx on public.visual_jobs(companion_id, created_at desc);

alter table public.game_config enable row level security;
alter table public.companions enable row level security;
alter table public.companion_events enable row level security;
alter table public.companion_memories enable row level security;
alter table public.companion_diary enable row level security;
alter table public.companion_quests enable row level security;
alter table public.companion_inventory enable row level security;
alter table public.visual_jobs enable row level security;
