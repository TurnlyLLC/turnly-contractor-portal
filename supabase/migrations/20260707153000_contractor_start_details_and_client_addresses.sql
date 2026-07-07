alter table public.clients
  add column if not exists property_name text not null default '',
  add column if not exists address text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists access_notes text not null default '';

create index if not exists clients_property_name_idx
  on public.clients (property_name);

create index if not exists clients_city_state_idx
  on public.clients (city, state);

alter table public.assignment_blocks
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_to_name text,
  add column if not exists assigned_to_email text,
  add column if not exists claimed_by uuid references auth.users(id) on delete set null,
  add column if not exists claimed_by_name text,
  add column if not exists claimed_by_email text,
  add column if not exists claimed_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists started_by uuid references auth.users(id),
  add column if not exists start_notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists assignment_blocks_assigned_to_idx
  on public.assignment_blocks (assigned_to);

drop policy if exists "Contractors can start claimed assignments"
  on public.assignment_blocks;

create policy "Contractors can start claimed assignments"
  on public.assignment_blocks
  for update
  to authenticated
  using (
    (claimed_by = auth.uid() or assigned_to = auth.uid())
    and status in ('open', 'preferred_pending', 'claimed', 'scheduled')
  )
  with check (
    claimed_by = auth.uid()
    and status = 'in_progress'
    and started_by = auth.uid()
    and started_at is not null
  );

notify pgrst, 'reload schema';
