-- Likes and comments for the shared activity feed.
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_created_idx
on public.post_comments(post_id, created_at);

alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

create policy "post_likes_read" on public.post_likes
for select to authenticated using (true);
create policy "post_likes_add_own" on public.post_likes
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "post_likes_remove_own" on public.post_likes
for delete to authenticated using (user_id = (select auth.uid()));

create policy "post_comments_read" on public.post_comments
for select to authenticated using (true);
create policy "post_comments_add_own" on public.post_comments
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "post_comments_remove_own" on public.post_comments
for delete to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_comments to authenticated;
