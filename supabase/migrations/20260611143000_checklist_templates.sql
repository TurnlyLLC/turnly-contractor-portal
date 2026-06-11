-- Store reusable checklist templates separate from property records.

create extension if not exists pgcrypto;

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  name text not null,
  department text,
  subdepartment text,
  priority text not null default 'medium',
  description text,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties
  add column if not exists checklist_template_id uuid references public.checklist_templates(id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists checklist_templates_set_updated_at on public.checklist_templates;

create trigger checklist_templates_set_updated_at
before update on public.checklist_templates
for each row
execute function public.set_updated_at();

alter table public.checklist_templates enable row level security;

drop policy if exists "Admins can view checklist templates" on public.checklist_templates;
drop policy if exists "Admins can insert checklist templates" on public.checklist_templates;
drop policy if exists "Admins can update checklist templates" on public.checklist_templates;
drop policy if exists "Admins can delete checklist templates" on public.checklist_templates;

create policy "Admins can view checklist templates"
  on public.checklist_templates
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

create policy "Admins can insert checklist templates"
  on public.checklist_templates
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

create policy "Admins can update checklist templates"
  on public.checklist_templates
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

create policy "Admins can delete checklist templates"
  on public.checklist_templates
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

create index if not exists checklist_templates_updated_at_idx
  on public.checklist_templates (updated_at desc);
