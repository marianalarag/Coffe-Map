-- Preserve real place metadata for cards and personalized recommendations.
alter table public.cafes
add column if not exists category text not null default 'cafeteria';

update public.cafes
set category = 'panaderia'
where lower(nombre) ~ '(panader|bakery|pasteler|reposter|bake|bread|croissant|boulanger)';

alter table public.cafes drop constraint if exists cafes_category_check;
alter table public.cafes add constraint cafes_category_check
check (category in ('cafeteria', 'panaderia'));
