create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text not null default '',
  primary_contact_name text not null default '',
  primary_contact_email text not null default '',
  primary_contact_phone text not null default '',
  status text not null default 'active',
  client_type text not null default '',
  region text not null default '',
  market text not null default '',
  property_count integer not null default 0,
  annual_revenue numeric(12, 2),
  contract_start_date date,
  renewal_date date,
  account_manager_id uuid references auth.users(id),
  account_manager_name text not null default '',
  tags text[] not null default '{}',
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
