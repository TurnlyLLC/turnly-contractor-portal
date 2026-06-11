-- Link assignments to saved properties and store recurring schedule settings.

alter table public.properties
  add column if not exists recurring_enabled boolean not null default false,
  add column if not exists recurring_frequency text not null default 'weekly',
  add column if not exists recurring_start_date date,
  add column if not exists recurring_start_time time,
  add column if not exists recurring_end_time time,
  add column if not exists recurring_pay_amount numeric,
  add column if not exists recurring_assignment_title text,
  add column if not exists recurring_next_due_at timestamptz,
  add column if not exists recurring_last_generated_at timestamptz;

alter table public.assignment_blocks
  add column if not exists property_id uuid references public.properties(id),
  add column if not exists property_checklist_items jsonb not null default '[]'::jsonb,
  add column if not exists recurring_property_id uuid references public.properties(id),
  add column if not exists recurring_due_at timestamptz,
  add column if not exists assignment_source text not null default 'manual';

create index if not exists properties_recurring_next_due_idx
  on public.properties (recurring_next_due_at)
  where recurring_enabled = true;

create index if not exists assignment_blocks_property_id_idx
  on public.assignment_blocks (property_id);

create index if not exists assignment_blocks_recurring_property_due_idx
  on public.assignment_blocks (recurring_property_id, recurring_due_at);
