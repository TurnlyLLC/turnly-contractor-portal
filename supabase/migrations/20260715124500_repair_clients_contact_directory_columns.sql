alter table public.clients
  add column if not exists property_name text not null default '',
  add column if not exists billing_address text,
  add column if not exists address text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists access_notes text not null default '',
  add column if not exists unit_notes text not null default '',
  add column if not exists notes text not null default '';

update public.clients
set
  property_name = coalesce(nullif(trim(property_name), ''), nullif(trim(name), ''), nullif(trim(company_name), ''), 'Unnamed property'),
  billing_address = nullif(trim(coalesce(billing_address, '')), ''),
  address = coalesce(address, ''),
  city = coalesce(city, ''),
  state = coalesce(state, ''),
  postal_code = coalesce(postal_code, ''),
  access_notes = coalesce(access_notes, ''),
  unit_notes = coalesce(unit_notes, ''),
  notes = coalesce(notes, '')
where true;

create index if not exists clients_property_name_idx
  on public.clients (property_name);

create index if not exists clients_city_state_idx
  on public.clients (city, state);

notify pgrst, 'reload schema';
