-- Automated catalog records are trusted source data, not community requests.
-- Publish them so public exploration includes the complete imported catalog.
-- Community submissions in needs_review remain hidden until moderation.

update public.cafes
set
  status = 'active',
  last_verified_at = coalesce(last_verified_at, now()),
  updated_at = now()
where source in ('osm', 'overture', 'manual')
  and status = 'needs_review';
