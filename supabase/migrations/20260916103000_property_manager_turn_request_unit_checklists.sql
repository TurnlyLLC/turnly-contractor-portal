-- Let property managers add missing units safely and copy bed/bath checklist snapshots
-- onto new turn-request assignments.

create or replace function public.turnly_normalized_unit_key(unit_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(regexp_replace(regexp_replace(coalesce(unit_value, ''), '^\s*unit\s+', '', 'i'), '(^|[^a-zA-Z0-9])0+([0-9])', '\1\2', 'g')),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.turnly_checklist_template_for_bed_bath(
  bedroom_value numeric,
  bathroom_value numeric
)
returns public.checklist_templates
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  template_record public.checklist_templates%rowtype;
  bedroom_label text := trim(trailing '.' from trim(trailing '0' from trim(to_char(greatest(coalesce(bedroom_value, 0), 0), 'FM999999990.99'))));
  bathroom_label text := trim(trailing '.' from trim(trailing '0' from trim(to_char(greatest(coalesce(bathroom_value, 0), 0), 'FM999999990.99'))));
  exact_label text;
begin
  exact_label := lower(concat(bedroom_label, ' bed ', bathroom_label, ' bath'));

  select *
  into template_record
  from public.checklist_templates
  where lower(trim(name)) = exact_label
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if template_record.id is not null then
    return template_record;
  end if;

  select *
  into template_record
  from public.checklist_templates
  where lower(concat_ws(' ', name, description)) like concat('%', bedroom_label, '%bed%')
    and lower(concat_ws(' ', name, description)) like concat('%', bathroom_label, '%bath%')
  order by
    case when lower(coalesce(department, '')) like '%clean%' then 0 else 1 end,
    updated_at desc nulls last,
    created_at desc nulls last
  limit 1;

  return template_record;
end;
$$;

create or replace function public.turnly_flatten_checklist_sections(sections_value jsonb)
returns jsonb
language sql
immutable
as $$
  with sections as (
    select
      section.value as section_value,
      section.ordinality as section_index,
      coalesce(nullif(section.value ->> 'title', ''), 'General') as section_title
    from jsonb_array_elements(coalesce(sections_value, '[]'::jsonb)) with ordinality as section(value, ordinality)
  ),
  section_items as (
    select
      jsonb_build_object(
        'id', concat(coalesce(nullif(item.value ->> 'id', ''), concat('item-', section_index, '-', item.ordinality)), '-1'),
        'category', section_title,
        'task', coalesce(nullif(item.value ->> 'label', ''), nullif(item.value ->> 'task', ''), 'Checklist item'),
        'label', coalesce(nullif(item.value ->> 'label', ''), nullif(item.value ->> 'task', ''), 'Checklist item'),
        'type', coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'check'),
        'module_id', coalesce(section_value ->> 'id', ''),
        'module_name', section_title,
        'module_instance', 1,
        'source_item_id', coalesce(item.value ->> 'id', ''),
        'required', case when lower(coalesce(item.value ->> 'required', 'true')) = 'false' then false else true end,
        'media_required', case
          when coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'check') in ('photo', 'video')
          then coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'none')
          else 'none'
        end,
        'notes', case
          when coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'check') = 'note'
          then 'Contractor should leave a completion note.'
          else ''
        end
      ) as flattened_item,
      section_index,
      item.ordinality as item_index,
      0 as room_index
    from sections
    cross join lateral jsonb_array_elements(coalesce(section_value -> 'items', '[]'::jsonb)) with ordinality as item(value, ordinality)
    where coalesce(nullif(item.value ->> 'label', ''), nullif(item.value ->> 'task', '')) is not null
  ),
  room_items as (
    select
      jsonb_build_object(
        'id', concat(coalesce(nullif(item.value ->> 'id', ''), concat('room-item-', section_index, '-', room.ordinality, '-', item.ordinality)), '-1'),
        'category', concat(section_title, ' / ', coalesce(nullif(room.value ->> 'title', ''), 'Room')),
        'task', coalesce(nullif(item.value ->> 'label', ''), nullif(item.value ->> 'task', ''), 'Checklist item'),
        'label', coalesce(nullif(item.value ->> 'label', ''), nullif(item.value ->> 'task', ''), 'Checklist item'),
        'type', coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'check'),
        'module_id', coalesce(section_value ->> 'id', ''),
        'module_name', section_title,
        'module_instance', 1,
        'source_item_id', coalesce(item.value ->> 'id', ''),
        'required', case when lower(coalesce(item.value ->> 'required', 'true')) = 'false' then false else true end,
        'media_required', case
          when coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'check') in ('photo', 'video')
          then coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'none')
          else 'none'
        end,
        'notes', case
          when coalesce(nullif(item.value ->> 'type', ''), nullif(item.value ->> 'media_required', ''), 'check') = 'note'
          then 'Contractor should leave a completion note.'
          else ''
        end
      ) as flattened_item,
      section_index,
      item.ordinality as item_index,
      room.ordinality as room_index
    from sections
    cross join lateral jsonb_array_elements(coalesce(section_value -> 'rooms', '[]'::jsonb)) with ordinality as room(value, ordinality)
    cross join lateral jsonb_array_elements(coalesce(room.value -> 'items', '[]'::jsonb)) with ordinality as item(value, ordinality)
    where coalesce(nullif(item.value ->> 'label', ''), nullif(item.value ->> 'task', '')) is not null
  ),
  flattened as (
    select * from section_items
    union all
    select * from room_items
  )
  select coalesce(jsonb_agg(flattened_item order by section_index, room_index, item_index), '[]'::jsonb)
  from flattened;
