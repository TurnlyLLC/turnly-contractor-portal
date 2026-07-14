alter table public.clients
  add column if not exists billing_address text,
  add column if not exists access_notes text not null default '',
  add column if not exists unit_notes text not null default '',
  add column if not exists notes text not null default '';

update public.clients
set
  billing_address = nullif(trim(coalesce(billing_address, '')), ''),
  access_notes = coalesce(access_notes, ''),
  unit_notes = coalesce(unit_notes, ''),
  notes = coalesce(notes, '')
where true;

notify pgrst, 'reload schema';
