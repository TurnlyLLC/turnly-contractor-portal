-- Contractor start workflow location fields.
-- The contractor portal records both the contractor's start location and
-- the resolved job-site pin when a job is started.

alter table public.assignment_blocks
  add column if not exists started_at timestamptz,
  add column if not exists started_by uuid references auth.users(id) on delete set null,
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists start_location_accuracy double precision,
  add column if not exists start_notes text,
  add column if not exists site_latitude double precision,
  add column if not exists site_longitude double precision,
  add column if not exists start_distance_miles double precision;

create index if not exists assignment_blocks_started_at_idx
  on public.assignment_blocks (started_at);

create index if not exists assignment_blocks_started_by_idx
  on public.assignment_blocks (started_by);

create index if not exists assignment_blocks_site_location_idx
  on public.assignment_blocks (site_latitude, site_longitude);

create index if not exists assignment_blocks_start_location_idx
  on public.assignment_blocks (start_latitude, start_longitude);

notify pgrst, 'reload schema';
