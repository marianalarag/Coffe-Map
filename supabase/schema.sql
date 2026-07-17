-- Coffee Map base schema for a fresh Supabase project.
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  role text not null default 'usuario',
  updated_at timestamptz not null default now()
);

create table if not exists public.cafes (
  id text primary key,
  nombre text not null,
  lat double precision not null,
  lng double precision not null,
  rating numeric,
  reviews integer,
  link text,
  image_url text,
  source text,
  source_id text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cafes add column if not exists source text;
alter table public.cafes add column if not exists source_id text;
alter table public.cafes add column if not exists source_url text;

update public.cafes
set source = 'google_places'
where source is null;

alter table public.cafes alter column source set default 'manual';
alter table public.cafes alter column source set not null;
alter table public.cafes drop constraint if exists cafes_source_check;
alter table public.cafes add constraint cafes_source_check
check (source in ('manual', 'community', 'osm', 'overture', 'google_places'));

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
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "cafes_select_authenticated" on public.cafes;
create policy "cafes_select_authenticated"
on public.cafes for select
to authenticated
using (true);

drop policy if exists "cafes_insert_authenticated" on public.cafes;
create policy "cafes_insert_authenticated"
on public.cafes for insert
to authenticated
with check (true);

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

create table if not exists public.google_api_usage_monthly (
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  usage_key text not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (period, usage_key)
);

alter table public.google_api_usage_monthly enable row level security;

drop policy if exists "google_api_usage_select_authenticated" on public.google_api_usage_monthly;
create policy "google_api_usage_select_authenticated"
on public.google_api_usage_monthly for select
to authenticated
using (true);

create or replace function public.reserve_google_api_usage(
  p_period text,
  p_usage_key text,
  p_amount integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  next_count integer;
begin
  if p_period !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid usage period';
  end if;

  if p_amount <= 0 then
    raise exception 'Usage amount must be positive';
  end if;

  if p_limit < 0 then
    raise exception 'Usage limit cannot be negative';
  end if;

  insert into public.google_api_usage_monthly (period, usage_key, used_count)
  values (p_period, p_usage_key, 0)
  on conflict (period, usage_key) do nothing;

  select used_count
  into current_count
  from public.google_api_usage_monthly
  where period = p_period
    and usage_key = p_usage_key
  for update;

  if current_count + p_amount > p_limit then
    return jsonb_build_object(
      'allowed', false,
      'period', p_period,
      'usage_key', p_usage_key,
      'used_count', current_count,
      'limit_count', p_limit
    );
  end if;

  update public.google_api_usage_monthly
  set used_count = used_count + p_amount,
      updated_at = now()
  where period = p_period
    and usage_key = p_usage_key
  returning used_count into next_count;

  return jsonb_build_object(
    'allowed', true,
    'period', p_period,
    'usage_key', p_usage_key,
    'used_count', next_count,
    'limit_count', p_limit
  );
end;
$$;

grant execute on function public.reserve_google_api_usage(text, text, integer, integer) to authenticated;

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
