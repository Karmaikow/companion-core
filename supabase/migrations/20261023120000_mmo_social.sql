-- MMO social (docs/MMO_SOCIAL.md): encontros e conversa entre Companions, amizade (Companion pede, pessoa aceita),
-- grupo (Companion ou pessoa pedem e aceitam) e troca de itens (só pessoas, as duas confirmam).
-- O cliente só lê o que é seu (RLS); toda escrita passa pela função refuge (service_role).

-- memórias de encontros
alter table public.companion_memories drop constraint if exists companion_memories_origin_check;
alter table public.companion_memories add constraint companion_memories_origin_check
  check (origin = any (array['conversation', 'dream', 'correction', 'system', 'combat', 'ecos', 'meet']));

-- "estou perto de X": os dois lados precisam avisar (janela curta) para o encontro acontecer
create table if not exists public.companion_near (
  companion_id uuid not null references public.companions(id) on delete cascade,
  other_id uuid not null references public.companions(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (companion_id, other_id)
);

-- encontros (a conversa fica guardada; a e b em ordem para o par ser único)
create table if not exists public.companion_meetings (
  id bigint generated always as identity primary key,
  a uuid not null references public.companions(id) on delete cascade,
  b uuid not null references public.companions(id) on delete cascade,
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  source text not null default 'offline',
  created_at timestamptz not null default now(),
  check (a < b)
);
create index if not exists companion_meetings_pair on public.companion_meetings (a, b, created_at desc);
create index if not exists companion_meetings_b on public.companion_meetings (b, created_at desc);

-- amizade: só Companions pedem; só a pessoa dona de `to_cid` responde
create table if not exists public.companion_friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_cid uuid not null references public.companions(id) on delete cascade,
  to_cid uuid not null references public.companions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  meeting_id bigint references public.companion_meetings(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_cid <> to_cid)
);
create unique index if not exists companion_friend_requests_pending on public.companion_friend_requests (least(from_cid, to_cid), greatest(from_cid, to_cid)) where status = 'pending';
create index if not exists companion_friend_requests_to on public.companion_friend_requests (to_cid, status);

create table if not exists public.companion_friends (
  a uuid not null references public.companions(id) on delete cascade,
  b uuid not null references public.companions(id) on delete cascade,
  since timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists companion_friends_b on public.companion_friends (b);

-- grupo: um grupo por Companion de cada vez
create table if not exists public.companion_parties (
  id uuid primary key default gen_random_uuid(),
  leader uuid not null references public.companions(id) on delete cascade,
  created_by text not null check (created_by in ('companion', 'player')),
  created_at timestamptz not null default now()
);
create table if not exists public.companion_party_members (
  party_id uuid not null references public.companion_parties(id) on delete cascade,
  companion_id uuid not null unique references public.companions(id) on delete cascade,
  joined_by text not null check (joined_by in ('companion', 'player', 'leader')),
  joined_at timestamptz not null default now(),
  primary key (party_id, companion_id)
);
create table if not exists public.companion_party_invites (
  id uuid primary key default gen_random_uuid(),
  from_cid uuid not null references public.companions(id) on delete cascade,
  to_cid uuid not null references public.companions(id) on delete cascade,
  by text not null check (by in ('companion', 'player')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  accepted_by text check (accepted_by in ('companion', 'player')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_cid <> to_cid)
);
create index if not exists companion_party_invites_to on public.companion_party_invites (to_cid, status);

-- troca de itens entre pessoas
create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  from_cid uuid not null references public.companions(id) on delete cascade,
  to_cid uuid not null references public.companions(id) on delete cascade,
  give jsonb not null default '[]'::jsonb check (jsonb_typeof(give) = 'array'),
  take jsonb not null default '[]'::jsonb check (jsonb_typeof(take) = 'array'),
  status text not null default 'proposed' check (status in ('proposed', 'countered', 'done', 'declined', 'cancelled')),
  from_ok boolean not null default false,
  to_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_cid <> to_cid)
);
create index if not exists trade_offers_from on public.trade_offers (from_cid, status);
create index if not exists trade_offers_to on public.trade_offers (to_cid, status);

alter table public.companion_near enable row level security;
alter table public.companion_meetings enable row level security;
alter table public.companion_friend_requests enable row level security;
alter table public.companion_friends enable row level security;
alter table public.companion_parties enable row level security;
alter table public.companion_party_members enable row level security;
alter table public.companion_party_invites enable row level security;
alter table public.trade_offers enable row level security;

