-- Record why Coffee Map is allowed to publish every community photo.
alter table public.cafe_photos
  add column if not exists rights_confirmed boolean not null default false,
  add column if not exists rights_basis text,
  add column if not exists rights_note text;

alter table public.cafe_photos drop constraint if exists cafe_photos_rights_basis_check;
alter table public.cafe_photos add constraint cafe_photos_rights_basis_check
check (rights_basis is null or rights_basis in ('own', 'permission', 'open_license'));

alter table public.cafe_photos drop constraint if exists cafe_photos_rights_note_length_check;
alter table public.cafe_photos add constraint cafe_photos_rights_note_length_check
check (rights_note is null or char_length(rights_note) <= 500);

drop policy if exists "cafe_photos_insert_own" on public.cafe_photos;
create policy "cafe_photos_insert_own"
on public.cafe_photos for insert to authenticated
with check (
  user_id = (select auth.uid())
  and rights_confirmed
  and rights_basis in ('own', 'permission', 'open_license')
  and (status = 'pending' or (select private.is_admin()))
);

comment on column public.cafe_photos.rights_confirmed is
  'Uploader explicitly confirmed they own the photo, have permission, or verified an open license.';
comment on column public.cafe_photos.rights_basis is
  'Rights basis: own, permission, or open_license.';
comment on column public.cafe_photos.rights_note is
  'Optional provenance or permission note for moderation.';
