-- Admin submissions are trusted and should not remain in the review queue.

update public.cafes as cafe
set
  status = 'active',
  last_verified_at = coalesce(cafe.last_verified_at, now()),
  updated_at = now()
where cafe.status = 'needs_review'
  and cafe.submitted_by in (
    select users.id
    from auth.users as users
    where lower(users.email) = lower('marianalarag@outlook.com')
  );
