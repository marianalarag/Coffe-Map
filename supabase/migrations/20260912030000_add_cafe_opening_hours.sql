alter table public.cafes
  add column if not exists opening_hours text,
  add column if not exists opening_hours_source text;

alter table public.cafes drop constraint if exists cafes_opening_hours_source_check;
alter table public.cafes add constraint cafes_opening_hours_source_check
check (opening_hours_source is null or opening_hours_source in ('osm', 'admin'));
