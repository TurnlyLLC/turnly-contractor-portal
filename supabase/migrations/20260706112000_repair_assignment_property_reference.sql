-- Repair assignment property references for the admin assignment page.
-- The current UI selects rows from public.portal_properties, so assignment_blocks.property_id
-- must reference public.portal_properties(id), not the legacy public.properties table.

alter table public.assignment_blocks
  add column if not exists property_id uuid,
  add column if not exists portal_property_id uuid;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_info.conname
    from pg_constraint as constraint_info
    join pg_class as table_info
      on table_info.oid = constraint_info.conrelid
    join pg_namespace as namespace_info
      on namespace_info.oid = table_info.relnamespace
    where namespace_info.nspname = 'public'
      and table_info.relname = 'assignment_blocks'
      and constraint_info.contype = 'f'
      and exists (
        select 1
        from unnest(constraint_info.conkey) as constrained_column(attnum)
        join pg_attribute as attribute_info
          on attribute_info.attrelid = constraint_info.conrelid
         and attribute_info.attnum = constrained_column.attnum
        where attribute_info.attname = 'property_id'
      )
  loop
    execute format('alter table public.assignment_blocks drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

update public.assignment_blocks as assignment
set property_id = assignment.portal_property_id
where assignment.property_id is null
  and assignment.portal_property_id is not null
  and (
    assignment.status is distinct from 'completed'
    or (
      assignment.completed_at is not null
      and assignment.completed_by is not null
      and assignment.checklist_completed_at is not null
      and case
        when jsonb_typeof(assignment.checklist_responses) = 'array'
        then jsonb_array_length(assignment.checklist_responses) > 0
        else false
      end
    )
  )
  and exists (
    select 1
    from public.portal_properties as property
    where property.id = assignment.portal_property_id
  );

update public.assignment_blocks as assignment
set portal_property_id = assignment.property_id
where assignment.portal_property_id is null
  and assignment.property_id is not null
  and (
    assignment.status is distinct from 'completed'
    or (
      assignment.completed_at is not null
      and assignment.completed_by is not null
      and assignment.checklist_completed_at is not null
      and case
        when jsonb_typeof(assignment.checklist_responses) = 'array'
        then jsonb_array_length(assignment.checklist_responses) > 0
        else false
      end
    )
  )
  and exists (
    select 1
    from public.portal_properties as property
    where property.id = assignment.property_id
  );

update public.assignment_blocks as assignment
set property_id = null
where assignment.property_id is not null
  and (
    assignment.status is distinct from 'completed'
    or (
      assignment.completed_at is not null
      and assignment.completed_by is not null
      and assignment.checklist_completed_at is not null
      and case
        when jsonb_typeof(assignment.checklist_responses) = 'array'
        then jsonb_array_length(assignment.checklist_responses) > 0
        else false
      end
    )
  )
  and not exists (
    select 1
    from public.portal_properties as property
    where property.id = assignment.property_id
  );

update public.assignment_blocks as assignment
set portal_property_id = null
where assignment.portal_property_id is not null
  and (
    assignment.status is distinct from 'completed'
    or (
      assignment.completed_at is not null
      and assignment.completed_by is not null
      and assignment.checklist_completed_at is not null
      and case
        when jsonb_typeof(assignment.checklist_responses) = 'array'
        then jsonb_array_length(assignment.checklist_responses) > 0
        else false
      end
    )
  )
  and not exists (
    select 1
    from public.portal_properties as property
    where property.id = assignment.portal_property_id
  );

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_info.conname
    from pg_constraint as constraint_info
    join pg_class as table_info
      on table_info.oid = constraint_info.conrelid
    join pg_namespace as namespace_info
      on namespace_info.oid = table_info.relnamespace
    where namespace_info.nspname = 'public'
      and table_info.relname = 'assignment_blocks'
      and constraint_info.contype = 'f'
      and exists (
        select 1
        from unnest(constraint_info.conkey) as constrained_column(attnum)
        join pg_attribute as attribute_info
          on attribute_info.attrelid = constraint_info.conrelid
         and attribute_info.attnum = constrained_column.attnum
        where attribute_info.attname = 'property_id'
      )
  loop
    execute format('alter table public.assignment_blocks drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.assignment_blocks
  add constraint assignment_blocks_property_id_fkey
  foreign key (property_id)
  references public.portal_properties(id)
  on delete set null
  not valid;

alter table public.assignment_blocks
  validate constraint assignment_blocks_property_id_fkey;

alter table public.assignment_blocks
  drop constraint if exists assignment_blocks_portal_property_id_fkey;

alter table public.assignment_blocks
  add constraint assignment_blocks_portal_property_id_fkey
  foreign key (portal_property_id)
  references public.portal_properties(id)
  on delete set null
  not valid;

alter table public.assignment_blocks
  validate constraint assignment_blocks_portal_property_id_fkey;

create index if not exists assignment_blocks_property_idx
  on public.assignment_blocks (property_id);

create index if not exists assignment_blocks_portal_property_id_idx
  on public.assignment_blocks (portal_property_id);
