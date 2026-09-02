-- Dedicated sales-platform tables.
-- Intentionally does not backfill from portal_properties so operational
-- property/contract records do not appear as sales leads.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.current_user_can_use_sales_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_has_role(array['admin', 'sales', 'sales_team']), false);
$$;

grant execute on function public.current_user_can_use_sales_portal() to authenticated;

create or replace function public.sales_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sales_leads (
  id uuid primary key default extensions.gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  client_id uuid,
  property_name text not null,
  name text not null default '',
  company_name text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  address text not null default '',
  sales_city text not null default '',
  sales_state text not null default '',
  sales_county text not null default '',
  sales_website text not null default '',
  property_class text not null default '',
  prospect_unit_count integer,
  average_turns_per_month text not null default '',
  budget_range text not null default '',
  desired_start_date date,
  decision_maker_status text not null default '',
  current_vendor text not null default '',
  service_needs jsonb not null default '[]'::jsonb,
  sales_pain_points jsonb not null default '[]'::jsonb,
  opportunity_score integer,
  qualification_notes text not null default '',
  default_service_type text not null default '',
  default_scope text not null default '',
  lead_source text not null default '',
  lead_notes text not null default '',
  lead_value numeric(12,2),
  pipeline_stage text not null default 'new_leads'
    check (pipeline_stage in ('new_leads', 'contacted', 'walkthrough', 'quote_sent', 'contract_out', 'active', 'lost')),
  sales_owner_id uuid references public.profiles(id) on delete set null,
  sales_owner_name text not null default '',
  next_step text not null default '',
  next_step_due_at timestamptz,
  task_priority text not null default 'medium'
    check (task_priority in ('low', 'medium', 'high')),
  task_status text not null default 'open'
    check (task_status in ('open', 'in_progress', 'pending', 'completed')),
  task_due_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_walkthroughs (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  walkthrough_at timestamptz,
  walkthrough_end_at timestamptz,
  walkthrough_type text not null default 'Property Walkthrough',
  walkthrough_location text not null default '',
  walkthrough_assigned_to_id uuid references public.profiles(id) on delete set null,
  walkthrough_assigned_to text not null default '',
  walkthrough_status text not null default 'scheduled'
    check (walkthrough_status in ('scheduled', 'confirmed', 'rescheduled', 'completed', 'cancelled')),
  walkthrough_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_quotes (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  quote_amount numeric(12,2) not null default 0,
  quote_status text not null default 'draft'
    check (quote_status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  quote_sent_at timestamptz,
  quote_expires_at date,
  quote_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_contracts (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  contract_status text not null default 'pending',
  contract_due_at timestamptz,
  contract_value numeric(12,2),
  contract_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  task_type text not null default 'Follow-up',
  task_priority text not null default 'medium'
    check (task_priority in ('low', 'medium', 'high')),
  task_status text not null default 'open'
    check (task_status in ('open', 'in_progress', 'pending', 'completed')),
  task_due_at timestamptz,
  next_step text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_activities (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  user_name text not null default '',
  activity_type text not null default 'note',
  activity_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_leads_created_at_idx on public.sales_leads (created_at desc);
create index if not exists sales_leads_last_activity_idx on public.sales_leads (last_activity_at desc);
create index if not exists sales_leads_pipeline_stage_idx on public.sales_leads (pipeline_stage);
create index if not exists sales_leads_owner_idx on public.sales_leads (sales_owner_id);
create index if not exists sales_walkthroughs_lead_idx on public.sales_walkthroughs (lead_id, walkthrough_at desc nulls last);
create index if not exists sales_walkthroughs_status_idx on public.sales_walkthroughs (walkthrough_status);
create index if not exists sales_quotes_lead_idx on public.sales_quotes (lead_id, quote_sent_at desc nulls last);
create index if not exists sales_quotes_status_idx on public.sales_quotes (quote_status);
create index if not exists sales_contracts_lead_idx on public.sales_contracts (lead_id, contract_due_at desc nulls last);
create index if not exists sales_tasks_lead_idx on public.sales_tasks (lead_id, task_due_at asc nulls last);
create index if not exists sales_tasks_status_idx on public.sales_tasks (task_status);
create index if not exists sales_activities_lead_idx on public.sales_activities (lead_id, created_at desc);

drop trigger if exists sales_leads_touch_updated_at on public.sales_leads;
create trigger sales_leads_touch_updated_at
  before update on public.sales_leads
  for each row execute function public.sales_touch_updated_at();

drop trigger if exists sales_walkthroughs_touch_updated_at on public.sales_walkthroughs;
create trigger sales_walkthroughs_touch_updated_at
  before update on public.sales_walkthroughs
  for each row execute function public.sales_touch_updated_at();

drop trigger if exists sales_quotes_touch_updated_at on public.sales_quotes;
create trigger sales_quotes_touch_updated_at
  before update on public.sales_quotes
  for each row execute function public.sales_touch_updated_at();

drop trigger if exists sales_contracts_touch_updated_at on public.sales_contracts;
create trigger sales_contracts_touch_updated_at
  before update on public.sales_contracts
  for each row execute function public.sales_touch_updated_at();

drop trigger if exists sales_tasks_touch_updated_at on public.sales_tasks;
create trigger sales_tasks_touch_updated_at
  before update on public.sales_tasks
  for each row execute function public.sales_touch_updated_at();

alter table public.sales_leads enable row level security;
alter table public.sales_walkthroughs enable row level security;
alter table public.sales_quotes enable row level security;
alter table public.sales_contracts enable row level security;
alter table public.sales_tasks enable row level security;
alter table public.sales_activities enable row level security;

drop policy if exists "Sales portal users can view leads" on public.sales_leads;
create policy "Sales portal users can view leads"
  on public.sales_leads for select to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can create leads" on public.sales_leads;
create policy "Sales portal users can create leads"
  on public.sales_leads for insert to authenticated
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can update leads" on public.sales_leads;
create policy "Sales portal users can update leads"
  on public.sales_leads for update to authenticated
  using (public.current_user_can_use_sales_portal())
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can delete leads" on public.sales_leads;
create policy "Sales portal users can delete leads"
  on public.sales_leads for delete to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can view walkthroughs" on public.sales_walkthroughs;
create policy "Sales portal users can view walkthroughs"
  on public.sales_walkthroughs for select to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can create walkthroughs" on public.sales_walkthroughs;
create policy "Sales portal users can create walkthroughs"
  on public.sales_walkthroughs for insert to authenticated
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can update walkthroughs" on public.sales_walkthroughs;
create policy "Sales portal users can update walkthroughs"
  on public.sales_walkthroughs for update to authenticated
  using (public.current_user_can_use_sales_portal())
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can delete walkthroughs" on public.sales_walkthroughs;
create policy "Sales portal users can delete walkthroughs"
  on public.sales_walkthroughs for delete to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can view quotes" on public.sales_quotes;
create policy "Sales portal users can view quotes"
  on public.sales_quotes for select to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can create quotes" on public.sales_quotes;
create policy "Sales portal users can create quotes"
  on public.sales_quotes for insert to authenticated
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can update quotes" on public.sales_quotes;
create policy "Sales portal users can update quotes"
  on public.sales_quotes for update to authenticated
  using (public.current_user_can_use_sales_portal())
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can delete quotes" on public.sales_quotes;
create policy "Sales portal users can delete quotes"
  on public.sales_quotes for delete to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can view contracts" on public.sales_contracts;
create policy "Sales portal users can view contracts"
  on public.sales_contracts for select to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can create contracts" on public.sales_contracts;
create policy "Sales portal users can create contracts"
  on public.sales_contracts for insert to authenticated
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can update contracts" on public.sales_contracts;
create policy "Sales portal users can update contracts"
  on public.sales_contracts for update to authenticated
  using (public.current_user_can_use_sales_portal())
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can delete contracts" on public.sales_contracts;
create policy "Sales portal users can delete contracts"
  on public.sales_contracts for delete to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can view tasks" on public.sales_tasks;
create policy "Sales portal users can view tasks"
  on public.sales_tasks for select to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can create tasks" on public.sales_tasks;
create policy "Sales portal users can create tasks"
  on public.sales_tasks for insert to authenticated
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can update tasks" on public.sales_tasks;
create policy "Sales portal users can update tasks"
  on public.sales_tasks for update to authenticated
  using (public.current_user_can_use_sales_portal())
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can delete tasks" on public.sales_tasks;
create policy "Sales portal users can delete tasks"
  on public.sales_tasks for delete to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can view activities" on public.sales_activities;
create policy "Sales portal users can view activities"
  on public.sales_activities for select to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can create activities" on public.sales_activities;
create policy "Sales portal users can create activities"
  on public.sales_activities for insert to authenticated
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can update activities" on public.sales_activities;
create policy "Sales portal users can update activities"
  on public.sales_activities for update to authenticated
  using (public.current_user_can_use_sales_portal())
  with check (public.current_user_can_use_sales_portal());

drop policy if exists "Sales portal users can delete activities" on public.sales_activities;
create policy "Sales portal users can delete activities"
  on public.sales_activities for delete to authenticated
  using (public.current_user_can_use_sales_portal());

grant select, insert, update, delete on
  public.sales_leads,
  public.sales_walkthroughs,
  public.sales_quotes,
  public.sales_contracts,
  public.sales_tasks,
  public.sales_activities
to authenticated;

comment on table public.sales_leads is 'Dedicated Turnly sales leads. This table is intentionally separate from portal_properties.';
comment on table public.sales_walkthroughs is 'Walkthrough records linked to sales_leads.';
comment on table public.sales_quotes is 'Quote records linked to sales_leads.';
comment on table public.sales_contracts is 'Contract records linked to sales_leads.';
comment on table public.sales_tasks is 'Follow-up tasks linked to sales_leads.';
comment on table public.sales_activities is 'Activity timeline entries linked to sales_leads.';
