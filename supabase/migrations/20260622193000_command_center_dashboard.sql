-- Command Center backing tables.
-- These tables power admin dashboard action items, coverage requests, QA alerts,
-- and per-admin widget preferences.

create table if not exists public.coverage_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assignment_blocks(id) on delete set null,
  property_id uuid references public.portal_properties(id) on delete set null,
  title text not null default 'Coverage Request',
  service_type text,
  property_name text,
  address text,
  requested_start_at timestamptz,
  requested_end_at timestamptz,
  duration_minutes integer,
  status text not null default 'open',
  priority text not null default 'normal',
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  assigned_contractor_id uuid references auth.users(id) on delete set null,
  assigned_contractor_name text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_center_action_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  item_type text not null default 'manual',
  status text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  source_table text,
  source_id uuid,
  href text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_alerts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assignment_blocks(id) on delete set null,
  title text,
  message text,
  alert_type text not null default 'qa_pending',
  status text not null default 'open',
  priority text not null default 'normal',
  property_name text,
  contractor_name text,
  service_type text,
  due_at timestamptz,
  source text not null default 'manual',
  source_table text,
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_center_widget_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  widget_key text not null,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, widget_key)
);

create index if not exists coverage_requests_status_idx
  on public.coverage_requests(status);

create index if not exists coverage_requests_requested_start_idx
  on public.coverage_requests(requested_start_at);

create index if not exists coverage_requests_assignment_idx
  on public.coverage_requests(assignment_id);

create index if not exists command_center_action_items_status_due_idx
  on public.command_center_action_items(status, due_at);

create index if not exists command_center_action_items_priority_idx
  on public.command_center_action_items(priority);

create index if not exists qa_alerts_status_due_idx
  on public.qa_alerts(status, due_at);

create index if not exists qa_alerts_assignment_idx
  on public.qa_alerts(assignment_id);

create index if not exists command_center_widget_preferences_user_visible_idx
  on public.command_center_widget_preferences(user_id, is_visible, sort_order);

create or replace function public.set_command_center_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_coverage_requests_updated_at on public.coverage_requests;
create trigger set_coverage_requests_updated_at
  before update on public.coverage_requests
  for each row
  execute function public.set_command_center_updated_at();

drop trigger if exists set_command_center_action_items_updated_at on public.command_center_action_items;
create trigger set_command_center_action_items_updated_at
  before update on public.command_center_action_items
  for each row
  execute function public.set_command_center_updated_at();

drop trigger if exists set_qa_alerts_updated_at on public.qa_alerts;
create trigger set_qa_alerts_updated_at
  before update on public.qa_alerts
  for each row
  execute function public.set_command_center_updated_at();

drop trigger if exists set_command_center_widget_preferences_updated_at on public.command_center_widget_preferences;
create trigger set_command_center_widget_preferences_updated_at
  before update on public.command_center_widget_preferences
  for each row
  execute function public.set_command_center_updated_at();

alter table public.coverage_requests enable row level security;
alter table public.command_center_action_items enable row level security;
alter table public.qa_alerts enable row level security;
alter table public.command_center_widget_preferences enable row level security;

drop policy if exists "Admins can manage coverage requests" on public.coverage_requests;
create policy "Admins can manage coverage requests"
  on public.coverage_requests
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Admins can manage command center action items" on public.command_center_action_items;
create policy "Admins can manage command center action items"
  on public.command_center_action_items
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Admins can manage QA alerts" on public.qa_alerts;
create policy "Admins can manage QA alerts"
  on public.qa_alerts
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Admins can manage their command center widgets" on public.command_center_widget_preferences;
create policy "Admins can manage their command center widgets"
  on public.command_center_widget_preferences
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and public.current_user_has_role(array['admin'])
  )
  with check (
    user_id = auth.uid()
    and public.current_user_has_role(array['admin'])
  );

grant select, insert, update, delete on public.coverage_requests to authenticated;
grant select, insert, update, delete on public.command_center_action_items to authenticated;
grant select, insert, update, delete on public.qa_alerts to authenticated;
grant select, insert, update, delete on public.command_center_widget_preferences to authenticated;