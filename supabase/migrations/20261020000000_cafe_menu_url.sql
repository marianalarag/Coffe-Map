alter table public.cafes add column if not exists menu_url text;

comment on column public.cafes.menu_url is 'Public link to the cafe menu.';
