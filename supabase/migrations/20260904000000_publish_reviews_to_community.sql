-- Publish every review in the shared community feed while keeping profile feeds filtered.

insert into public.posts (
  user_id,
  cafe_id,
  content,
  kind,
  rating,
  visited_on,
  interaction_id,
  status,
  created_at,
  updated_at
)
select
  interaction.user_id,
  interaction.cafe_id,
  left(trim(interaction.review_text), 1000),
  'review',
  interaction.rating,
  interaction.visited_on,
  interaction.id,
  'published',
  interaction.updated_at,
  interaction.updated_at
from public.user_cafes as interaction
where nullif(trim(interaction.review_text), '') is not null
on conflict (interaction_id) do update set
  cafe_id = excluded.cafe_id,
  content = excluded.content,
  kind = 'review',
  rating = excluded.rating,
  visited_on = excluded.visited_on,
  status = 'published',
  updated_at = excluded.updated_at;

create or replace function private.sync_review_to_community()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if nullif(trim(new.review_text), '') is not null then
    insert into public.posts (
      user_id,
      cafe_id,
      content,
      kind,
      rating,
      visited_on,
      interaction_id,
      status,
      created_at,
      updated_at
    ) values (
      new.user_id,
      new.cafe_id,
      left(trim(new.review_text), 1000),
      'review',
      new.rating,
      new.visited_on,
      new.id,
      'published',
      new.updated_at,
      new.updated_at
    )
    on conflict (interaction_id) do update set
      cafe_id = excluded.cafe_id,
      content = excluded.content,
      kind = 'review',
      rating = excluded.rating,
      visited_on = excluded.visited_on,
      status = 'published',
      updated_at = excluded.updated_at;
  else
    update public.posts
    set status = 'hidden', updated_at = new.updated_at
    where interaction_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists user_cafes_sync_review_to_community on public.user_cafes;
create trigger user_cafes_sync_review_to_community
after insert or update of review_text, rating, visited_on on public.user_cafes
for each row execute function private.sync_review_to_community();

drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
on public.posts for select to authenticated
using (status = 'published' or user_id = (select auth.uid()) or (select private.is_admin()));
