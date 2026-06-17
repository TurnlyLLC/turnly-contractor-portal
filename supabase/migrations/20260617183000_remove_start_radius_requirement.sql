alter table public.assignment_blocks
  add column if not exists started_at timestamptz,
  add column if not exists started_by uuid references auth.users(id),
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists start_location_accuracy double precision,
  add column if not exists start_notes text,
  add column if not exists site_latitude double precision,
  add column if not exists site_longitude double precision,
  add column if not exists start_distance_miles double precision,
  add column if not exists checklist_responses jsonb not null default '[]'::jsonb,
  add column if not exists checklist_completed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id);

alter table public.assignment_blocks
  drop constraint if exists assignment_blocks_start_within_radius_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_blocks_completed_with_checklist_check'
      and conrelid = 'public.assignment_blocks'::regclass
  ) then
    alter table public.assignment_blocks
      add constraint assignment_blocks_completed_with_checklist_check
      check (
        status <> 'completed'
        or (
          completed_at is not null
          and completed_by is not null
          and checklist_completed_at is not null
          and case
            when jsonb_typeof(checklist_responses) = 'array'
            then jsonb_array_length(checklist_responses) > 0
            else false
          end
        )
      )
      not valid;
  end if;
end $$;

create index if not exists assignment_blocks_claimed_status_idx
  on public.assignment_blocks (claimed_by, status);

drop policy if exists "Contractors can start claimed assignments" on public.assignment_blocks;

create policy "Contractors can start claimed assignments"
  on public.assignment_blocks
  for update
  using (
    claimed_by = auth.uid()
    and status in ('claimed', 'scheduled')
  )
  with check (
    claimed_by = auth.uid()
    and status = 'in_progress'
    and started_by = auth.uid()
    and started_at is not null
  );

drop policy if exists "Contractors can complete started assignments" on public.assignment_blocks;

create policy "Contractors can complete started assignments"
  on public.assignment_blocks
  for update
  using (
    claimed_by = auth.uid()
    and status = 'in_progress'
  )
  with check (
    claimed_by = auth.uid()
    and status = 'completed'
    and completed_by = auth.uid()
    and completed_at is not null
    and checklist_completed_at is not null
    and case
      when jsonb_typeof(checklist_responses) = 'array'
      then jsonb_array_length(checklist_responses) > 0
      else false
    end
  );
