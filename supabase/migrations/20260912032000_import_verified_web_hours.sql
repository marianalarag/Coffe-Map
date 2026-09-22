alter table public.cafes
  add column if not exists opening_hours_source_url text,
  add column if not exists opening_hours_verified_at timestamptz;

alter table public.cafes drop constraint if exists cafes_opening_hours_source_check;
alter table public.cafes add constraint cafes_opening_hours_source_check
check (opening_hours_source is null or opening_hours_source in ('osm', 'admin', 'web', 'community'));

-- Horarios contrastados por sucursal. No reemplazan correcciones hechas por un administrador.
update public.cafes set opening_hours = 'We-Su 08:30-14:00; Mo-Tu off', opening_hours_source = 'web', opening_hours_source_url = 'https://www.rappi.com.mx/restaurantes/1930331795-alma-calida', opening_hours_verified_at = now()
where id = 'osm:node:13543569601' and opening_hours_source is distinct from 'admin';

update public.cafes set opening_hours = 'Mo-Sa 08:00-21:00; Su 08:00-14:00', opening_hours_source = 'web', opening_hours_source_url = 'https://restaurantguru.com/Manifesto-Casa-Tostadora-Calabrese-Merida', opening_hours_verified_at = now()
where id = 'osm:node:5411151722' and opening_hours_source is distinct from 'admin';

update public.cafes set opening_hours = 'Mo-Su 08:00-22:00', opening_hours_source = 'web', opening_hours_source_url = 'https://www.waze.com/live-map/directions/mx/yuc./merida/placer-and-delirio?to=place.ChIJvQbiPdxzVo8RfdrnqAOowoI', opening_hours_verified_at = now()
where id = 'osm:node:8263119752' and opening_hours_source is distinct from 'admin';

update public.cafes set opening_hours = 'Mo-Su 08:00-22:00', opening_hours_source = 'web', opening_hours_source_url = 'https://www.tripadvisor.com.mx/Restaurant_Review-g150811-d12816306-Reviews-Marago_Coffee-Merida_Yucatan_Peninsula.html', opening_hours_verified_at = now()
where id = 'osm:node:7107954328' and opening_hours_source is distinct from 'admin';

update public.cafes set opening_hours = 'Mo-Su 07:00-00:00', opening_hours_source = 'web', opening_hours_source_url = 'https://www.allbiz.mx/caf%C3%A9-chuc-999-750-9675', opening_hours_verified_at = now()
where id = 'osm:node:9583751917' and opening_hours_source is distinct from 'admin';

update public.cafes set opening_hours = 'Mo-Su 10:00-23:30', opening_hours_source = 'web', opening_hours_source_url = 'https://flii.org/wp-content/uploads/2019/07/Welcome-to-FLIIConnect_Participant-Manual_2024.pdf', opening_hours_verified_at = now()
where id = 'osm:node:4384694190' and opening_hours_source is distinct from 'admin';
