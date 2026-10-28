-- Keep contributions when Maps is temporarily unavailable. Only reviewed
-- records with real coordinates can become visible on the public map.
alter table public.cafes alter column lat drop not null;
alter table public.cafes alter column lng drop not null;
alter table public.cafes add constraint cafes_active_coordinates_check
  check (status <> 'active' or (
    lat is not null and lng is not null
    and lat between -90 and 90 and lng between -180 and 180
  ));
