begin;
do $$
declare
  caller uuid;
  cafe text := 'test:app-rating:' || gen_random_uuid();
  first_visit uuid;
  second_visit uuid;
  unrated uuid;
  stamp timestamptz;
  average numeric;
  total bigint;
begin
  select id into caller from public.profiles where role <> 'administrador' limit 1;
  if caller is null then raise exception 'Missing test account'; end if;
  insert into public.cafes(id, nombre, lat, lng, source, status) values(cafe, 'App rating transaction test', 21, -89.6, 'manual', 'active');
  insert into public.user_cafes(user_id, cafe_id, rating, is_visited, is_favorite, visited_on) values(caller, cafe, 4, true, true, current_date - 2) returning id, rated_at into first_visit, stamp;
  select rating, rating_count into average, total from public.get_cafe_app_ratings() where cafe_id = cafe;
  if average <> 4 or total <> 1 then raise exception 'A single app rating must be its own average'; end if;
  insert into public.user_cafes(user_id, cafe_id, rating, is_visited, is_favorite, visited_on) values(caller, cafe, 3.5, true, true, current_date - 1) returning id into second_visit;
  insert into public.user_cafes(user_id, cafe_id, rating, is_visited, is_favorite, visited_on) values(caller, cafe, null, true, true, current_date) returning id into unrated;
  select rating, rating_count into average, total from public.get_cafe_app_ratings() where cafe_id = cafe;
  if average <> 3.75 or total <> 2 then raise exception 'Unrated visits must not change the average or count'; end if;
  update public.user_cafes set is_favorite = false where id = second_visit;
  if exists(select 1 from public.user_cafes where cafe_id = cafe and is_favorite) then raise exception 'Favorite preferences must be shared across every visit'; end if;
  if not exists(select 1 from public.user_cafes where id = first_visit and rated_at = stamp) then raise exception 'Favorite changes must preserve the rating timestamp'; end if;
  update public.user_cafes set rating = null where id = second_visit;
  select rating, rating_count into average, total from public.get_cafe_app_ratings() where cafe_id = cafe;
  if average <> 4 or total <> 1 then raise exception 'Removing a rating must update the average'; end if;
  delete from public.user_cafes where id = first_visit;
  if exists(select 1 from public.get_cafe_app_ratings() where cafe_id = cafe) then raise exception 'Unrated cafes must not have a fabricated rating'; end if;
  if not has_function_privilege('anon', 'public.get_cafe_app_ratings()', 'execute') then raise exception 'Public averages must be available without private user data'; end if;
end $$;
rollback;
