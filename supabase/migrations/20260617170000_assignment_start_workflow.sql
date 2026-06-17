-- Track when a contractor starts a claimed job.

alter table public.assignment_blocks
  add column if not exists started_at timestamptz,
  add column if not exists started_by uuid references auth.users(id),
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists start_location_accuracy double precision,
  add column if not exists start_notes text;

create index if not exists assignment_blocks_started_at_idx
  on public.assignment_blocks(started_at);

create index if not exists assignment_blocks_started_by_idx
  on public.assignment_blocks(started_by);

update public.assignment_blocks
set
  started_at = coalesce(started_at, claimed_at, now()),
  started_by = coalesce(started_by, claimed_by)
where status = 'in_progress'
  and claimed_by is not null
  and (started_at is null or started_by is null);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_blocks_started_status_check'
  ) then
    alter table public.assignment_blocks
      add constraint assignment_blocks_started_status_check
      check (
        status <> 'in_progress'
        or (
          claimed_by is not null
          and started_by = claimed_by
          and started_at is not null
        )
      ) not valid;
  end if;
end $$;

drop policy if exists "Contractors can start claimed assignments"
  on public.assignment_blocks;

create policy "Contractors can start claimed assignments"
  on public.assignment_blocks
  for update
  to authenticated
  using (
    claimed_by = auth.uid()
    and status in ('claimed', 'scheduled')
  )
  with check (
    claimed_by = auth.uid()
    and started_by = auth.uid()
    and status = 'in_progress'
    and started_at is not null
  );
