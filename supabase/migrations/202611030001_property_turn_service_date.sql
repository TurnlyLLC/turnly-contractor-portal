CREATE OR REPLACE FUNCTION public.create_property_manager_turn_request(request_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  requester public.profiles%rowtype;
  linked_property_id uuid;
  linked_property public.portal_properties%rowtype;
  requested_unit text := nullif(trim(coalesce(request_payload ->> 'unit', request_payload ->> 'unit_name', '')), '');
  requested_unit_key text := public.turnly_normalized_unit_key(requested_unit);
  requested_priority text := nullif(trim(coalesce(request_payload ->> 'priority', 'Normal')), '');
  requested_notes text := nullif(trim(coalesce(request_payload ->> 'notes', request_payload ->> 'body', '')), '');
  move_in_date date;
  service_date date;
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

  -- Older portal versions submit only the move-in date.
  service_date := coalesce((request_payload ->> 'service_date')::date, move_in_date);
  if request_payload ? 'service_date' and (request_payload ->> 'service_date' is null or service_date < (now() at time zone 'America/New_York')::date) then
    raise exception 'Choose a current or future cleaning date.';
  end if;
  start_at := ((service_date::timestamp + time '14:00') at time zone 'America/New_York');
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
      'service_date', service_date::text,
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
$function$;
