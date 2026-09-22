-- Repair the known doubly decoded open-data name already stored in production.
update public.cafes
set nombre = 'Juan Valdez Café'
where nombre in ('Juan Valdez CafÃƒÂ©', 'Juan Valdez CafÃ©');
