alter table public.property_manager_clean_feedback
  add column if not exists rating integer,
  add column if not exists contractor_id uuid,
  add column if not exists contractor_name text,
  add column if not exists contractor_email text;

alter table public.property_manager_clean_feedback
  alter column message drop not null;

do $$
begin
  alter table public.property_manager_clean_feedback
    drop constraint if exists property_manager_clean_feedback_message_check;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_manager_clean_feedback_rating_check'
      and conrelid = 'public.property_manager_clean_feedback'::regclass
  ) then
    alter table public.property_manager_clean_feedback
      add constraint property_manager_clean_feedback_rating_check
      check (rating is null or rating between 1 and 5);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_manager_clean_feedback_message_or_rating_check'
      and conrelid = 'public.property_manager_clean_feedback'::regclass
  ) then
    alter table public.property_manager_clean_feedback
      add constraint property_manager_clean_feedback_message_or_rating_check
      check (
        rating is not null
        or length(trim(coalesce(message, ''))) > 0
      );
  end if;
end $$;

create unique index if not exists property_manager_clean_feedback_quality_review_once_idx
  on public.property_manager_clean_feedback (assignment_id, created_by)
  where rating is not null;

create index if not exists property_manager_clean_feedback_rating_idx
  on public.property_manager_clean_feedback (rating, created_at desc)
  where rating is not null;

create index if not exists property_manager_clean_feedback_contractor_idx
  on public.property_manager_clean_feedback (contractor_id, created_at desc)
  where contractor_id is not null;

create or replace function public.create_property_manager_clean_feedback(feedback_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles%rowtype;
  target_assignment public.assignment_blocks%rowtype;
  linked_property_id uuid;
  created_feedback_id uuid;
  feedback_message text := trim(coalesce(feedback_payload ->> 'message', ''));
  feedback_kind text := lower(regexp_replace(coalesce(nullif(feedback_payload ->> 'feedback_type', ''), 'complaint'), '[\s-]+', '_', 'g'));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to send clean feedback.';
  end if;

  select * into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null then
    raise exception 'A profile is required before sending clean feedback.';
  end if;

  if lower(regexp_replace(coalesce(requester.role::text, ''), '[\s-]+', '_', 'g')) <> 'property_manager' then
    raise exception 'Only property manager accounts can send clean feedback.';
  end if;

  linked_property_id := requester.property_manager_property_id;
  if linked_property_id is null then
    raise exception 'Your property manager account must be linked to a property before sending clean feedback.';
  end if;

  if feedback_message = '' then
    raise exception 'Feedback details are required.';
  end if;

  select * into target_assignment
  from public.assignment_blocks
  where id = nullif(feedback_payload ->> 'assignment_id', '')::uuid;

  if target_assignment.id is null then
    raise exception 'The selected assignment could not be found.';
  end if;

  if not public.assignment_belongs_to_property(target_assignment.id, linked_property_id) then
    raise exception 'This assignment is not linked to your property.';
  end if;

  insert into public.property_manager_clean_feedback (
    assignment_id,
    portal_property_id,
    property_name,
    unit_number,
    contractor_id,
    contractor_name,
    contractor_email,
    feedback_type,
    message,
    status,
    created_by,
    created_by_name,
    created_by_email,
    metadata
  )
  values (
    target_assignment.id,
    linked_property_id,
    coalesce(nullif(feedback_payload ->> 'property_name', ''), target_assignment.property_name),
    coalesce(nullif(feedback_payload ->> 'unit_number', ''), target_assignment.unit_number, target_assignment.unit_name),
    coalesce(target_assignment.completed_by, target_assignment.assigned_to, target_assignment.claimed_by, target_assignment.started_by),
    coalesce(target_assignment.completed_by_name, target_assignment.assigned_to_name, target_assignment.claimed_by_name),
    coalesce(target_assignment.completed_by_email, target_assignment.assigned_to_email, target_assignment.claimed_by_email),
    feedback_kind,
    feedback_message,
    'open',
    auth.uid(),
    coalesce(requester.full_name, requester.email),
    requester.email,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'property_manager_clean_feedback',
      'assignment_status', target_assignment.status,
      'assignment_title', target_assignment.title,
      'service_type', target_assignment.service_type,
      'submitted_from', 'property_manager_portal'
    ))
  )
  returning id into created_feedback_id;

  return created_feedback_id;
end;
$$;

