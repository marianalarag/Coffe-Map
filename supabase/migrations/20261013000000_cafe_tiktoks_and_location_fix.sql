-- Multiple community TikTok references per cafe, with optional oEmbed cover images.
create table if not exists public.cafe_tiktoks (
  id uuid primary key default gen_random_uuid(),
  cafe_id text not null references public.cafes(id) on delete cascade,
  url text not null,
  thumbnail_url text,
  title text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (cafe_id, url)
);

create index if not exists cafe_tiktoks_cafe_id_idx on public.cafe_tiktoks(cafe_id, position, created_at);

alter table public.cafe_tiktoks enable row level security;
drop policy if exists "cafe_tiktoks_select_authenticated" on public.cafe_tiktoks;
create policy "cafe_tiktoks_select_authenticated"
on public.cafe_tiktoks for select to authenticated
using (exists (select 1 from public.cafes where cafes.id = cafe_tiktoks.cafe_id and cafes.status = 'active') or (select private.is_admin()));

drop policy if exists "cafe_tiktoks_select_public" on public.cafe_tiktoks;
create policy "cafe_tiktoks_select_public"
on public.cafe_tiktoks for select to anon
using (exists (select 1 from public.cafes where cafes.id = cafe_tiktoks.cafe_id and cafes.status = 'active'));

drop policy if exists "cafe_tiktoks_admin_write" on public.cafe_tiktoks;
create policy "cafe_tiktoks_admin_write"
on public.cafe_tiktoks for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant select on public.cafe_tiktoks to authenticated;
grant select on public.cafe_tiktoks to anon;
grant insert, update, delete on public.cafe_tiktoks to authenticated;

-- Ratings use the half-step values displayed by the custom bean sheet.
drop trigger if exists user_cafes_sync_review_to_community on public.user_cafes;
alter table public.user_cafes drop constraint if exists user_cafes_rating_check;
alter table public.user_cafes alter column rating type numeric(2,1) using rating::numeric;
alter table public.user_cafes add constraint user_cafes_rating_check
  check (rating is null or (rating between 0.5 and 5 and mod(rating * 2, 1) = 0));
create trigger user_cafes_sync_review_to_community
after insert or update of review_text, rating, visited_on on public.user_cafes
for each row execute function private.sync_review_to_community();

-- Café Ki! was imported with the same coordinates as an unrelated community
-- submission. Move it to the verified Rosagante / La Castellana location.
update public.cafes
set lat = 21.03963526,
    lng = -89.63752179,
    address = 'Calle 34 293, Fraccionamiento La Castellana, Mérida, Yucatán, 97023',
    neighborhood = 'La Castellana',
    link = 'https://www.google.com/maps/search/?api=1&query=Rosagante%2C%20Calle%2034%20293%2C%20M%C3%A9rida%2C%20Yucat%C3%A1n',
    last_verified_at = now(),
    updated_at = now()
where id = 'community:3d663f60-19b5-4a20-ae59-7eae0cc32b9d'
  and lower(nombre) = lower('Café Ki!');
