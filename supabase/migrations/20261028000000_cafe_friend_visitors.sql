-- Expose only distinct visitors who are accepted friends of the caller.
create or replace function public.get_cafe_friend_visitors(target_cafe_id text)
returns table (id uuid, username text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = p.id)
          or (f.addressee_id = auth.uid() and f.requester_id = p.id))
    )
    and exists (
      select 1 from public.user_cafes v
      where v.user_id = p.id and v.cafe_id = target_cafe_id and v.is_visited is true
    )
  order by p.username, p.id;
$$;

revoke all on function public.get_cafe_friend_visitors(text) from public, anon;
grant execute on function public.get_cafe_friend_visitors(text) to authenticated;
