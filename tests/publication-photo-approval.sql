-- Integration probe: run against a database with published cafe photos.
-- Copies sample metadata into a temporary table, tests the real trigger and
-- rolls back; never changes publication photos or their moderation decisions.
begin;
create temp table photo_approval_probe (like public.cafe_photos including defaults);
create trigger approve_publication_photo before insert on photo_approval_probe
for each row execute function private.approve_publication_photo();
insert into photo_approval_probe(cafe_id,user_id,post_id,storage_path,public_url,status)
select cp.cafe_id,cp.user_id,cp.post_id,cp.storage_path,cp.public_url,states.status
from public.cafe_photos cp join public.posts p on p.id=cp.post_id
cross join (values ('pending'),('rejected')) states(status)
where p.status='published';
do $$ begin
  if not exists(select 1 from photo_approval_probe) then raise exception 'No probe samples'; end if;
  if exists(select 1 from photo_approval_probe where status='pending') then raise exception 'Auto approval failed'; end if;
  if not exists(select 1 from photo_approval_probe where status='rejected') then raise exception 'Rejection was lost'; end if;
end $$;
rollback;
