-- Store property client/property-manager records used by properties.client_id.

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.properties
  add column if not exists client_id uuid;

drop trigger if exists clients_set_updated_at on public.clients;

create trigger clients_set_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

alter table public.clients enable row level security;

drop policy if exists "Admins can view clients" on public.clients;
drop policy if exists "Admins can insert clients" on public.clients;
drop policy if exists "Admins can update clients" on public.clients;
drop policy if exists "Admins can delete clients" on public.clients;

create policy "Admins can view clients"
  on public.clients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can insert clients"
  on public.clients
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update clients"
  on public.clients
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can delete clients"
  on public.clients
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create index if not exists clients_name_idx
  on public.clients (name);

create index if not exists properties_client_id_idx
  on public.properties (client_id);