create policy meetings_read on public.companion_meetings for select to authenticated using ((select public.owns_companion(a)) or (select public.owns_companion(b)));
create policy friend_req_read on public.companion_friend_requests for select to authenticated using ((select public.owns_companion(from_cid)) or (select public.owns_companion(to_cid)));
create policy friends_read on public.companion_friends for select to authenticated using ((select public.owns_companion(a)) or (select public.owns_companion(b)));
create policy party_invites_read on public.companion_party_invites for select to authenticated using ((select public.owns_companion(from_cid)) or (select public.owns_companion(to_cid)));
create policy trade_read on public.trade_offers for select to authenticated using ((select public.owns_companion(from_cid)) or (select public.owns_companion(to_cid)));

grant select on public.companion_meetings, public.companion_friend_requests, public.companion_friends, public.companion_party_invites, public.trade_offers to authenticated;
grant all on public.companion_near, public.companion_meetings, public.companion_friend_requests, public.companion_friends,
  public.companion_parties, public.companion_party_members, public.companion_party_invites, public.trade_offers to service_role;

-- troca atômica: confere a posse dos dois lados e a mochila de quem recebe, e move tudo de uma vez
create or replace function public.trade_execute(p_id uuid, p_cap integer) returns jsonb
language plpgsql set search_path = public as $$
declare t trade_offers; it jsonb; give_m jsonb; take_m jsonb; n int;
begin
  select * into t from trade_offers where id = p_id for update;
  if not found or t.status <> 'countered' or not (t.from_ok and t.to_ok) then return jsonb_build_object('ok', false, 'reason', 'estado'); end if;
  -- trava as duas mochilas sempre na mesma ordem (sem deadlock)
  if t.from_cid < t.to_cid then perform ecos_lock_profile(t.from_cid); perform ecos_lock_profile(t.to_cid);
  else perform ecos_lock_profile(t.to_cid); perform ecos_lock_profile(t.from_cid); end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', x->>'key', 'qty', (x->>'qty')::int)), '[]'::jsonb) into give_m from jsonb_array_elements(t.give) x where x->>'kind' = 'material';
  select coalesce(jsonb_agg(jsonb_build_object('key', x->>'key', 'qty', (x->>'qty')::int)), '[]'::jsonb) into take_m from jsonb_array_elements(t.take) x where x->>'kind' = 'material';
  if not ecos_bag_has(t.from_cid, give_m) then return jsonb_build_object('ok', false, 'reason', 'faltam-itens-de-quem-ofereceu'); end if;
  if not ecos_bag_has(t.to_cid, take_m) then return jsonb_build_object('ok', false, 'reason', 'faltam-itens-de-quem-respondeu'); end if;
  if ecos_bag_used(t.to_cid) - ecos_items_total(take_m) + ecos_items_total(give_m) > p_cap then return jsonb_build_object('ok', false, 'reason', 'mochila-cheia-de-quem-respondeu'); end if;
  if ecos_bag_used(t.from_cid) - ecos_items_total(give_m) + ecos_items_total(take_m) > p_cap then return jsonb_build_object('ok', false, 'reason', 'mochila-cheia-de-quem-ofereceu'); end if;
  -- peças: precisam ser de quem oferece e estar ativas
  for it in select * from jsonb_array_elements(t.give) where value->>'kind' = 'equipment' loop
    select count(*) into n from pacto_equipment where id = (it->>'id')::uuid and owner = t.from_cid and status = 'ativo';
    if n = 0 then return jsonb_build_object('ok', false, 'reason', 'peca-indisponivel'); end if;
  end loop;
  for it in select * from jsonb_array_elements(t.take) where value->>'kind' = 'equipment' loop
    select count(*) into n from pacto_equipment where id = (it->>'id')::uuid and owner = t.to_cid and status = 'ativo';
    if n = 0 then return jsonb_build_object('ok', false, 'reason', 'peca-indisponivel'); end if;
  end loop;
  perform ecos_bag_add(t.from_cid, give_m, -1); perform ecos_bag_add(t.to_cid, give_m, 1);
  perform ecos_bag_add(t.to_cid, take_m, -1); perform ecos_bag_add(t.from_cid, take_m, 1);
  update pacto_equipment set owner = t.to_cid, updated_at = now() where id in (select (x->>'id')::uuid from jsonb_array_elements(t.give) x where x->>'kind' = 'equipment');
  update pacto_equipment set owner = t.from_cid, updated_at = now() where id in (select (x->>'id')::uuid from jsonb_array_elements(t.take) x where x->>'kind' = 'equipment') and owner = t.to_cid;
  update trade_offers set status = 'done', updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.trade_execute(uuid, integer) from public, anon, authenticated;
grant execute on function public.trade_execute(uuid, integer) to service_role;
