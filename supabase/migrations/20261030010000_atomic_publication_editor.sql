alter table public.posts add column if not exists activity_date date
  generated always as (coalesce(visited_on,(created_at at time zone 'America/Mexico_City')::date)) stored;
create index if not exists posts_activity_date_idx on public.posts(activity_date desc,created_at desc);

create or replace function public.edit_publication(target_post_id uuid, changes jsonb, photo_items jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  original public.posts%rowtype;
  result public.posts%rowtype;
  photo public.post_images%rowtype;
  item jsonb;
  cafe text := nullif(changes->>'cafe_id','');
  content_text text := trim(coalesce(changes->>'content',''));
  day date := nullif(changes->>'visited_on','')::date;
  score numeric := nullif(changes->>'rating','')::numeric;
  interaction uuid;
  kept uuid[] := '{}';
  paths text[] := '{}';
  removed text[] := '{}';
  image_id uuid;
  image_path text;
  image_url text;
  first_url text;
  position_index smallint := 0;
begin
  select * into original from public.posts where id=target_post_id and user_id=caller for update;
  if caller is null or original.id is null then raise exception 'No puedes editar esta publicación'; end if;
  if photo_items is null or jsonb_typeof(photo_items) <> 'array' or jsonb_array_length(photo_items)>10 then raise exception 'Máximo 10 fotos'; end if;
  if length(content_text)>1000 or (content_text='' and jsonb_array_length(photo_items)=0) then raise exception 'Agrega texto o fotos'; end if;
  day := coalesce(day,original.visited_on,(original.created_at at time zone 'America/Mexico_City')::date);
  if day>(now() at time zone 'America/Mexico_City')::date then raise exception 'La fecha no puede ser futura'; end if;
  if score=0 then score:=null; end if;
  if score is not null and (score<0.5 or score>5 or score*2<>trunc(score*2)) then raise exception 'Calificación inválida'; end if;
  if cafe is not null and cafe is distinct from original.cafe_id and not exists(select 1 from public.cafes where id=cafe and status='active' and deleted_at is null) then raise exception 'Cafetería no disponible'; end if;

  for item in select value from jsonb_array_elements(photo_items) loop
    image_id := coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
    select * into photo from public.post_images where id=image_id;
    if photo.id is not null then
      if photo.post_id<>target_post_id or photo.user_id<>caller then raise exception 'Foto no autorizada'; end if;
      image_path:=photo.storage_path; image_url:=photo.public_url;
    else
      image_path:=item->>'storage_path'; image_url:=item->>'public_url';
      if image_url=original.image_url and coalesce(image_path,'')='' then image_path:='legacy:'||target_post_id; end if;
      if image_path is null or image_url is null then raise exception 'Foto incompleta'; end if;
      if image_path not like 'legacy:%' and (image_path not like caller||'/posts/'||target_post_id||'/%' or image_url not like '%/storage/v1/object/public/cafe-photos/'||image_path) then raise exception 'Ruta de foto no autorizada'; end if;
      if image_path like 'legacy:%' and image_url is distinct from original.image_url then raise exception 'Foto no autorizada'; end if;
    end if;
    if image_id=any(kept) then raise exception 'Foto repetida'; end if;
    kept:=array_append(kept,image_id); paths:=array_append(paths,image_path);
    if first_url is null then first_url:=image_url; end if;
    insert into public.post_images(id,post_id,user_id,storage_path,public_url,position)
      values(image_id,target_post_id,caller,image_path,image_url,position_index)
      on conflict(id) do update set position=excluded.position;
    position_index:=position_index+1;
  end loop;
  select coalesce(array_agg(pi.storage_path),'{}') into removed from public.post_images pi
    where pi.post_id=target_post_id and not(pi.id=any(kept)) and pi.storage_path not like 'legacy:%'
      and not exists(select 1 from public.cafes c where c.image_url=pi.public_url);
  delete from public.post_images where post_id=target_post_id and not(id=any(kept));
  delete from public.cafe_photos where post_id=target_post_id and user_id=caller and (cafe is null or not(storage_path=any(paths)));

  interaction:=original.interaction_id;
  if cafe is not null then
    if interaction is null then
      insert into public.user_cafes(user_id,cafe_id,is_visited,review_text,visited_on)
        values(caller,cafe,true,'',day) returning id into interaction;
      update public.posts set interaction_id=interaction where id=target_post_id;
    end if;
    update public.user_cafes set cafe_id=cafe,is_visited=true,review_text=content_text,rating=score,visited_on=day,
      is_favorite=coalesce((changes->>'is_favorite')::boolean,false),is_revisit=coalesce((changes->>'is_revisit')::boolean,false),updated_at=now()
      where id=interaction and user_id=caller;
    update public.cafe_photos set cafe_id=cafe where post_id=target_post_id and user_id=caller;
    insert into public.cafe_photos(cafe_id,user_id,post_id,storage_path,public_url,status,is_cover,rights_confirmed,rights_basis,rights_note)
      select cafe,caller,target_post_id,pi.storage_path,pi.public_url,'pending',false,true,'own','Foto propia de una publicación.'
      from public.post_images pi where pi.post_id=target_post_id and pi.storage_path not like 'legacy:%'
        and not exists(select 1 from public.cafe_photos cp where cp.post_id=target_post_id and cp.storage_path=pi.storage_path);
  elsif interaction is not null then
    update public.posts set interaction_id=null where id=target_post_id;
    update public.user_cafes set review_text='',updated_at=now() where id=interaction and user_id=caller;
    interaction:=null;
  end if;
  update public.posts set cafe_id=cafe,interaction_id=interaction,content=content_text,kind=case when cafe is null then 'post' else 'review' end,
    rating=case when cafe is null then null else score end,visited_on=day,is_revisit=coalesce((changes->>'is_revisit')::boolean,false),
    image_url=first_url,status='published',updated_at=now()
    where id=target_post_id returning * into result;
  return jsonb_build_object('post',to_jsonb(result),'images',coalesce((select jsonb_agg(to_jsonb(pi) order by pi.position) from public.post_images pi where pi.post_id=target_post_id),'[]'::jsonb),'removed_paths',to_jsonb(removed));
end;
$$;
revoke all on function public.edit_publication(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.edit_publication(uuid,jsonb,jsonb) to authenticated;
