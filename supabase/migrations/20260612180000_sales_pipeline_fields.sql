-- Add sales workflow details to portal_properties for Leads, Walkthroughs, and Quotes.
-- Core property fields still save without this migration, but these columns retain
-- the sales-specific details captured by sales-workflows.js.

alter table public.portal_properties
  add column if not exists lead_source text not null default '',
  add column if not exists lead_notes text not null default '',
  add column if not exists walkthrough_at timestamptz,
  add column if not exists walkthrough_notes text not null default '',
  add column if not exists quote_amount numeric(12, 2),
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_notes text not null default '';

create index if not exists portal_properties_walkthrough_at_idx
  on public.portal_properties (walkthrough_at);

create index if not exists portal_properties_quote_sent_at_idx
  on public.portal_properties (quote_sent_at);
