-- Encrypted cloud vault for Companion Memory Crystal files.
-- Authenticated users can access only their own rows via auth.uid().
-- The Crystal envelope is already AES-256-GCM encrypted on the client.

create table public.companion_crystal_vault (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  companion_id text not null
    check (companion_id ~ '^MC-[A-Z0-9-]+$'),
  crystal_document jsonb not null
    check (
      jsonb_typeof(crystal_document) = 'object'
      and crystal_document ->> 'format' = 'companion-memory-crystal'
      and crystal_document ->> 'version' = '1'
      and jsonb_typeof(crystal_document -> 'ciphertext') = 'string'
      and jsonb_typeof(crystal_document -> 'salt') = 'string'
      and jsonb_typeof(crystal_document -> 'iv') = 'string'
      and jsonb_typeof(crystal_document -> 'tag') = 'string'
      and pg_column_size(crystal_document) <= 12000000
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, companion_id)
);

comment on table public.companion_crystal_vault is
  'Encrypted Companion Memory Crystal backups. The application must upload only sealed .companion envelopes; never plaintext Core data or private keys.';
comment on column public.companion_crystal_vault.crystal_document is
  'AES-256-GCM encrypted Crystal envelope (format companion-memory-crystal v1), including ciphertext, salt, IV and authentication tag.';

alter table public.companion_crystal_vault enable row level security;
alter table public.companion_crystal_vault force row level security;

revoke all privileges on table public.companion_crystal_vault from public, anon, authenticated;
grant select, insert, update, delete on table public.companion_crystal_vault to authenticated;

create policy "Owners can read their Companion Crystals"
  on public.companion_crystal_vault for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can save their Companion Crystals"
  on public.companion_crystal_vault for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update their Companion Crystals"
  on public.companion_crystal_vault for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their Companion Crystals"
  on public.companion_crystal_vault for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Keep the Supabase RLS auto-enable event trigger, but prevent API roles from
-- invoking its SECURITY DEFINER function directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
