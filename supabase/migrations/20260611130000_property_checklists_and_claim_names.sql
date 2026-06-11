-- Add contractor display names for claims and property-specific checklists.

create extension if not exists pgcrypto;

alter table public.assignment_blocks
  add column if not exists claimed_by_name text;

alter table public.profiles
  add column if not exists full_name text;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  name text not null,
  address text,
  default_service_type text,
  default_scope text,
  supplies_notes text,
  special_instructions text,
  access_notes text,
  checklist_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists default_service_type text,
  add column if not exists default_scope text,
  add column if not exists supplies_notes text,
  add column if not exists special_instructions text,
  add column if not exists access_notes text,
  add column if not exists checklist_items jsonb not null default '[]'::jsonb,
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

drop trigger if exists properties_set_updated_at on public.properties;

create trigger properties_set_updated_at
before update on public.properties
for each row
execute function public.set_updated_at();

alter table public.properties enable row level security;

drop policy if exists "Admins can view properties" on public.properties;
drop policy if exists "Admins can insert properties" on public.properties;
drop policy if exists "Admins can update properties" on public.properties;
drop policy if exists "Admins can delete properties" on public.properties;

create policy "Admins can view properties"
  on public.properties
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

create policy "Admins can insert properties"
  on public.properties
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

create policy "Admins can update properties"
  on public.properties
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

create policy "Admins can delete properties"
  on public.properties
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
