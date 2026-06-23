create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid()
);

alter table public.clients
  add column if not exists id uuid default gen_random_uuid();

update public.clients
set id = gen_random_uuid()
where id is null;

alter table public.clients
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clients'::regclass
      and contype = 'p'
  ) then
    alter table public.clients
      add constraint clients_pkey primary key (id);
  end if;
end;
$$;

alter table public.clients
  add column if not exists name text not null default '',
  add column if not exists company_name text not null default '',
  add column if not exists primary_contact_name text not null default '',
  add column if not exists primary_contact_email text not null default '',
  add column if not exists primary_contact_phone text not null default '',
  add column if not exists status text not null default 'active',
  add column if not exists client_type text not null default '',
  add column if not exists region text not null default '',
  add column if not exists market text not null default '',
  add column if not exists property_count integer not null default 0,
  add column if not exists annual_revenue numeric(12, 2),
  add column if not exists contract_start_date date,
  add column if not exists renewal_date date,
  add column if not exists account_manager_id uuid references auth.users(id),
  add column if not exists account_manager_name text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists notes text not null default '',
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.clients
set
  name = coalesce(name, ''),
  company_name = coalesce(company_name, ''),
  primary_contact_name = coalesce(primary_contact_name, ''),
  primary_contact_email = coalesce(primary_contact_email, ''),
  primary_contact_phone = coalesce(primary_contact_phone, ''),
  status = coalesce(nullif(status, ''), 'active'),
  client_type = coalesce(client_type, ''),
  region = coalesce(region, ''),
  market = coalesce(nullif(market, ''), region, ''),
  property_count = coalesce(property_count, 0),
  tags = coalesce(tags, '{}'),
  notes = coalesce(notes, ''),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.clients
  alter column name set default '',
  alter column name set not null,
  alter column company_name set default '',
  alter column company_name set not null,
  alter column primary_contact_name set default '',
  alter column primary_contact_name set not null,
  alter column primary_contact_email set default '',
  alter column primary_contact_email set not null,
  alter column primary_contact_phone set default '',
  alter column primary_contact_phone set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column client_type set default '',
  alter column client_type set not null,
  alter column region set default '',
  alter column region set not null,
  alter column market set default '',
  alter column market set not null,
  alter column property_count set default 0,
  alter column property_count set not null,
  alter column account_manager_name set default '',
  alter column account_manager_name set not null,
  alter column tags set default '{}',
  alter column tags set not null,
  alter column notes set default '',
  alter column notes set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;

create trigger clients_set_updated_at
  before update on public.clients
  for each row
  execute function public.set_updated_at();

create index if not exists clients_status_idx
  on public.clients (status);

create index if not exists clients_renewal_date_idx
  on public.clients (renewal_date);

create index if not exists clients_account_manager_idx
  on public.clients (account_manager_id);

create index if not exists clients_account_manager_name_idx
  on public.clients (account_manager_name);

alter table public.clients enable row level security;

drop policy if exists "Authenticated users can read clients" on public.clients;
create policy "Authenticated users can read clients"
  on public.clients for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create clients" on public.clients;
create policy "Authenticated users can create clients"
  on public.clients for insert
  to authenticated
  with check (created_by is null or created_by = auth.uid());

drop policy if exists "Authenticated users can update clients" on public.clients;
create policy "Authenticated users can update clients"
  on public.clients for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete clients" on public.clients;
create policy "Authenticated users can delete clients"
  on public.clients for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.clients to authenticated;

notify pgrst, 'reload schema';
