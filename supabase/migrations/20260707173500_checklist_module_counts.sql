-- Store module count settings used to expand checklist modules per property or unit.

alter table public.property_units
  add column if not exists checklist_module_counts jsonb not null default '{}'::jsonb;

alter table public.portal_properties
  add column if not exists checklist_module_counts jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
