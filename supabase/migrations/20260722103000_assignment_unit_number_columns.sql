alter table public.assignment_blocks
  add column if not exists unit_id uuid,
  add column if not exists unit_number text not null default '',
  add column if not exists unit_name text not null default '';

create index if not exists assignment_blocks_unit_number_idx
  on public.assignment_blocks (unit_number);

create index if not exists assignment_blocks_unit_id_idx
  on public.assignment_blocks (unit_id);

update public.assignment_blocks
set
  unit_id = coalesce(
    unit_id,
    case
      when coalesce(metadata ->> 'unit_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (metadata ->> 'unit_id')::uuid
      else null
    end
  ),
  unit_number = coalesce(
    nullif(unit_number, ''),
    nullif(metadata ->> 'unit_number', ''),
    nullif(metadata ->> 'unit_name', ''),
    ''
  ),
  unit_name = coalesce(
    nullif(unit_name, ''),
    nullif(metadata ->> 'unit_name', ''),
    nullif(metadata ->> 'unit_number', ''),
    ''
  )
where
  (unit_id is null and coalesce(metadata ->> 'unit_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  or (unit_number = '' and (nullif(metadata ->> 'unit_number', '') is not null or nullif(metadata ->> 'unit_name', '') is not null))
  or (unit_name = '' and (nullif(metadata ->> 'unit_name', '') is not null or nullif(metadata ->> 'unit_number', '') is not null));

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
  requested_priority text := nullif(trim(coalesce(request_payload ->> 'priority', 'Normal')), '');
  requested_notes text := nullif(trim(coalesce(request_payload ->> 'notes', request_payload ->> 'body', '')), '');
  move_in_date date;
  start_at timestamptz;
  end_at timestamptz;
  unit_record public.property_units%rowtype;
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

  start_at := ((move_in_date::timestamp + time '14:00') at time zone 'America/New_York');
  end_at := start_at + interval '2 hours';

  if requested_unit is not null then
    select *
    into unit_record
    from public.property_units
    where property_id = linked_property_id
      and lower(unit_name) = lower(requested_unit)
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;
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
    metadata
  )
  values (
    concat('Unit Cleaning', case when requested_unit is not null then concat(' - Unit ', requested_unit) else '' end),
    coalesce(nullif(linked_property.property_name, ''), nullif(linked_property.name, ''), 'Linked Property'),
    nullif(linked_property.address, ''),
    'Unit Cleaning',
    coalesce(unit_record.contractor_pay, 0),
    unit_record.id,
    coalesce(requested_unit, ''),
    coalesce(requested_unit, ''),
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
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'property_manager_turn_request',
      'admin_approval_status', 'pending',
      'requested_by', auth.uid()::text,
      'requested_by_name', coalesce(requester.full_name, requester.email),
      'requested_by_email', requester.email,
      'requested_at', now(),
      'portal_property_id', linked_property_id::text,
      'property_name', coalesce(nullif(linked_property.property_name, ''), nullif(linked_property.name, '')),
      'unit_id', case when unit_record.id is not null then unit_record.id::text else null end,
      'unit_name', requested_unit,
      'unit_number', requested_unit,
      'unit_square_feet', unit_record.square_feet,
      'unit_customer_price', unit_record.customer_price,
      'unit_contractor_pay', unit_record.contractor_pay,
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

grant execute on function public.create_property_manager_turn_request(jsonb) to authenticated;
