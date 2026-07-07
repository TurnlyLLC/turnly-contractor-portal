-- Allow admin checklist templates to be assigned directly to properties and units.

alter table public.property_units
  add column if not exists checklist_template_id uuid,
  add column if not exists checklist_items jsonb not null default '[]'::jsonb;

alter table public.portal_properties
  add column if not exists checklist_template_id uuid,
  add column if not exists checklist_items jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_units_checklist_template_id_fkey'
      and conrelid = 'public.property_units'::regclass
  ) then
    alter table public.property_units
      add constraint property_units_checklist_template_id_fkey
      foreign key (checklist_template_id)
      references public.checklist_templates(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_properties_checklist_template_id_fkey'
      and conrelid = 'public.portal_properties'::regclass
  ) then
    alter table public.portal_properties
      add constraint portal_properties_checklist_template_id_fkey
      foreign key (checklist_template_id)
      references public.checklist_templates(id)
      on delete set null
      not valid;
  end if;
end $$;

create index if not exists property_units_checklist_template_idx
  on public.property_units (checklist_template_id);

create index if not exists portal_properties_checklist_template_idx
  on public.portal_properties (checklist_template_id);

grant select, update on public.property_units to authenticated;
grant select, update on public.portal_properties to authenticated;

notify pgrst, 'reload schema';
