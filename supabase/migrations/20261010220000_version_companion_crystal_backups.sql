-- Preserve every uploaded encrypted Crystal as a versioned, immutable backup.
alter table public.companion_crystal_vault
  drop constraint companion_crystal_vault_pkey;

alter table public.companion_crystal_vault
  add column backup_id uuid not null default gen_random_uuid();

alter table public.companion_crystal_vault
  add constraint companion_crystal_vault_pkey primary key (backup_id);

create index companion_crystal_vault_owner_companion_created_idx
  on public.companion_crystal_vault (owner_id, companion_id, created_at desc);

drop policy "Owners can update their Companion Crystals"
  on public.companion_crystal_vault;

revoke update on table public.companion_crystal_vault from authenticated;
grant select, insert, delete on table public.companion_crystal_vault to authenticated;

alter table public.companion_crystal_vault
  drop column updated_at;
