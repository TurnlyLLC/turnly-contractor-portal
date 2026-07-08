-- Store reusable checklist modules that admins can import into any checklist.

create extension if not exists pgcrypto;

create table if not exists public.checklist_modules (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  name text not null,
  department text,
  subdepartment text,
  description text,
  section jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists checklist_modules_set_updated_at on public.checklist_modules;

create trigger checklist_modules_set_updated_at
before update on public.checklist_modules
for each row
execute function public.set_updated_at();

alter table public.checklist_modules enable row level security;

drop policy if exists "Admins can view checklist modules" on public.checklist_modules;
drop policy if exists "Admins can insert checklist modules" on public.checklist_modules;
drop policy if exists "Admins can update checklist modules" on public.checklist_modules;
drop policy if exists "Admins can delete checklist modules" on public.checklist_modules;

create policy "Admins can view checklist modules"
  on public.checklist_modules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can insert checklist modules"
  on public.checklist_modules
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update checklist modules"
  on public.checklist_modules
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can delete checklist modules"
  on public.checklist_modules
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create index if not exists checklist_modules_name_idx
  on public.checklist_modules (name);

create index if not exists checklist_modules_updated_at_idx
  on public.checklist_modules (updated_at desc);

grant select, insert, update, delete on public.checklist_modules to authenticated;

notify pgrst, 'reload schema';
