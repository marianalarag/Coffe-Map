-- Allow authenticated users to submit a new cafe for administrator review.
-- The request is intentionally limited to community records in needs_review.

alter table public.cafes
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null;

create index if not exists cafes_submitted_by_idx on public.cafes(submitted_by);

drop policy if exists "cafes_insert_authenticated" on public.cafes;
drop policy if exists "cafes_insert_admin" on public.cafes;
drop policy if exists "cafes_insert_admin_or_community" on public.cafes;
create policy "cafes_insert_admin_or_community"
on public.cafes for insert
to authenticated
with check (
  (select private.is_admin())
  or (
    source = 'community'
    and status = 'needs_review'
    and submitted_by = (select auth.uid())
  )
);

revoke insert on table public.cafes from anon;
grant select, insert on table public.cafes to authenticated;
