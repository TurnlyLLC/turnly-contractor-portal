-- Rich sales-team workflow fields for the dedicated Turnly Sales Portal.
-- These extend the existing portal_properties sales pipeline without moving or
-- deleting any current prospect/property records.

alter table public.portal_properties
  add column if not exists sales_city text not null default '',
  add column if not exists sales_state text not null default '',
  add column if not exists sales_county text not null default '',
  add column if not exists sales_website text not null default '',
  add column if not exists property_class text not null default '',
  add column if not exists prospect_unit_count integer,
  add column if not exists average_turns_per_month text not null default '',
  add column if not exists budget_range text not null default '',
  add column if not exists desired_start_date date,
  add column if not exists decision_maker_status text not null default '',
  add column if not exists current_vendor text not null default '',
  add column if not exists service_needs jsonb not null default '[]'::jsonb,
  add column if not exists sales_pain_points jsonb not null default '[]'::jsonb,
  add column if not exists opportunity_score integer,
  add column if not exists qualification_notes text not null default '',
  add column if not exists quote_status text not null default 'draft',
  add column if not exists quote_expires_at date,
  add column if not exists contract_status text not null default '',
  add column if not exists contract_due_at timestamptz,
  add column if not exists task_type text not null default '',
  add column if not exists task_priority text not null default 'medium',
  add column if not exists task_status text not null default 'open',
  add column if not exists task_due_at timestamptz,
  add column if not exists sales_activity_log jsonb not null default '[]'::jsonb;

create index if not exists portal_properties_sales_city_idx
  on public.portal_properties (sales_city);

create index if not exists portal_properties_sales_state_idx
  on public.portal_properties (sales_state);

create index if not exists portal_properties_prospect_unit_count_idx
  on public.portal_properties (prospect_unit_count);

create index if not exists portal_properties_quote_status_idx
  on public.portal_properties (quote_status);

create index if not exists portal_properties_task_due_idx
  on public.portal_properties (task_due_at)
  where task_due_at is not null;

create index if not exists portal_properties_contract_due_idx
  on public.portal_properties (contract_due_at)
  where contract_due_at is not null;
