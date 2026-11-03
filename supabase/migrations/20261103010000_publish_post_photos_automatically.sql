-- Publication photos are visible immediately, including photos added by the
-- atomic publication editor. Preserve explicit administrative rejections.
create or replace function private.approve_publication_photo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.post_id is not null and new.status = 'pending' and exists (
    select 1 from public.posts p
    where p.id = new.post_id and p.user_id = new.user_id
      and p.cafe_id = new.cafe_id and p.status = 'published'
  ) then
    new.status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists approve_publication_photo on public.cafe_photos;
create trigger approve_publication_photo
before insert on public.cafe_photos
for each row execute function private.approve_publication_photo();

drop policy if exists "cafe_photos_insert_own" on public.cafe_photos;
create policy "cafe_photos_insert_own"
on public.cafe_photos for insert to authenticated
with check (
  user_id = (select auth.uid())
  and rights_confirmed
  and rights_basis in ('own', 'permission', 'open_license')
  and (
    status = 'pending' or (select private.is_admin())
    or (status = 'approved' and post_id is not null and exists (
      select 1 from public.posts p
      where p.id = cafe_photos.post_id and p.user_id = (select auth.uid())
        and p.cafe_id = cafe_photos.cafe_id and p.status = 'published'
    ))
  )
);

update public.cafe_photos cp set status = 'approved'
where cp.status = 'pending' and cp.post_id is not null
  and exists (select 1 from public.posts p
    where p.id = cp.post_id and p.user_id = cp.user_id
      and p.cafe_id = cp.cafe_id and p.status = 'published');
