-- Add sales and property manager portal roles, high-volume sales lead fields,
-- and efficient summary views for the Sales Portal.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

alter table public.profiles
  add column if not exists role text,
  add column if not exists full_name text;

update public.profiles
set role = 'contractor'
where role is null;

alter table public.profiles
  alter column role set default 'contractor';

alter table public.profiles
  drop constraint if exists profiles_role_supported;

alter table public.profiles
  add constraint profiles_role_supported
  check (role in ('admin', 'contractor', 'sales', 'sales_team', 'property_manager'))
  not valid;

create index if not exists profiles_role_idx
  on public.profiles (role);

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "Users can update own profile basics" on public.profiles;
-- Do not add a self-update policy here. Profile role changes should be handled
-- from Supabase/admin tooling so users cannot self-promote into portal roles.

alter table public.portal_properties
  add column if not exists company_name text not null default '',
  add column if not exists contact_name text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists contact_phone text not null default '',
  add column if not exists lead_value numeric(12, 2),
  add column if not exists square_feet integer,
  add column if not exists sales_owner_id uuid,
  add column if not exists sales_owner_name text not null default '',
  add column if not exists next_step text not null default '',
  add column if not exists next_step_due_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now();

update public.portal_properties
set last_activity_at = coalesce(updated_at, created_at, now())
where last_activity_at is null;

create index if not exists portal_properties_sales_owner_idx
  on public.portal_properties (sales_owner_id);

create index if not exists portal_properties_last_activity_idx
  on public.portal_properties (last_activity_at desc);

create index if not exists portal_properties_next_step_due_idx
  on public.portal_properties (next_step_due_at)
  where next_step_due_at is not null;

create index if not exists portal_properties_lead_source_idx
  on public.portal_properties (lead_source);

create index if not exists portal_properties_name_trgm_idx
  on public.portal_properties using gin (name gin_trgm_ops);

create index if not exists portal_properties_company_trgm_idx
  on public.portal_properties using gin (company_name gin_trgm_ops);

create index if not exists portal_properties_contact_name_trgm_idx
  on public.portal_properties using gin (contact_name gin_trgm_ops);

create index if not exists portal_properties_contact_email_trgm_idx
  on public.portal_properties using gin (contact_email gin_trgm_ops);

drop policy if exists "Admins can view portal properties" on public.portal_properties;
drop policy if exists "Admins can insert portal properties" on public.portal_properties;
drop policy if exists "Admins can update portal properties" on public.portal_properties;
drop policy if exists "Admins can delete portal properties" on public.portal_properties;
drop policy if exists "Portal roles can view portal properties" on public.portal_properties;
drop policy if exists "Portal roles can insert portal properties" on public.portal_properties;
drop policy if exists "Portal roles can update portal properties" on public.portal_properties;
drop policy if exists "Admins can delete portal properties" on public.portal_properties;

create policy "Portal roles can view portal properties"
  on public.portal_properties
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
    )
  );

create policy "Portal roles can insert portal properties"
  on public.portal_properties
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
    )
  );

create policy "Portal roles can update portal properties"
  on public.portal_properties
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
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

drop policy if exists "Admins can view clients" on public.clients;
drop policy if exists "Admins can insert clients" on public.clients;
drop policy if exists "Admins can update clients" on public.clients;
drop policy if exists "Admins can delete clients" on public.clients;
drop policy if exists "Portal roles can view clients" on public.clients;
drop policy if exists "Portal roles can insert clients" on public.clients;
drop policy if exists "Portal roles can update clients" on public.clients;
drop policy if exists "Admins can delete clients" on public.clients;

create policy "Portal roles can view clients"
  on public.clients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
    )
  );

create policy "Portal roles can insert clients"
  on public.clients
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
    )
  );

create policy "Portal roles can update clients"
  on public.clients
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'sales', 'sales_team', 'property_manager')
    )
  );

create policy "Admins can delete clients"
  on public.clients
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

drop view if exists public.sales_pipeline_summary;
create or replace view public.sales_pipeline_summary
with (security_invoker = true) as
select
  count(*)::bigint as total_leads,
  count(*) filter (where created_at >= now() - interval '30 days')::bigint as new_leads_30d,
  count(*) filter (where pipeline_stage = 'qualified')::bigint as qualified,
  count(*) filter (where pipeline_stage = 'quote_sent')::bigint as quoted,
  count(*) filter (where pipeline_stage = 'won')::bigint as won,
  coalesce(sum(lead_value), 0)::numeric(14, 2) as total_pipeline_value
from public.portal_properties;

drop view if exists public.sales_pipeline_stage_summary;
create or replace view public.sales_pipeline_stage_summary
with (security_invoker = true) as
select
  pipeline_stage,
  count(*)::bigint as lead_count,
  coalesce(sum(lead_value), 0)::numeric(14, 2) as pipeline_value
from public.portal_properties
group by pipeline_stage;

drop view if exists public.sales_lead_source_summary;
create or replace view public.sales_lead_source_summary
with (security_invoker = true) as
select
  coalesce(nullif(lead_source, ''), 'Unknown') as lead_source,
  count(*)::bigint as lead_count
from public.portal_properties
where created_at >= now() - interval '30 days'
group by coalesce(nullif(lead_source, ''), 'Unknown')
order by lead_count desc;

drop view if exists public.sales_team_performance;
create or replace view public.sales_team_performance
with (security_invoker = true) as
select
  sales_owner_id as owner_id,
  coalesce(nullif(sales_owner_name, ''), 'Unassigned') as owner_name,
  count(*)::bigint as leads,
  count(*) filter (where pipeline_stage = 'won')::bigint as won,
  coalesce(sum(lead_value), 0)::numeric(14, 2) as pipeline_value
from public.portal_properties
group by sales_owner_id, coalesce(nullif(sales_owner_name, ''), 'Unassigned')
order by pipeline_value desc, leads desc;

grant select on public.sales_pipeline_summary to authenticated;
grant select on public.sales_pipeline_stage_summary to authenticated;
grant select on public.sales_lead_source_summary to authenticated;
grant select on public.sales_team_performance to authenticated;
