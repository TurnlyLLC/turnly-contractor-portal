create extension if not exists pgcrypto;

create table if not exists public.contractor_availability (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'available'
    check (status in ('available', 'limited', 'unavailable')),
  days jsonb not null default '{
    "monday": true,
    "tuesday": true,
    "wednesday": true,
    "thursday": true,
    "friday": true,
    "saturday": false,
    "sunday": false
  }'::jsonb,
  preferred_start_time time,
  preferred_end_time time,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (contractor_id)
);

alter table public.contractor_availability enable row level security;

create index if not exists contractor_availability_contractor_idx
  on public.contractor_availability (contractor_id);

drop policy if exists "Contractors can view own availability"
  on public.contractor_availability;
create policy "Contractors can view own availability"
  on public.contractor_availability
  for select
  to authenticated
  using (contractor_id = auth.uid());

drop policy if exists "Contractors can insert own availability"
  on public.contractor_availability;
create policy "Contractors can insert own availability"
  on public.contractor_availability
  for insert
  to authenticated
  with check (contractor_id = auth.uid());

drop policy if exists "Contractors can update own availability"
  on public.contractor_availability;
create policy "Contractors can update own availability"
  on public.contractor_availability
  for update
  to authenticated
  using (contractor_id = auth.uid())
  with check (contractor_id = auth.uid());

grant select, insert, update on public.contractor_availability to authenticated;
