begin;
do $$
declare
  caller uuid; cafe text; visit uuid; publication uuid; generic uuid;
  photo1 uuid:=gen_random_uuid(); photo2 uuid:=gen_random_uuid(); staged uuid:=gen_random_uuid();
  path1 text; path2 text; result jsonb; saved jsonb; total integer;
begin
  select id into caller from public.profiles where role<>'administrador' limit 1;
  select id into cafe from public.cafes where status='active' and deleted_at is null limit 1;
  if caller is null or cafe is null then raise exception 'Missing test fixture'; end if;
  perform set_config('request.jwt.claim.sub',caller::text,true);
  insert into public.user_cafes(user_id,cafe_id,is_visited,visited_on) values(caller,cafe,true,current_date) returning id into visit;
  insert into public.user_cafes(user_id,cafe_id,is_visited,visited_on) values(caller,cafe,true,current_date);
  insert into public.posts(user_id,cafe_id,interaction_id,kind,content,status,visited_on)
    values(caller,cafe,visit,'review','Original','published',current_date) returning id into publication;
  path1:=caller||'/posts/'||publication||'/one.jpg';
  path2:=caller||'/posts/'||publication||'/two.jpg';
  result:=public.edit_publication(publication,jsonb_build_object('cafe_id',cafe,'content','Edited','rating',4.5,'visited_on',current_date-2,'is_favorite',true,'is_revisit',true),
    jsonb_build_array(jsonb_build_object('id',photo1,'storage_path',path1,'public_url','https://zuojhckhlphpkcwcufae.supabase.co/storage/v1/object/public/cafe-photos/'||path1),
                     jsonb_build_object('id',photo2,'storage_path',path2,'public_url','https://zuojhckhlphpkcwcufae.supabase.co/storage/v1/object/public/cafe-photos/'||path2)));
  if result->'post'->>'content'<>'Edited' or (result->'post'->>'activity_date')::date<>current_date-2 then raise exception 'Metadata or activity date was not saved'; end if;
  if not exists(select 1 from public.user_cafes where id=visit and rating=4.5 and is_favorite and is_revisit) then raise exception 'Visit metadata was not saved'; end if;
  select count(*) into total from public.cafe_photos where post_id=publication;
  if total<>2 then raise exception 'Publication gallery not synchronized'; end if;
  saved:=result;
  begin
    perform public.edit_publication(publication,jsonb_build_object('cafe_id',cafe,'content','Must roll back','visited_on',current_date),
      jsonb_build_array(jsonb_build_object('id',staged,'storage_path',caller||'/posts/'||publication||'/staged.jpg','public_url','https://zuojhckhlphpkcwcufae.supabase.co/storage/v1/object/public/cafe-photos/'||caller||'/posts/'||publication||'/staged.jpg'),
                       jsonb_build_object('id',gen_random_uuid(),'storage_path','someone-else/photo.jpg','public_url','https://example.com/wrong.jpg')));
    raise exception 'Expected unauthorized image to fail';
  exception when raise_exception then
    if sqlerrm='Expected unauthorized image to fail' then raise; end if;
  end;
  if exists(select 1 from public.post_images where id=staged) or exists(select 1 from public.posts where id=publication and content<>'Edited') then raise exception 'Edit was not atomic'; end if;
  -- Reverse the kept images without reuploading them.
  result:=public.edit_publication(publication,jsonb_build_object('cafe_id',cafe,'content','Reordered','visited_on',current_date-1),
    jsonb_build_array(saved->'images'->1,saved->'images'->0));
  if result->'images'->0->>'id'<>photo2::text then raise exception 'Image order not saved'; end if;
  insert into public.posts(user_id,content,kind,status,visited_on) values(caller,'General post','post','published',current_date) returning id into generic;
  result:=public.edit_publication(generic,jsonb_build_object('cafe_id',cafe,'content','Now a review','rating',3,'visited_on',current_date),'[]');
  if result->'post'->>'id'<>generic::text or result->'post'->>'interaction_id' is null then raise exception 'Converting to a review created another publication'; end if;
  result:=public.edit_publication(generic,jsonb_build_object('content','General again','visited_on',current_date),'[]');
  if result->'post'->>'kind'<>'post' or result->'post'->>'status'<>'published' then raise exception 'Detaching cafe failed'; end if;
  insert into public.cafes(id,nombre,lat,lng,source,status,image_url,opening_hours)
    values('test:catalog-guard','Managed cafe',21,-89.6,'manual','active','https://example.test/saved-cover.jpg','Mo-Su 08:00-22:00');
  perform set_config('request.headers','{"prefer":"resolution=merge-duplicates"}',true);
  insert into public.cafes(id,nombre,lat,lng,source,status,image_url,opening_hours)
    values('test:catalog-guard','Old import',21,-89.6,'manual','active',null,null)
    on conflict(id) do update set nombre=excluded.nombre,image_url=excluded.image_url,opening_hours=excluded.opening_hours;
  if not exists(select 1 from public.cafes where id='test:catalog-guard' and nombre='Managed cafe' and image_url is not null and opening_hours is not null) then raise exception 'An import overwrote managed fields'; end if;
  perform set_config('request.headers','{}',true);
  update public.cafes set status='closed',deleted_at=now() where id='test:catalog-guard';
  begin
    update public.cafes set status='active' where id='test:catalog-guard';
    raise exception 'Expected deleted cafe to stay inactive';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.edit_publication(publication,jsonb_build_object('content','Unauthorized'),'[]');
    raise exception 'Expected ownership check to fail';
  exception when raise_exception then
    if sqlerrm='Expected ownership check to fail' then raise; end if;
  end;
end $$;
rollback;
