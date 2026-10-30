-- Each explicit new visit is a separate entry, even on the same date.
drop index if exists public.user_cafes_user_cafe_visited_on_key;
create index if not exists user_cafes_user_cafe_visit_date_idx
  on public.user_cafes(user_id,cafe_id,visited_on desc);
alter table public.user_cafes add column if not exists is_revisit boolean;
alter table public.posts add column if not exists is_revisit boolean;

-- Keep a tombstone so later catalog imports cannot recreate deleted cafes.
alter table public.cafes add column if not exists deleted_at timestamptz;
alter table public.cafes add constraint cafes_deleted_inactive_check
  check (deleted_at is null or status <> 'active');
