drop policy if exists "Admins can manage assignment blocks" on public.assignment_blocks;

create policy "Admins can manage assignment blocks"
  on public.assignment_blocks
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'admin'
    )
  );
