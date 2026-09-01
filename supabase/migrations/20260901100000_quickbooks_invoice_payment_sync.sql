create table if not exists public.quickbooks_oauth_states (
  state text primary key,
  admin_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.quickbooks_connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  realm_id text not null unique,
  company_name text,
  environment text not null default 'production',
  status text not null default 'connected',
  token_type text,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_by uuid references auth.users(id) on delete set null,
  last_sync_at timestamptz,
  last_error text
);

create table if not exists public.quickbooks_property_customer_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  portal_property_id uuid,
  property_key text not null unique,
  property_name text not null,
  quickbooks_customer_id text not null,
  quickbooks_customer_display_name text,
  last_synced_at timestamptz,
  last_error text
);

create table if not exists public.quickbooks_invoice_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  week_start date not null,
  week_end date not null,
  portal_property_id uuid,
  property_key text not null,
  property_name text not null,
  quickbooks_customer_id text,
  quickbooks_invoice_id text,
  quickbooks_doc_number text,
  quickbooks_sync_token text,
  quickbooks_status text not null default 'drafted',
  quickbooks_balance numeric(12, 2),
  quickbooks_total_amt numeric(12, 2),
  quickbooks_invoice_url text,
  source_assignment_ids uuid[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  sent_to_quickbooks_at timestamptz,
  paid_at timestamptz,
  synced_at timestamptz,
  last_error text,
  unique (week_start, property_key)
);

create table if not exists public.quickbooks_contractor_payment_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assignment_id uuid references public.assignment_blocks(id) on delete cascade,
  contractor_id uuid references public.profiles(id) on delete set null,
  contractor_name text,
  contractor_email text,
  quickbooks_entity_type text not null,
  quickbooks_entity_id text not null,
  quickbooks_doc_number text,
  quickbooks_txn_date date,
  quickbooks_total_amt numeric(12, 2),
  quickbooks_status text not null default 'paid',
  match_confidence numeric(5, 2),
  payload jsonb not null default '{}'::jsonb,
  matched_at timestamptz not null default now(),
  synced_at timestamptz,
  last_error text,
  unique (assignment_id, quickbooks_entity_type, quickbooks_entity_id)
);

alter table public.assignment_blocks
  add column if not exists quickbooks_invoice_link_id uuid references public.quickbooks_invoice_links(id) on delete set null,
  add column if not exists quickbooks_invoice_id text,
  add column if not exists quickbooks_invoice_status text,
  add column if not exists quickbooks_invoice_synced_at timestamptz,
  add column if not exists quickbooks_payment_status text,
  add column if not exists quickbooks_payment_txn_id text,
  add column if not exists quickbooks_payment_txn_type text,
  add column if not exists quickbooks_payment_synced_at timestamptz,
  add column if not exists payment_status_source text not null default 'turnly',
  add column if not exists payment_status_override boolean not null default false,
  add column if not exists payment_status_override_at timestamptz,
  add column if not exists payment_status_override_by uuid references auth.users(id) on delete set null;

create index if not exists quickbooks_oauth_states_expires_at_idx
  on public.quickbooks_oauth_states (expires_at);

create index if not exists quickbooks_connections_status_idx
  on public.quickbooks_connections (status);

create index if not exists quickbooks_invoice_links_week_idx
  on public.quickbooks_invoice_links (week_start, week_end);

create index if not exists quickbooks_invoice_links_property_idx
  on public.quickbooks_invoice_links (property_key);

create index if not exists quickbooks_invoice_links_invoice_idx
  on public.quickbooks_invoice_links (quickbooks_invoice_id);

create index if not exists quickbooks_contractor_payment_links_assignment_idx
  on public.quickbooks_contractor_payment_links (assignment_id);

create index if not exists quickbooks_contractor_payment_links_qbo_idx
  on public.quickbooks_contractor_payment_links (quickbooks_entity_type, quickbooks_entity_id);

create index if not exists assignment_blocks_quickbooks_invoice_idx
  on public.assignment_blocks (quickbooks_invoice_id);

create index if not exists assignment_blocks_quickbooks_payment_idx
  on public.assignment_blocks (quickbooks_payment_status);

alter table public.quickbooks_oauth_states enable row level security;
alter table public.quickbooks_connections enable row level security;
alter table public.quickbooks_property_customer_links enable row level security;
alter table public.quickbooks_invoice_links enable row level security;
alter table public.quickbooks_contractor_payment_links enable row level security;

revoke all on public.quickbooks_oauth_states from anon, authenticated;
revoke all on public.quickbooks_connections from anon, authenticated;
revoke all on public.quickbooks_property_customer_links from anon, authenticated;
revoke all on public.quickbooks_invoice_links from anon, authenticated;
revoke all on public.quickbooks_contractor_payment_links from anon, authenticated;
