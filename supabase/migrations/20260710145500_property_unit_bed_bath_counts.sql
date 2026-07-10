-- Track bedroom and bathroom counts on property units.

alter table public.property_units
  add column if not exists bedroom_count numeric(5, 2) not null default 0,
  add column if not exists bathroom_count numeric(5, 2) not null default 0;

update public.property_units
set
  bedroom_count = greatest(coalesce(bedroom_count, 0), 0),
  bathroom_count = greatest(coalesce(bathroom_count, 0), 0);

comment on column public.property_units.bedroom_count is 'Bedroom count for this property unit.';
comment on column public.property_units.bathroom_count is 'Bathroom count for this property unit; half baths may be stored as decimals.';

notify pgrst, 'reload schema';
