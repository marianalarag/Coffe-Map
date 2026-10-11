-- Social links shown on cafe cards and maintained from the admin control center.
alter table public.cafes add column if not exists instagram_url text;
alter table public.cafes add column if not exists tiktok_url text;

comment on column public.cafes.instagram_url is 'Public Instagram profile or cafe account URL.';
comment on column public.cafes.tiktok_url is 'Public TikTok profile or cafe account URL.';
