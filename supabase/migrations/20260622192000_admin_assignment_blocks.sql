-- Assignment blocks power admin-created work that contractors can claim,
-- complete, and sync across accounts.

create table if not exists public.assignment_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Assignment',
  property_id uuid references public.portal_properties(id) on delete set null,
  property_name text not null default '',
  address text,
  service_type text,
  pay_amount numeric(12, 2) not null default 0,
  scope text not null default '',
  supplies_notes text not null default '',
  special_instructions text not null default '',
  status text not null default 'open',
  priority text not null default 'normal',
  start_window timestamptz,
  end_window timestamptz,
  assignment_type text not null default 'one_time',
  recurrence_frequency text not null default 'one_time',
  recurrence_interval integer not null default 1,
  recurrence_end_date date,
  auto_renewal boolean not null default false,
  recurring_group_id uuid,
  source_assignment_id uuid references public.assignment_blocks(id) on delete set null,
  preferred_first boolean not null default false,
  preferred_contractor_ids uuid[] not null default '{}'::uuid[],
  preferred_contractor_names text[] not null default '{}'::text[],
  preferred_until timestamptz,
  visibility text not null default 'open',
  declined_contractor_ids uuid[] not null default '{}'::uuid[],
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_by_name text,
  claimed_by_email text,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_to_name text,
  assigned_to_email text,
  accepted_at timestamptz,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_notes text,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assignment_blocks
  add column if not exists title text not null default 'Assignment',
  add column if not exists property_id uuid references public.portal_properties(id) on delete set null,
  add column if not exists property_name text not null default '',
  add column if not exists address text,
  add column if not exists service_type text,
  add column if not exists pay_amount numeric(12, 2) not null default 0,
  add column if not exists scope text not null default '',
  add column if not exists supplies_notes text not null default '',
  add column if not exists special_instructions text not null default '',
  add column if not exists status text not null default 'open',
  add column if not exists priority text not null default 'normal',
  add column if not exists start_window timestamptz,
  add column if not exists end_window timestamptz,
  add column if not exists assignment_type text not null default 'one_time',
  add column if not exists recurrence_frequency text not null default 'one_time',
  add column if not exists recurrence_interval integer not null default 1,
  add column if not exists recurrence_end_date date,
  add column if not exists auto_renewal boolean not null default false,
  add column if not exists recurring_group_id uuid,
  add column if not exists source_assignment_id uuid references public.assignment_blocks(id) on delete set null,
  add column if not exists preferred_first boolean not null default false,
  add column if not exists preferred_contractor_ids uuid[] not null default '{}'::uuid[],
  add column if not exists preferred_contractor_names text[] not null default '{}'::text[],
  add column if not exists preferred_until timestamptz,
  add column if not exists visibility text not null default 'open',
  add column if not exists declined_contractor_ids uuid[] not null default '{}'::uuid[],
  add column if not exists claimed_by uuid references auth.users(id) on delete set null,
  add column if not exists claimed_by_name text,
  add column if not exists claimed_by_email text,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_to_name text,
  add column if not exists assigned_to_email text,
  add column if not exists accepted_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completion_notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists assignment_blocks_status_idx
  on public.assignment_blocks (status);

create index if not exists assignment_blocks_start_window_idx
  on public.assignment_blocks (start_window);

create index if not exists assignment_blocks_property_idx
  on public.assignment_blocks (property_id);

create index if not exists assignment_blocks_claimed_by_idx
  on public.assignment_blocks (claimed_by);

create index if not exists assignment_blocks_assigned_to_idx
  on public.assignment_blocks (assigned_to);

create index if not exists assignment_blocks_recurring_group_idx
  on public.assignment_blocks (recurring_group_id);

create index if not exists assignment_blocks_preferred_contractors_idx
  on public.assignment_blocks using gin (preferred_contractor_ids);

create index if not exists assignment_blocks_auto_renewal_idx
  on public.assignment_blocks (auto_renewal, recurrence_frequency);

create or replace function public.set_assignment_blocks_updated_at()
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
    where tgname = 'set_assignment_blocks_updated_at'
      and tgrelid = 'public.assignment_blocks'::regclass
  ) then
    create trigger set_assignment_blocks_updated_at
      before update on public.assignment_blocks
      for each row
      execute function public.set_assignment_blocks_updated_at();
  end if;
end $$;

create or replace function public.claim_assignment_block(target_assignment_id uuid)
returns public.assignment_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row public.assignment_blocks;
  contractor_profile record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select full_name, email
  into contractor_profile
  from public.profiles
  where id = auth.uid();

  update public.assignment_blocks
  set
    status = 'claimed',
    visibility = 'claimed',
    claimed_by = auth.uid(),
    claimed_by_name = coalesce(contractor_profile.full_name, contractor_profile.email),
    claimed_by_email = contractor_profile.email,
    assigned_to = auth.uid(),
    assigned_to_name = coalesce(contractor_profile.full_name, contractor_profile.email),
    assigned_to_email = contractor_profile.email,
    accepted_at = coalesce(accepted_at, now()),
    claimed_at = now()
  where id = target_assignment_id
    and status in ('open', 'preferred_pending')
    and (
      coalesce(visibility, 'open') = 'open'
      or auth.uid() = any(coalesce(preferred_contractor_ids, '{}'::uuid[]))
    )
    and auth.uid() <> all(coalesce(declined_contractor_ids, '{}'::uuid[]))
  returning * into claimed_row;

  if not found then
    raise exception 'Assignment is not available to claim';
  end if;

  return claimed_row;
end;
$$;

create or replace function public.decline_assignment_block(target_assignment_id uuid)
returns public.assignment_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  declined_row public.assignment_blocks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.assignment_blocks
  set
    status = case
      when coalesce(visibility, 'open') = 'preferred' then status
      else 'declined'
    end,
    declined_contractor_ids = array(
      select distinct contractor_id
      from unnest(coalesce(declined_contractor_ids, '{}'::uuid[]) || auth.uid()) contractor_id
    )
  where id = target_assignment_id
    and status in ('open', 'preferred_pending')
  returning * into declined_row;

  if not found then
    raise exception 'Assignment is not available to decline';
  end if;

  return declined_row;
end;
$$;

create or replace function public.complete_assignment_block(target_assignment_id uuid, notes text default null)
returns public.assignment_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_row public.assignment_blocks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.assignment_blocks
  set
    status = 'completed',
    completed_at = now(),
    completion_notes = coalesce(notes, completion_notes)
  where id = target_assignment_id
    and auth.uid() in (claimed_by, assigned_to)
    and status in ('claimed', 'in_progress', 'qa_pending')
  returning * into completed_row;

  if not found then
    raise exception 'Assignment is not assigned to this account or is already closed';
  end if;

  return completed_row;
end;
$$;

alter table public.assignment_blocks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignment_blocks'
      and policyname = 'Authenticated users can read assignment blocks'
  ) then
    create policy "Authenticated users can read assignment blocks"
      on public.assignment_blocks
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignment_blocks'
      and policyname = 'Authenticated users can create assignment blocks'
  ) then
    create policy "Authenticated users can create assignment blocks"
      on public.assignment_blocks
      for insert
      to authenticated
      with check (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignment_blocks'
      and policyname = 'Authenticated users can update assignment blocks'
  ) then
    create policy "Authenticated users can update assignment blocks"
      on public.assignment_blocks
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update on public.assignment_blocks to authenticated;
grant execute on function public.claim_assignment_block(uuid) to authenticated;
grant execute on function public.decline_assignment_block(uuid) to authenticated;
grant execute on function public.complete_assignment_block(uuid, text) to authenticated;
