create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.portal_properties(id) on delete cascade,
  unit_name text not null default '',
  square_feet numeric(12, 2) not null default 0,
  customer_price numeric(12, 2) not null default 0,
  contractor_pay numeric(12, 2) not null default 0,
  status text not null default 'active',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_units
  add column if not exists property_id uuid references public.portal_properties(id) on delete cascade,
  add column if not exists unit_name text not null default '',
  add column if not exists square_feet numeric(12, 2) not null default 0,
  add column if not exists customer_price numeric(12, 2) not null default 0,
  add column if not exists contractor_pay numeric(12, 2) not null default 0,
  add column if not exists status text not null default 'active',
  add column if not exists notes text not null default '',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.property_units
set
  unit_name = coalesce(nullif(unit_name, ''), 'Unit'),
  square_feet = greatest(coalesce(square_feet, 0), 0),
  customer_price = greatest(coalesce(customer_price, 0), 0),
  contractor_pay = greatest(coalesce(contractor_pay, 0), 0),
  status = coalesce(nullif(status, ''), 'active'),
  notes = coalesce(notes, '');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_units_property_unit_name_key'
      and conrelid = 'public.property_units'::regclass
  ) then
    alter table public.property_units
      add constraint property_units_property_unit_name_key unique (property_id, unit_name);
  end if;
end $$;

create index if not exists property_units_property_idx
  on public.property_units (property_id);

create index if not exists property_units_status_idx
  on public.property_units (status);

create or replace function public.set_property_units_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_property_units_updated_at'
      and tgrelid = 'public.property_units'::regclass
  ) then
    create trigger set_property_units_updated_at
      before update on public.property_units
      for each row
      execute function public.set_property_units_updated_at();
  end if;
end $$;

alter table public.property_units enable row level security;

drop policy if exists "Authenticated users can read property units" on public.property_units;
create policy "Authenticated users can read property units"
  on public.property_units for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create property units" on public.property_units;
create policy "Authenticated users can create property units"
  on public.property_units for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "Authenticated users can update property units" on public.property_units;
create policy "Authenticated users can update property units"
  on public.property_units for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete property units" on public.property_units;
create policy "Authenticated users can delete property units"
  on public.property_units for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.property_units to authenticated;