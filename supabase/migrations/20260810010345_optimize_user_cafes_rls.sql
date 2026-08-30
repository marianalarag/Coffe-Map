create index if not exists user_cafes_cafe_id_idx
on public.user_cafes(cafe_id);

drop policy if exists "user_cafes_select_own" on public.user_cafes;
create policy "user_cafes_select_own"
on public.user_cafes for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "user_cafes_insert_own" on public.user_cafes;
create policy "user_cafes_insert_own"
on public.user_cafes for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "user_cafes_update_own" on public.user_cafes;
create policy "user_cafes_update_own"
on public.user_cafes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "user_cafes_delete_own" on public.user_cafes;
create policy "user_cafes_delete_own"
on public.user_cafes for delete
to authenticated
using ((select auth.uid()) = user_id);
