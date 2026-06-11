-- Phase 3: Claim Assignment
-- Run this in Supabase SQL editor before deploying the Phase 3 frontend.

alter table public.assignment_blocks
  add column if not exists claimed_by uuid references auth.users(id),
  add column if not exists claimed_at timestamptz;

create index if not exists assignment_blocks_claimed_by_idx
  on public.assignment_blocks(claimed_by);

create index if not exists assignment_blocks_status_claimed_by_idx
  on public.assignment_blocks(status, claimed_by);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_blocks_claimed_status_check'
  ) then
    alter table public.assignment_blocks
      add constraint assignment_blocks_claimed_status_check
      check (
        status <> 'claimed'
        or (claimed_by is not null and claimed_at is not null)
      );
  end if;
end $$;

-- Optional RLS policy if assignment_blocks has row level security enabled.
-- This lets authenticated contractors atomically claim open, unclaimed work
-- while preventing them from assigning the job to another user.
drop policy if exists "Contractors can claim open assignments"
  on public.assignment_blocks;

create policy "Contractors can claim open assignments"
  on public.assignment_blocks
  for update
  to authenticated
  using (
    status = 'open'
    and claimed_by is null
  )
  with check (
    status = 'claimed'
    and claimed_by = auth.uid()
    and claimed_at is not null
  );
