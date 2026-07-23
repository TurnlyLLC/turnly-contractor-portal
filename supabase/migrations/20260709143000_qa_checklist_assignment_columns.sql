-- QA checklist builder storage and assignment fields.
-- The admin portal assigns flattened checklist items and per-module counts
-- to properties and property units.

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  department text not null default '',
  subdepartment text not null default '',
  priority text not null default 'medium',
  description text not null default '',
  sections jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checklist_templates
  add column if not exists name text not null default '',
  add column if not exists department text not null default '',
  add column if not exists subdepartment text not null default '',
  add column if not exists priority text not null default 'medium',
  add column if not exists description text not null default '',
  add column if not exists sections jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.checklist_modules (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  department text not null default '',
  subdepartment text not null default '',
  description text not null default '',
  section jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checklist_modules
  add column if not exists name text not null default '',
  add column if not exists department text not null default '',
  add column if not exists subdepartment text not null default '',
  add column if not exists description text not null default '',
  add column if not exists section jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.portal_properties
  add column if not exists checklist_template_id uuid references public.checklist_templates(id) on delete set null,
  add column if not exists checklist_items jsonb not null default '[]'::jsonb,
  add column if not exists checklist_module_counts jsonb not null default '{}'::jsonb;

alter table public.property_units
  add column if not exists checklist_template_id uuid references public.checklist_templates(id) on delete set null,
  add column if not exists checklist_items jsonb not null default '[]'::jsonb,
  add column if not exists checklist_module_counts jsonb not null default '{}'::jsonb;

alter table public.assignment_blocks
  add column if not exists started_by uuid references auth.users(id) on delete set null,
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists checklist_completed_at timestamptz,
  add column if not exists checklist_responses jsonb not null default '[]'::jsonb;

update public.portal_properties
set
  checklist_items = coalesce(checklist_items, '[]'::jsonb),
  checklist_module_counts = coalesce(checklist_module_counts, '{}'::jsonb);

update public.property_units
set
  checklist_items = coalesce(checklist_items, '[]'::jsonb),
  checklist_module_counts = coalesce(checklist_module_counts, '{}'::jsonb);

update public.assignment_blocks
set checklist_responses = '[]'::jsonb
where checklist_responses is null
  and status is distinct from 'completed';

create index if not exists checklist_templates_updated_at_idx
  on public.checklist_templates (updated_at desc);

create index if not exists checklist_templates_department_idx
  on public.checklist_templates (department, subdepartment);

create index if not exists checklist_modules_updated_at_idx
  on public.checklist_modules (updated_at desc);

create index if not exists checklist_modules_department_idx
  on public.checklist_modules (department, subdepartment);

create index if not exists portal_properties_checklist_template_idx
  on public.portal_properties (checklist_template_id);

create index if not exists property_units_checklist_template_idx
  on public.property_units (checklist_template_id);

create index if not exists property_units_checklist_items_idx
  on public.property_units using gin (checklist_items);

create index if not exists assignment_blocks_checklist_completed_idx
  on public.assignment_blocks (checklist_completed_at);

create or replace function public.set_checklist_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_checklist_templates_updated_at on public.checklist_templates;
create trigger set_checklist_templates_updated_at
  before update on public.checklist_templates
  for each row
  execute function public.set_checklist_templates_updated_at();

create or replace function public.set_checklist_modules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_checklist_modules_updated_at on public.checklist_modules;
create trigger set_checklist_modules_updated_at
  before update on public.checklist_modules
  for each row
  execute function public.set_checklist_modules_updated_at();

alter table public.checklist_templates enable row level security;
alter table public.checklist_modules enable row level security;

drop policy if exists "Authenticated users can read checklist templates" on public.checklist_templates;
create policy "Authenticated users can read checklist templates"
  on public.checklist_templates for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create checklist templates" on public.checklist_templates;
create policy "Authenticated users can create checklist templates"
  on public.checklist_templates for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "Authenticated users can update checklist templates" on public.checklist_templates;
create policy "Authenticated users can update checklist templates"
  on public.checklist_templates for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete checklist templates" on public.checklist_templates;
create policy "Authenticated users can delete checklist templates"
  on public.checklist_templates for delete
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read checklist modules" on public.checklist_modules;
create policy "Authenticated users can read checklist modules"
  on public.checklist_modules for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create checklist modules" on public.checklist_modules;
create policy "Authenticated users can create checklist modules"
  on public.checklist_modules for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "Authenticated users can update checklist modules" on public.checklist_modules;
create policy "Authenticated users can update checklist modules"
  on public.checklist_modules for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete checklist modules" on public.checklist_modules;
create policy "Authenticated users can delete checklist modules"
  on public.checklist_modules for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.checklist_templates to authenticated;
grant select, insert, update, delete on public.checklist_modules to authenticated;

notify pgrst, 'reload schema';
