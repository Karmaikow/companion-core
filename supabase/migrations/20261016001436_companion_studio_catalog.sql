
create table public.studio_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.studio_admins enable row level security;
grant select on public.studio_admins to authenticated;
create policy studio_admin_self on public.studio_admins for select to authenticated using (user_id=(select auth.uid()));
insert into public.studio_admins(user_id) select id from auth.users where lower(email)='dev.disantana@gmail.com';

create table public.studio_assets (
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('companion','refuge','npc','monster','equipment','skill','effect','world')),
 name text not null check(char_length(name) between 1 and 120),
 prompt text not null default '' check(char_length(prompt)<=20000),
 companion_id text,
 status text not null default 'draft' check(status in ('draft','review','published','archived')),
 storage_provider text not null default 'supabase' check(storage_provider='supabase'),
 bucket text not null default 'companion-studio' check(bucket='companion-studio'),
 object_path text,
 mime_type text,
 file_bytes bigint not null default 0 check(file_bytes between 0 and 41943040),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision integer not null default 1,
 check(status <> 'published' or object_path is not null)
);
create index studio_assets_category_status_idx on public.studio_assets(category,status);
create unique index studio_assets_object_path_idx on public.studio_assets(object_path) where object_path is not null;
alter table public.studio_assets enable row level security;
grant select,insert,update on public.studio_assets to authenticated;
create policy studio_assets_read on public.studio_assets for select to authenticated using (
 status='published' or exists(select 1 from public.studio_admins where user_id=(select auth.uid()))
);
create policy studio_assets_insert on public.studio_assets for insert to authenticated with check (
 created_by=(select auth.uid()) and exists(select 1 from public.studio_admins where user_id=(select auth.uid()))
);
create policy studio_assets_update on public.studio_assets for update to authenticated using (
 exists(select 1 from public.studio_admins where user_id=(select auth.uid()))
) with check (exists(select 1 from public.studio_admins where user_id=(select auth.uid())));
create function public.studio_asset_revision() returns trigger language plpgsql set search_path='' as $$
begin
 new.created_by=old.created_by; new.created_at=old.created_at;
 new.updated_at=now(); new.revision=old.revision+1;
 return new;
end $$;
create trigger studio_asset_revision before update on public.studio_assets for each row execute function public.studio_asset_revision();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('companion-studio','companion-studio',false,41943040,array['image/png','image/jpeg','image/webp','model/gltf-binary']);
create policy studio_objects_read on storage.objects for select to authenticated using (
 bucket_id='companion-studio' and (
 exists(select 1 from public.studio_admins where user_id=(select auth.uid())) or
 exists(select 1 from public.studio_assets where object_path=name and status='published')
 )
);
create policy studio_objects_insert on storage.objects for insert to authenticated with check (
 bucket_id='companion-studio' and exists(select 1 from public.studio_admins where user_id=(select auth.uid()))
);
create policy studio_objects_cleanup on storage.objects for delete to authenticated using (
 bucket_id='companion-studio' and exists(select 1 from public.studio_admins where user_id=(select auth.uid()))
 and not exists(select 1 from public.studio_assets where object_path=name)
);
