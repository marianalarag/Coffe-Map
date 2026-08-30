-- Coffee Map base schema for a fresh Supabase project.
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  cover_url text,
  text_color text not null default '#E6DAC1',
  role text not null default 'usuario',
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists text_color text not null default '#E6DAC1';
alter table public.profiles drop constraint if exists profiles_text_color_check;
alter table public.profiles add constraint profiles_text_color_check
check (text_color ~ '^#[0-9A-Fa-f]{6}$');

create table if not exists public.cafes (
  id text primary key,
  nombre text not null,
  lat double precision not null,
  lng double precision not null,
  rating numeric,
  reviews integer,
  link text,
  image_url text,
  image_source_url text,
  image_attribution text,
  image_license text,
  source text,
  source_id text,
  source_url text,
  address text,
  category text not null default 'cafeteria',
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cafes add column if not exists source text;
alter table public.cafes add column if not exists source_id text;
alter table public.cafes add column if not exists source_url text;
alter table public.cafes add column if not exists address text;
alter table public.cafes add column if not exists category text not null default 'cafeteria';
alter table public.cafes add column if not exists submitted_by uuid references public.profiles(id) on delete set null;
alter table public.cafes drop constraint if exists cafes_category_check;
alter table public.cafes add constraint cafes_category_check
check (category in ('cafeteria', 'panaderia'));

update public.cafes
set source = 'manual'
where source is null;

alter table public.cafes alter column source set default 'manual';
alter table public.cafes alter column source set not null;
alter table public.cafes drop constraint if exists cafes_source_check;
alter table public.cafes add constraint cafes_source_check
check (source in ('manual', 'community', 'osm', 'overture'));

create index if not exists cafes_source_idx on public.cafes(source);
create unique index if not exists cafes_source_source_id_idx
on public.cafes(source, source_id)
where source_id is not null;

create table if not exists public.user_cafes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cafe_id text not null references public.cafes(id) on delete cascade,
  is_visited boolean not null default false,
  is_favorite boolean not null default false,
  in_waitlist boolean not null default false,
  rating smallint check (rating is null or rating between 1 and 5),
  review_text text not null default '',
  visited_on date,
  updated_at timestamptz not null default now(),
  unique (user_id, cafe_id)
);

alter table public.profiles enable row level security;
alter table public.cafes enable row level security;
alter table public.user_cafes enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id and role = 'usuario');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and role = 'usuario');

drop policy if exists "cafes_select_authenticated" on public.cafes;
create policy "cafes_select_authenticated"
on public.cafes for select
to authenticated
using (true);

drop policy if exists "cafes_insert_authenticated" on public.cafes;

drop policy if exists "user_cafes_select_own" on public.user_cafes;
create policy "user_cafes_select_own"
on public.user_cafes for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_cafes_insert_own" on public.user_cafes;
create policy "user_cafes_insert_own"
on public.user_cafes for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_cafes_update_own" on public.user_cafes;
create policy "user_cafes_update_own"
on public.user_cafes for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_cafes_delete_own" on public.user_cafes;
create policy "user_cafes_delete_own"
on public.user_cafes for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'Usuario Coffee'),
    'https://api.dicebear.com/7.x/miniavs/svg?seed=' || coalesce(new.raw_user_meta_data->>'username', new.id::text),
    'usuario'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
