-- Public exploration: active cafes can be read before sign-in.
-- Cafe details, interactions, submissions and administration remain protected
-- by the existing route and RLS policies.

alter table public.cafes
  add column if not exists status text not null default 'active';

alter table public.cafes
  add column if not exists last_verified_at timestamptz;

alter table public.cafes drop constraint if exists cafes_status_check;
alter table public.cafes add constraint cafes_status_check
check (status in ('active', 'needs_review', 'closed'));

drop policy if exists "cafes_select_authenticated" on public.cafes;
drop policy if exists "cafes_select_public" on public.cafes;

create policy "cafes_select_public"
on public.cafes for select
to anon
using (status = 'active');

create policy "cafes_select_authenticated"
on public.cafes for select
to authenticated
using (status = 'active' or (select private.is_admin()));

grant select on table public.cafes to anon;
grant select on table public.cafes to authenticated;

-- Settings updates existing rows. The client no longer uses upsert, so an
-- administrator profile is not forced through the profile INSERT policy.
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id or (select private.is_admin()))
with check (
  (select private.is_admin())
  or ((select auth.uid()) = id and role = 'usuario')
);
