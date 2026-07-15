alter table public.client_contracts
  add column if not exists billing_address text,
  add column if not exists address text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists access_notes text not null default '',
  add column if not exists unit_notes text not null default '',
  add column if not exists notes text not null default '';

update public.client_contracts as contracts
set
  billing_address = coalesce(nullif(trim(contracts.billing_address), ''), clients.billing_address),
  address = coalesce(nullif(trim(contracts.address), ''), clients.address, ''),
  city = coalesce(nullif(trim(contracts.city), ''), clients.city, ''),
  state = coalesce(nullif(trim(contracts.state), ''), clients.state, ''),
  postal_code = coalesce(nullif(trim(contracts.postal_code), ''), clients.postal_code, ''),
  access_notes = coalesce(nullif(trim(contracts.access_notes), ''), clients.access_notes, ''),
  unit_notes = coalesce(nullif(trim(contracts.unit_notes), ''), clients.unit_notes, ''),
  notes = coalesce(nullif(trim(contracts.notes), ''), clients.notes, '')
from public.clients as clients
where contracts.id = clients.id;

notify pgrst, 'reload schema';
