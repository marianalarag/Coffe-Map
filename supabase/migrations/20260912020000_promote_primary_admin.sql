-- Promote the primary Coffee Map account. Match the public username or the
-- corresponding Auth identity because the visible profile can be "mariana".
update public.profiles as profile
set role = 'administrador', updated_at = now()
from auth.users as account
where profile.id = account.id
  and (
    lower(trim(profile.username)) in ('marianalarag', 'marianalaraag')
    or lower(split_part(coalesce(account.email, ''), '@', 1)) in ('marianalarag', 'marianalaraag')
    or lower(trim(coalesce(account.raw_user_meta_data ->> 'username', ''))) in ('marianalarag', 'marianalaraag')
  );

do $$
begin
  if not exists (
    select 1 from public.profiles as profile
    join auth.users as account on profile.id = account.id
    where profile.id = account.id
      and profile.role = 'administrador'
      and (
        lower(trim(profile.username)) in ('marianalarag', 'marianalaraag')
        or lower(split_part(coalesce(account.email, ''), '@', 1)) in ('marianalarag', 'marianalaraag')
        or lower(trim(coalesce(account.raw_user_meta_data ->> 'username', ''))) in ('marianalarag', 'marianalaraag')
      )
  ) then
    raise exception 'No se encontró el perfil marianalarag para activar el rol administrador';
  end if;
end;
$$;
