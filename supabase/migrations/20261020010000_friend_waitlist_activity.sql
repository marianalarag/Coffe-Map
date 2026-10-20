create or replace function public.get_friend_waitlist_activity(friend_ids uuid[])
returns table (
  id uuid,
  user_id uuid,
  cafe_id text,
  updated_at timestamptz,
  username text,
  avatar_url text,
  cafe_name text,
  cafe_image_url text,
  neighborhood text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    user_cafes.id,
    user_cafes.user_id,
    user_cafes.cafe_id,
    user_cafes.updated_at,
    profiles.username,
    profiles.avatar_url,
    cafes.nombre,
    cafes.image_url,
    cafes.neighborhood
  from public.user_cafes
  join public.profiles on profiles.id = user_cafes.user_id
  join public.cafes on cafes.id = user_cafes.cafe_id
  join public.friendships on friendships.status = 'accepted'
    and (
      (friendships.requester_id = auth.uid() and friendships.addressee_id = user_cafes.user_id)
      or (friendships.addressee_id = auth.uid() and friendships.requester_id = user_cafes.user_id)
    )
  where auth.uid() is not null
    and user_cafes.in_waitlist is true
    and user_cafes.user_id = any(coalesce(friend_ids, '{}'::uuid[]))
  order by user_cafes.updated_at desc;
$$;

revoke all on function public.get_friend_waitlist_activity(uuid[]) from public, anon;
grant execute on function public.get_friend_waitlist_activity(uuid[]) to authenticated;
