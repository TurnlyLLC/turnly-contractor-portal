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

create or replace function public.assignment_distance_miles(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 3958.7613 * 2 * asin(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
      )
    )
  end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_blocks_start_within_radius_check'
      and conrelid = 'public.assignment_blocks'::regclass
  ) then
    alter table public.assignment_blocks
      add constraint assignment_blocks_start_within_radius_check
      check (
        status <> 'in_progress'
        or (
          start_latitude is not null
          and start_longitude is not null
          and site_latitude is not null
          and site_longitude is not null
          and public.assignment_distance_miles(
            site_latitude,
            site_longitude,
            start_latitude,
            start_longitude
          ) <= 5.0
        )
      )
      not valid;
  end if;
end $$;

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
    and start_latitude is not null
    and start_longitude is not null
    and site_latitude is not null
    and site_longitude is not null
    and public.assignment_distance_miles(
      site_latitude,
      site_longitude,
      start_latitude,
      start_longitude
    ) <= 5.0
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
