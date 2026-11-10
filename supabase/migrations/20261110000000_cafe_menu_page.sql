alter table public.cafes add column if not exists menu_page_url text;

comment on column public.cafes.menu_page_url is 'Official web page or PDF for this cafe menu. Distinct from menu_url, which stores menu image URLs.';
