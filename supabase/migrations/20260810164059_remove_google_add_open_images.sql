-- Remove paid Google integrations and retain only open/community data sources.
drop function if exists public.reserve_google_api_usage(text, text, integer, integer);
drop table if exists public.google_api_usage_monthly;

delete from public.cafes
where source = 'google_places';

alter table public.cafes
  add column if not exists image_source_url text,
  add column if not exists image_attribution text,
  add column if not exists image_license text;

alter table public.cafes drop constraint if exists cafes_source_check;
alter table public.cafes add constraint cafes_source_check
check (source in ('manual', 'community', 'osm', 'overture'));

comment on column public.cafes.image_source_url is
  'Canonical source page for an openly licensed cafe image.';
comment on column public.cafes.image_attribution is
  'Creator or credit required by the image license.';
comment on column public.cafes.image_license is
  'Short image license identifier, for example CC BY-SA 4.0.';
