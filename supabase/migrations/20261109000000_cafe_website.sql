alter table public.cafes add column if not exists website_url text;
comment on column public.cafes.website_url is 'Official website URL for this cafe.';