create or replace function public.create_property_manager_quality_review(feedback_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles%rowtype;
  target_assignment public.assignment_blocks%rowtype;
  linked_property_id uuid;
  created_feedback_id uuid;
  feedback_rating integer := coalesce(nullif(feedback_payload ->> 'rating', '')::integer, 0);
  feedback_message text := trim(coalesce(feedback_payload ->> 'message', ''));
  existing_feedback_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to send a quality review.';
  end if;

  if feedback_rating < 1 or feedback_rating > 5 then
    raise exception 'Choose a 1 to 5 star rating before sending the review.';
  end if;

  select * into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null then
    raise exception 'A profile is required before sending a quality review.';
  end if;

  if lower(regexp_replace(coalesce(requester.role::text, ''), '[\s-]+', '_', 'g')) <> 'property_manager' then
    raise exception 'Only property manager accounts can send quality reviews.';
  end if;

  linked_property_id := requester.property_manager_property_id;
  if linked_property_id is null then
    raise exception 'Your property manager account must be linked to a property before sending quality reviews.';
  end if;

  select * into target_assignment
  from public.assignment_blocks
  where id = nullif(feedback_payload ->> 'assignment_id', '')::uuid;

  if target_assignment.id is null then
    raise exception 'The selected assignment could not be found.';
  end if;

  if not public.assignment_belongs_to_property(target_assignment.id, linked_property_id) then
    raise exception 'This assignment is not linked to your property.';
  end if;

  if not (
    lower(regexp_replace(coalesce(target_assignment.status::text, ''), '[\s-]+', '_', 'g')) in ('completed', 'complete', 'closed', 'done', 'qa_pending')
    or target_assignment.completed_at is not null
    or target_assignment.checklist_completed_at is not null
  ) then
    raise exception 'Quality reviews can only be submitted after a unit is completed.';
  end if;

  select id into existing_feedback_id
  from public.property_manager_clean_feedback
  where assignment_id = target_assignment.id
    and created_by = auth.uid()
    and rating is not null
  order by created_at desc
  limit 1;

  if existing_feedback_id is not null then
    update public.property_manager_clean_feedback
    set
      portal_property_id = linked_property_id,
      property_name = coalesce(nullif(feedback_payload ->> 'property_name', ''), target_assignment.property_name),
      unit_number = coalesce(nullif(feedback_payload ->> 'unit_number', ''), target_assignment.unit_number, target_assignment.unit_name),
      contractor_id = coalesce(target_assignment.completed_by, target_assignment.assigned_to, target_assignment.claimed_by, target_assignment.started_by),
      contractor_name = coalesce(target_assignment.completed_by_name, target_assignment.assigned_to_name, target_assignment.claimed_by_name),
      contractor_email = coalesce(target_assignment.completed_by_email, target_assignment.assigned_to_email, target_assignment.claimed_by_email),
      feedback_type = 'quality_review',
      rating = feedback_rating,
      message = nullif(feedback_message, ''),
      status = 'new',
      created_by_name = coalesce(requester.full_name, requester.email),
      created_by_email = requester.email,
      metadata = jsonb_strip_nulls(coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'property_manager_quality_review',
        'assignment_status', target_assignment.status,
        'assignment_title', target_assignment.title,
        'service_type', target_assignment.service_type,
        'submitted_from', 'property_manager_portal'
      )),
      updated_at = now()
    where id = existing_feedback_id
    returning id into created_feedback_id;
  else
    insert into public.property_manager_clean_feedback (
      assignment_id,
      portal_property_id,
      property_name,
      unit_number,
      contractor_id,
      contractor_name,
      contractor_email,
      feedback_type,
      rating,
      message,
      status,
      created_by,
      created_by_name,
      created_by_email,
      metadata
    )
    values (
      target_assignment.id,
      linked_property_id,
      coalesce(nullif(feedback_payload ->> 'property_name', ''), target_assignment.property_name),
      coalesce(nullif(feedback_payload ->> 'unit_number', ''), target_assignment.unit_number, target_assignment.unit_name),
      coalesce(target_assignment.completed_by, target_assignment.assigned_to, target_assignment.claimed_by, target_assignment.started_by),
      coalesce(target_assignment.completed_by_name, target_assignment.assigned_to_name, target_assignment.claimed_by_name),
      coalesce(target_assignment.completed_by_email, target_assignment.assigned_to_email, target_assignment.claimed_by_email),
      'quality_review',
      feedback_rating,
      nullif(feedback_message, ''),
      'new',
      auth.uid(),
      coalesce(requester.full_name, requester.email),
      requester.email,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'property_manager_quality_review',
        'assignment_status', target_assignment.status,
        'assignment_title', target_assignment.title,
        'service_type', target_assignment.service_type,
        'submitted_from', 'property_manager_portal'
      ))
    )
    returning id into created_feedback_id;
  end if;

  return created_feedback_id;
end;
$$;

grant select, insert, update, delete on public.property_manager_clean_feedback to authenticated;
grant execute on function public.create_property_manager_clean_feedback(jsonb) to authenticated;
grant execute on function public.create_property_manager_quality_review(jsonb) to authenticated;

notify pgrst, 'reload schema';
