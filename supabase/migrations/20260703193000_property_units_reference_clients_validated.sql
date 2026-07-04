update public.property_units as unit
set property_id = property.client_id
from public.portal_properties as property
where unit.property_id = property.id
  and property.client_id is not null
  and exists (
    select 1
    from public.clients as client
    where client.id = property.client_id
  )
  and unit.property_id <> property.client_id;

alter table public.property_units
  drop constraint if exists property_units_property_id_fkey;

alter table public.property_units
  add constraint property_units_property_id_fkey
  foreign key (property_id)
  references public.clients(id)
  on delete cascade
  not valid;

do $$
begin
  if not exists (
    select 1
    from public.property_units as unit
    left join public.clients as client
      on client.id = unit.property_id
    where client.id is null
  ) then
    execute 'alter table public.property_units validate constraint property_units_property_id_fkey';
  end if;
end $$;