$$;

create or replace function public.turnly_property_manager_create_unit(unit_payload jsonb)
returns public.property_units
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requester public.profiles%rowtype;
  linked_property_id uuid;
  linked_property public.portal_properties%rowtype;
  requested_unit text := nullif(trim(coalesce(unit_payload ->> 'unit_name', unit_payload ->> 'unit_number', unit_payload ->> 'unit', '')), '');
  bedroom_value numeric := greatest(coalesce(nullif(unit_payload ->> 'bedroom_count', '')::numeric, nullif(unit_payload ->> 'bed_count', '')::numeric, 0), 0);
  bathroom_value numeric := greatest(coalesce(nullif(unit_payload ->> 'bathroom_count', '')::numeric, nullif(unit_payload ->> 'bath_count', '')::numeric, 0), 0);
  square_feet_value numeric := greatest(coalesce(nullif(unit_payload ->> 'square_feet', '')::numeric, nullif(unit_payload ->> 'sq_ft', '')::numeric, 0), 0);
  template_record public.checklist_templates%rowtype;
  saved_unit public.property_units%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to add a unit.';
  end if;

  select *
  into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null or requester.role <> 'property_manager' then
    raise exception 'Only property manager accounts can add units from this portal.';
  end if;

  if requester.property_manager_property_id is null then
    raise exception 'Your property manager account must be linked to a property before adding units.';
  end if;

  if requested_unit is null then
    raise exception 'Enter the unit number.';
  end if;

  linked_property_id := public.canonical_portal_property_id(requester.property_manager_property_id);

  select *
  into linked_property
  from public.portal_properties
  where id = linked_property_id;

  if linked_property.id is null then
    raise exception 'The linked property could not be found.';
  end if;

  select *
  into template_record
  from public.turnly_checklist_template_for_bed_bath(bedroom_value, bathroom_value);

  insert into public.property_units (
    property_id,
    unit_name,
    square_feet,
    customer_price,
    contractor_pay,
    status,
    notes,
    created_by,
    bedroom_count,
    bathroom_count,
    checklist_template_id,
    checklist_items,
    checklist_module_counts
  )
  values (
    linked_property_id,
    requested_unit,
    square_feet_value,
    0,
    0,
    'active',
    'Added by property manager turn request flow.',
    auth.uid(),
    bedroom_value,
    bathroom_value,
    template_record.id,
    public.turnly_flatten_checklist_sections(template_record.sections),
    '{}'::jsonb
  )
  on conflict (property_id, unit_name)
  do update set
    square_feet = excluded.square_feet,
    bedroom_count = excluded.bedroom_count,
    bathroom_count = excluded.bathroom_count,
    checklist_template_id = coalesce(public.property_units.checklist_template_id, excluded.checklist_template_id),
    checklist_items = case
      when jsonb_typeof(coalesce(public.property_units.checklist_items, '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(public.property_units.checklist_items, '[]'::jsonb)) > 0
      then public.property_units.checklist_items
      else excluded.checklist_items
    end,
    checklist_module_counts = coalesce(public.property_units.checklist_module_counts, '{}'::jsonb),
    updated_at = now()
  returning * into saved_unit;

  return saved_unit;
exception
  when invalid_text_representation then
    raise exception 'Enter valid bed, bath, and square foot numbers.';
end;
$$;

create or replace function public.create_property_manager_turn_request(request_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requester public.profiles%rowtype;
  linked_property_id uuid;
  linked_property public.portal_properties%rowtype;
  requested_unit text := nullif(trim(coalesce(request_payload ->> 'unit', request_payload ->> 'unit_name', '')), '');
  requested_unit_key text := public.turnly_normalized_unit_key(requested_unit);
  requested_priority text := nullif(trim(coalesce(request_payload ->> 'priority', 'Normal')), '');
  requested_notes text := nullif(trim(coalesce(request_payload ->> 'notes', request_payload ->> 'body', '')), '');
  move_in_date date;
  start_at timestamptz;
  end_at timestamptz;
  unit_record public.property_units%rowtype;
  template_record public.checklist_templates%rowtype;
  created_assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to submit a turn request.';
  end if;

  select *
  into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null or requester.role <> 'property_manager' then
    raise exception 'Only property manager accounts can submit turn requests.';
  end if;

  if requester.property_manager_property_id is null then
    raise exception 'Your property manager account must be linked to a property before submitting turn requests.';
  end if;

  linked_property_id := public.canonical_portal_property_id(requester.property_manager_property_id);

  select *
  into linked_property
  from public.portal_properties
  where id = linked_property_id;

  if linked_property.id is null then
    raise exception 'The linked property could not be found.';
  end if;

  begin
    move_in_date := nullif(request_payload ->> 'move_in_date', '')::date;
  exception when others then
    raise exception 'Choose a valid scheduled move-in date.';
  end;

  if move_in_date is null then
    raise exception 'Choose a scheduled move-in date.';
  end if;

  if requested_unit is null then
    raise exception 'Choose a unit from the property unit list.';
  end if;

  start_at := ((move_in_date::timestamp + time '14:00') at time zone 'America/New_York');
  end_at := start_at + interval '2 hours';

  select *
  into unit_record
  from public.property_units
  where property_id in (linked_property_id, requester.property_manager_property_id)
    and (
      lower(coalesce(unit_name, '')) = lower(requested_unit)
      or public.turnly_normalized_unit_key(unit_name) = requested_unit_key
    )
  order by
    case when lower(coalesce(unit_name, '')) = lower(requested_unit) then 0 else 1 end,
    updated_at desc nulls last,
    created_at desc nulls last
  limit 1;

  if unit_record.id is null then
    raise exception 'Choose an existing unit from the list, or add the unit first.';
  end if;

  if unit_record.checklist_template_id is null then
    select *
    into template_record
    from public.turnly_checklist_template_for_bed_bath(unit_record.bedroom_count, unit_record.bathroom_count);

    unit_record.checklist_template_id := template_record.id;
    unit_record.checklist_items := public.turnly_flatten_checklist_sections(template_record.sections);

    if unit_record.checklist_template_id is not null then
      update public.property_units
      set
        checklist_template_id = unit_record.checklist_template_id,
        checklist_items = coalesce(unit_record.checklist_items, '[]'::jsonb),
        checklist_module_counts = coalesce(checklist_module_counts, '{}'::jsonb),
        updated_at = now()
      where id = unit_record.id;
    end if;
  end if;

  insert into public.assignment_blocks (
    title,
    property_name,
    address,
    service_type,
    pay_amount,
    unit_id,
    unit_number,
    unit_name,
    scope,
    supplies_notes,
    special_instructions,
    status,
    priority,
    start_window,
    end_window,
    assignment_type,
    recurrence_frequency,
    recurrence_interval,
    auto_renewal,
    visibility,
    created_by,
    portal_property_id,
    recurring_portal_property_id,
    property_checklist_items,
    metadata
  )
  values (
    concat('Unit Cleaning - Unit ', unit_record.unit_name),
    coalesce(nullif(linked_property.property_name, ''), nullif(linked_property.name, ''), 'Linked Property'),
    nullif(linked_property.address, ''),
    'Unit Cleaning',
    coalesce(unit_record.contractor_pay, 0),
    unit_record.id,
    coalesce(unit_record.unit_name, requested_unit, ''),
    coalesce(unit_record.unit_name, requested_unit, ''),
    'Property manager submitted unit cleaning request.',
    '',
    coalesce(requested_notes, ''),
    'pending',
    lower(coalesce(requested_priority, 'normal')),
    start_at,
    end_at,
    'one_time',
    'one_time',
    1,
    false,
    'pending',
    auth.uid(),
    linked_property_id,
    linked_property_id,
    coalesce(unit_record.checklist_items, '[]'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'property_manager_turn_request',
      'admin_approval_status', 'pending',
      'requested_by', auth.uid()::text,
      'requested_by_name', coalesce(requester.full_name, requester.email),
      'requested_by_email', requester.email,
      'requested_at', now(),
      'portal_property_id', linked_property_id::text,
      'property_name', coalesce(nullif(linked_property.property_name, ''), nullif(linked_property.name, '')),
      'unit_id', unit_record.id::text,
      'unit_name', unit_record.unit_name,
      'unit_number', unit_record.unit_name,
      'unit_square_feet', unit_record.square_feet,
      'unit_bedroom_count', unit_record.bedroom_count,
      'unit_bathroom_count', unit_record.bathroom_count,
      'unit_customer_price', unit_record.customer_price,
      'unit_contractor_pay', unit_record.contractor_pay,
      'checklist_template_id', case when unit_record.checklist_template_id is not null then unit_record.checklist_template_id::text else null end,
      'checklist_item_count', case
        when jsonb_typeof(coalesce(unit_record.checklist_items, '[]'::jsonb)) = 'array'
        then jsonb_array_length(coalesce(unit_record.checklist_items, '[]'::jsonb))
        else 0
      end,
      'move_in_date', move_in_date::text,
      'move_in_time', '2:00 PM',
      'property_manager_notes', requested_notes,
      'admin_only_editable', jsonb_build_array('start_window', 'end_window')
    ))
  )
  returning id into created_assignment_id;

  insert into public.property_assignment_links (
    portal_property_id,
    assignment_id,
    link_type,
    source,
    metadata
  )
  values (
    linked_property_id,
    created_assignment_id,
    'primary',
    'property_manager_turn_request',
    jsonb_build_object(
      'assignment_status', 'pending',
      'assignment_start_window', start_at,
      'requested_by', auth.uid()::text
    )
  )
  on conflict (portal_property_id, assignment_id, link_type)
  do update set
    source = excluded.source,
    metadata = excluded.metadata,
    updated_at = now();

  return created_assignment_id;
end;
$$;

grant execute on function public.turnly_normalized_unit_key(text) to authenticated;
grant execute on function public.turnly_checklist_template_for_bed_bath(numeric, numeric) to authenticated;
grant execute on function public.turnly_property_manager_create_unit(jsonb) to authenticated;
grant execute on function public.create_property_manager_turn_request(jsonb) to authenticated;

notify pgrst, 'reload schema';
