-- Older installed clients can still attempt to upsert bundled scan data.
-- Catalog records are edited through UPDATE; imports may only add new IDs.
create or replace function private.preserve_managed_cafe_fields()
returns trigger language plpgsql set search_path = public, private as $$
declare headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
  if coalesce(headers->>'prefer','') like '%resolution=merge-duplicates%' then return old; end if;
  return new;
end;
$$;
create trigger cafes_preserve_managed_fields before update on public.cafes
  for each row execute function private.preserve_managed_cafe_fields();
