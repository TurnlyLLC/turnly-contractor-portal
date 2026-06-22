-- Persist every editable field on the admin Leads page.

alter table public.portal_properties
  add column if not exists property_type text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists expected_close_date date;

create index if not exists portal_properties_property_type_idx
  on public.portal_properties(property_type);

create index if not exists portal_properties_city_state_idx
  on public.portal_properties(city, state);

create index if not exists portal_properties_expected_close_date_idx
  on public.portal_properties(expected_close_date)
  where expected_close_date is not null;
