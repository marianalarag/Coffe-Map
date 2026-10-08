-- Community submissions must always be approved by an administrator.
-- Older versions could publish submissions made from an administrator account
-- immediately, so place those legacy rows back in the moderation queue.

update public.cafes
set
  status = 'needs_review',
  updated_at = now()
where source = 'community'
  and submitted_by is not null
  and status = 'active';
