begin;
-- Expose only community aggregates, including ratings without written reviews.
-- Do not count posts again: reviews reference the same user_cafes ratings.
create or replace function public.get_cafe_app_ratings()
returns table(cafe_id text, rating numeric, rating_count bigint)
language sql stable security definer set search_path = ''
as $$
  select v.cafe_id, round(avg(v.rating), 2), count(*)
  from public.user_cafes v
  join public.cafes c on c.id = v.cafe_id
  where v.rating > 0 and c.status = 'active' and c.deleted_at is null
  group by v.cafe_id;
$$;
revoke all on function public.get_cafe_app_ratings() from public;
grant execute on function public.get_cafe_app_ratings() to anon, authenticated;

-- Rating recency is independent of marking a favorite or editing visit metadata.
alter table public.user_cafes add column if not exists rated_at timestamptz;
update public.user_cafes set rated_at = updated_at where rating > 0 and rated_at is null;
create or replace function private.track_cafe_rating_time()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.rated_at := case when new.rating > 0 then now() else null end;
  elsif new.rating is distinct from old.rating then
    new.rated_at := case when new.rating > 0 then now() else null end;
  else
    new.rated_at := old.rated_at;
  end if;
  return new;
end;
$$;
drop trigger if exists user_cafes_track_rating_time on public.user_cafes;
create trigger user_cafes_track_rating_time before insert or update on public.user_cafes
for each row execute function private.track_cafe_rating_time();

-- Favorite/watchlist flags belong to a cafe, rather than to each diary entry.
with preferences as (
  select distinct on (user_id, cafe_id) user_id, cafe_id, is_favorite, in_waitlist
  from public.user_cafes order by user_id, cafe_id, updated_at desc, id desc
)
update public.user_cafes v set is_favorite = p.is_favorite, in_waitlist = p.in_waitlist
from preferences p where v.user_id = p.user_id and v.cafe_id = p.cafe_id
and (v.is_favorite is distinct from p.is_favorite or v.in_waitlist is distinct from p.in_waitlist);

create or replace function private.sync_cafe_preferences()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update public.user_cafes v set is_favorite = new.is_favorite, in_waitlist = new.in_waitlist
  where v.user_id = new.user_id and v.cafe_id = new.cafe_id and v.id <> new.id
    and (v.is_favorite is distinct from new.is_favorite or v.in_waitlist is distinct from new.in_waitlist);
  return new;
end;
$$;
drop trigger if exists user_cafes_sync_preferences on public.user_cafes;
create trigger user_cafes_sync_preferences after insert or update of is_favorite, in_waitlist on public.user_cafes
for each row execute function private.sync_cafe_preferences();
commit;
