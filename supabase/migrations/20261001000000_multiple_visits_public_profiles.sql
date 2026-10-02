-- Keep every visit/review as its own interaction instead of overwriting the
-- user's previous review for the same cafe.

update public.user_cafes
set visited_on = (updated_at at time zone 'America/Mexico_City')::date
where is_visited = true
  and visited_on is null;

alter table public.user_cafes
  drop constraint if exists user_cafes_user_id_cafe_id_key;

create unique index if not exists user_cafes_user_cafe_visited_on_key
on public.user_cafes(user_id, cafe_id, visited_on);

create index if not exists user_cafes_user_cafe_updated_idx
on public.user_cafes(user_id, cafe_id, updated_at desc);

-- Profiles are needed to render friend rows, post authors and public profiles.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

