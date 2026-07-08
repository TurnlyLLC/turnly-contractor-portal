-- Prevent unauthenticated visitors from receiving a partial open-only
-- assignment list that can be mistaken for the admin assignment history.

drop policy if exists "Contractors can view open assignments"
  on public.assignment_blocks;

drop policy if exists "Authenticated users can view assignment blocks"
  on public.assignment_blocks;

create policy "Authenticated users can view assignment blocks"
  on public.assignment_blocks
  for select
  to authenticated
  using (true);
