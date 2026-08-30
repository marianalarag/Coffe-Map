-- Review dates, moderated community submissions, Al Taglio and safe duplicate cleanup.

alter table public.user_cafes
add column if not exists visited_on date;

alter table public.cafes
add column if not exists submitted_by uuid references public.profiles(id) on delete set null;

create index if not exists cafes_submitted_by_idx on public.cafes(submitted_by);

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

-- Existing tables keep their Data API grants today, but make the required
-- community submission access explicit for projects using the newer defaults.
revoke insert on table public.cafes from anon;
grant select, insert on table public.cafes to authenticated;

insert into public.cafes (
  id,
  nombre,
  lat,
  lng,
  rating,
  reviews,
  link,
  address,
  category,
  source,
  source_id,
  source_url,
  status,
  last_verified_at
)
values (
  'manual:al-taglio-pizza-caffe-santiago',
  'Al Taglio Pizza & Caffe',
  20.971954,
  -89.631800,
  4.8,
  125,
  'https://www.google.com/maps/search/?api=1&query=Al%20Taglio%20Pizza%20%26%20Caffe%2C%20Calle%2057%20553A%2C%20Merida%2C%20Yucatan',
  'C. 57 553 A, entre 70 y 72, Barrio de Santiago, Centro, Mérida, Yuc.',
  'cafeteria',
  'manual',
  'al-taglio-pizza-caffe-santiago',
  'https://www.rappi.com.mx/restaurantes/1930368388-al-taglio-pizza-y-caffe',
  'active',
  now()
)
on conflict (id) do update set
  nombre = excluded.nombre,
  lat = excluded.lat,
  lng = excluded.lng,
  rating = excluded.rating,
  reviews = excluded.reviews,
  link = excluded.link,
  address = excluded.address,
  category = excluded.category,
  source = excluded.source,
  source_id = excluded.source_id,
  source_url = excluded.source_url,
  status = excluded.status,
  last_verified_at = excluded.last_verified_at,
  updated_at = now();

-- Merge same-name records within 120 m. The better curated record wins, while
-- personal interactions, posts and photos are moved before the duplicate row
-- is removed. Running the migration again is safe.
do $$
declare
  duplicate_pair record;
begin
  loop
    select
      case when a_score >= b_score then a_id else b_id end as keep_id,
      case when a_score >= b_score then b_id else a_id end as remove_id
    into duplicate_pair
    from (
      select
        a.id as a_id,
        b.id as b_id,
        (
          case a.source when 'manual' then 400 when 'community' then 300 when 'osm' then 200 when 'overture' then 100 else 0 end
          + case when a.status = 'active' then 50 else 0 end
          + case when a.image_url is not null then 20 else 0 end
          + case when a.address is not null then 10 else 0 end
          + least(coalesce(a.reviews, 0), 20)
        ) as a_score,
        (
          case b.source when 'manual' then 400 when 'community' then 300 when 'osm' then 200 when 'overture' then 100 else 0 end
          + case when b.status = 'active' then 50 else 0 end
          + case when b.image_url is not null then 20 else 0 end
          + case when b.address is not null then 10 else 0 end
          + least(coalesce(b.reviews, 0), 20)
        ) as b_score
      from public.cafes a
      join public.cafes b on a.id < b.id
      where regexp_replace(translate(lower(a.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g')
          = regexp_replace(translate(lower(b.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g')
        and sqrt(
          power((a.lat - b.lat) * 111320, 2)
          + power((a.lng - b.lng) * 104000, 2)
        ) <= 120
      order by greatest(
        case a.source when 'manual' then 4 when 'community' then 3 when 'osm' then 2 else 1 end,
        case b.source when 'manual' then 4 when 'community' then 3 when 'osm' then 2 else 1 end
      ) desc
      limit 1
    ) candidates;

    exit when not found;

    update public.cafes keeper
    set
      rating = coalesce(keeper.rating, duplicate.rating),
      reviews = greatest(coalesce(keeper.reviews, 0), coalesce(duplicate.reviews, 0)),
      link = coalesce(keeper.link, duplicate.link),
      image_url = coalesce(keeper.image_url, duplicate.image_url),
      image_source_url = coalesce(keeper.image_source_url, duplicate.image_source_url),
      image_attribution = coalesce(keeper.image_attribution, duplicate.image_attribution),
      image_license = coalesce(keeper.image_license, duplicate.image_license),
      address = coalesce(keeper.address, duplicate.address),
      updated_at = now()
    from public.cafes duplicate
    where keeper.id = duplicate_pair.keep_id
      and duplicate.id = duplicate_pair.remove_id;

    insert into public.user_cafes as existing (
      user_id, cafe_id, is_visited, is_favorite, in_waitlist,
      rating, review_text, visited_on, updated_at
    )
    select
      user_id, duplicate_pair.keep_id, is_visited, is_favorite, in_waitlist,
      rating, review_text, visited_on, updated_at
    from public.user_cafes
    where cafe_id = duplicate_pair.remove_id
    on conflict (user_id, cafe_id) do update set
      is_visited = existing.is_visited or excluded.is_visited,
      is_favorite = existing.is_favorite or excluded.is_favorite,
      in_waitlist = existing.in_waitlist or excluded.in_waitlist,
      rating = coalesce(excluded.rating, existing.rating),
      review_text = case
        when char_length(excluded.review_text) > char_length(existing.review_text)
          then excluded.review_text
        else existing.review_text
      end,
      visited_on = coalesce(greatest(excluded.visited_on, existing.visited_on), excluded.visited_on, existing.visited_on),
      updated_at = greatest(excluded.updated_at, existing.updated_at);

    delete from public.user_cafes where cafe_id = duplicate_pair.remove_id;
    update public.posts set cafe_id = duplicate_pair.keep_id where cafe_id = duplicate_pair.remove_id;
    update public.cafe_photos set cafe_id = duplicate_pair.keep_id where cafe_id = duplicate_pair.remove_id;
    delete from public.cafes where id = duplicate_pair.remove_id;
  end loop;
end;
$$;
