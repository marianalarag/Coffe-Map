begin;
do $$
declare
  caller uuid;
begin
  select id into caller from public.profiles where role <> 'administrador' limit 1;
  if caller is null then raise exception 'A non-admin account is required for the RLS check'; end if;
  perform set_config('request.jwt.claim.sub', caller::text, true);
  set local role authenticated;
  insert into public.cafes(id,nombre,lat,lng,address,link,source,source_id,status,submitted_by)
    values('community:submission-schema-check','Submission schema check',null,null,'Test address',
      'https://maps.app.goo.gl/test','community','submission-schema-check','needs_review',caller);
  reset role;
  begin
    update public.cafes set status='active' where id='community:submission-schema-check';
    raise exception 'Publishing a cafe without coordinates must be rejected';
  exception when check_violation then
    null;
  end;
end $$;
rollback;
