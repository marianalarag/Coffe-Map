-- Social reviews, half-star ratings, multiple gallery images, friendships and neighborhood labels.

alter table public.user_cafes drop constraint if exists user_cafes_rating_check;
alter table public.user_cafes
  alter column rating type numeric(2,1) using rating::numeric(2,1);
alter table public.user_cafes add constraint user_cafes_rating_check
check (
  rating is null
  or (rating >= 0.5 and rating <= 5 and mod(rating * 2, 1) = 0)
);

alter table public.cafes
  add column if not exists neighborhood text;

alter table public.posts
  add column if not exists kind text not null default 'post',
  add column if not exists rating numeric(2,1),
  add column if not exists visited_on date,
  add column if not exists interaction_id uuid references public.user_cafes(id) on delete cascade;

alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts add constraint posts_content_check
check (char_length(content) <= 1000);
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check
check (kind in ('post', 'review'));
alter table public.posts drop constraint if exists posts_rating_check;
alter table public.posts add constraint posts_rating_check
check (
  rating is null
  or (rating >= 0.5 and rating <= 5 and mod(rating * 2, 1) = 0)
);

create unique index if not exists posts_interaction_id_key
on public.posts(interaction_id);
create index if not exists posts_kind_created_at_idx
on public.posts(kind, created_at desc);

create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  position smallint not null default 0 check (position between 0 and 9),
  created_at timestamptz not null default now()
);

create index if not exists post_images_post_position_idx
on public.post_images(post_id, position, created_at);
create index if not exists post_images_user_id_idx
on public.post_images(user_id);

alter table public.post_images enable row level security;

drop policy if exists "post_images_select_visible" on public.post_images;
create policy "post_images_select_visible"
on public.post_images for select to authenticated
using (
  exists (
    select 1 from public.posts
    where posts.id = post_images.post_id
      and (
        posts.status = 'published'
        or posts.user_id = (select auth.uid())
        or (select private.is_admin())
      )
  )
);

drop policy if exists "post_images_insert_own" on public.post_images;
create policy "post_images_insert_own"
on public.post_images for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.posts
    where posts.id = post_images.post_id
      and posts.user_id = (select auth.uid())
  )
);

drop policy if exists "post_images_delete_own_or_admin" on public.post_images;
create policy "post_images_delete_own_or_admin"
on public.post_images for delete to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

revoke all on table public.post_images from anon;
grant select, insert, delete on table public.post_images to authenticated;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_pair_idx
on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index if not exists friendships_requester_idx on public.friendships(requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id, status);

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_involved" on public.friendships;
create policy "friendships_select_involved"
on public.friendships for select to authenticated
using (
  requester_id = (select auth.uid())
  or addressee_id = (select auth.uid())
);

drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester"
on public.friendships for insert to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_id <> addressee_id
  and status = 'pending'
);

drop policy if exists "friendships_accept_addressee" on public.friendships;
create policy "friendships_accept_addressee"
on public.friendships for update to authenticated
using (addressee_id = (select auth.uid()) and status = 'pending')
with check (addressee_id = (select auth.uid()) and status = 'accepted');

drop policy if exists "friendships_delete_involved" on public.friendships;
create policy "friendships_delete_involved"
on public.friendships for delete to authenticated
using (
  requester_id = (select auth.uid())
  or addressee_id = (select auth.uid())
);

revoke all on table public.friendships from anon, authenticated;
grant select, insert, delete on table public.friendships to authenticated;
grant update (status, updated_at) on table public.friendships to authenticated;

comment on table public.post_images is 'Ordered gallery images attached to an activity post or review.';
comment on table public.friendships is 'Mutual friend requests and accepted friendships; visible only to involved users.';
