-- Fresh property table for the Turnly portal Manage Properties workflow.
-- This avoids legacy constraints on public.properties while preserving the
-- fields needed by the admin dashboard, assignment creation, and recurring jobs.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.sync_portal_property_name()
returns trigger as $$
begin
  if nullif(new.name, '') is null then
    new.name = coalesce(nullif(new.property_name, ''), 'Untitled Property');
  end if;

  if nullif(new.property_name, '') is null then
    new.property_name = new.name;
  end if;

  return new;
end;
$$ language plpgsql;

create table if not exists public.portal_properties (
  id uuid primary key default gen_random_uuid(),
  created_by uuid,
  client_id uuid,
  property_name text,
  name text not null default 'Untitled Property',
  address text not null default '',
  pipeline_stage text not null default 'new_leads',
  default_service_type text not null default '',
  default_scope text not null default '',
  supplies_notes text not null default '',
  special_instructions text not null default '',
  access_notes text not null default '',
  checklist_template_id uuid,
  checklist_items jsonb not null default '[]'::jsonb,
  recurring_enabled boolean not null default false,
  recurring_frequency text not null default 'weekly',
  recurring_start_date date,
  recurring_start_time time,
  recurring_end_time time,
  recurring_pay_amount numeric(10, 2),
  recurring_assignment_title text,
  recurring_next_due_at timestamptz,
  recurring_last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portal_properties
  add column if not exists created_by uuid,
  add column if not exists client_id uuid,
  add column if not exists property_name text,
  add column if not exists name text not null default 'Untitled Property',
  add column if not exists address text not null default '',
  add column if not exists pipeline_stage text not null default 'new_leads',
  add column if not exists default_service_type text not null default '',
  add column if not exists default_scope text not null default '',
  add column if not exists supplies_notes text not null default '',
  add column if not exists special_instructions text not null default '',
  add column if not exists access_notes text not null default '',
  add column if not exists checklist_template_id uuid,
  add column if not exists checklist_items jsonb not null default '[]'::jsonb,
  add column if not exists recurring_enabled boolean not null default false,
  add column if not exists recurring_frequency text not null default 'weekly',
  add column if not exists recurring_start_date date,
  add column if not exists recurring_start_time time,
  add column if not exists recurring_end_time time,
  add column if not exists recurring_pay_amount numeric(10, 2),
  add column if not exists recurring_assignment_title text,
  add column if not exists recurring_next_due_at timestamptz,
  add column if not exists recurring_last_generated_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.portal_properties
set property_name = name
where property_name is null
  and name is not null;

drop trigger if exists portal_properties_sync_name on public.portal_properties;
create trigger portal_properties_sync_name
before insert or update on public.portal_properties
for each row
execute function public.sync_portal_property_name();

drop trigger if exists portal_properties_set_updated_at on public.portal_properties;
create trigger portal_properties_set_updated_at
before update on public.portal_properties
for each row
execute function public.set_updated_at();

alter table public.portal_properties enable row level security;

drop policy if exists "Admins can view portal properties" on public.portal_properties;
drop policy if exists "Admins can insert portal properties" on public.portal_properties;
drop policy if exists "Admins can update portal properties" on public.portal_properties;
drop policy if exists "Admins can delete portal properties" on public.portal_properties;

create policy "Admins can view portal properties"
  on public.portal_properties
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

create policy "Admins can insert portal properties"
  on public.portal_properties
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

create policy "Admins can update portal properties"
  on public.portal_properties
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

create policy "Admins can delete portal properties"
  on public.portal_properties
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

create index if not exists portal_properties_created_at_idx
  on public.portal_properties (created_at desc);

create index if not exists portal_properties_pipeline_stage_idx
  on public.portal_properties (pipeline_stage);

create index if not exists portal_properties_recurring_next_due_idx
  on public.portal_properties (recurring_next_due_at)
  where recurring_enabled = true;

alter table public.assignment_blocks
  add column if not exists portal_property_id uuid,
  add column if not exists recurring_portal_property_id uuid,
  add column if not exists property_checklist_items jsonb not null default '[]'::jsonb,
  add column if not exists recurring_due_at timestamptz,
  add column if not exists assignment_source text;

create index if not exists assignment_blocks_portal_property_id_idx
  on public.assignment_blocks (portal_property_id);

create index if not exists assignment_blocks_recurring_portal_property_due_idx
  on public.assignment_blocks (recurring_portal_property_id, recurring_due_at);
