create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.contractor_assignment_feedback (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignment_blocks(id) on delete cascade,
  qa_job_id uuid references public.qa_jobs(id) on delete set null,
  portal_property_id uuid references public.portal_properties(id) on delete set null,
  property_id uuid,
  property_name text,
  unit_number text,
  contractor_id uuid not null default auth.uid(),
  contractor_name text,
  contractor_email text,
  rating integer not null check (rating between 1 and 5),
  feedback text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists contractor_assignment_feedback_assignment_idx
  on public.contractor_assignment_feedback (assignment_id);

create index if not exists contractor_assignment_feedback_contractor_idx
  on public.contractor_assignment_feedback (contractor_id, created_at desc);

create index if not exists contractor_assignment_feedback_rating_idx
  on public.contractor_assignment_feedback (rating, created_at desc);

create index if not exists contractor_assignment_feedback_status_idx
  on public.contractor_assignment_feedback (status, created_at desc);

drop trigger if exists set_contractor_assignment_feedback_updated_at on public.contractor_assignment_feedback;
create trigger set_contractor_assignment_feedback_updated_at
  before update on public.contractor_assignment_feedback
  for each row
  execute function public.set_updated_at();

alter table public.contractor_assignment_feedback enable row level security;

create or replace function public.is_turnly_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) in ('admin', 'sales', 'sales_team')
  );
$$;

drop policy if exists "Admins can manage contractor assignment feedback" on public.contractor_assignment_feedback;
create policy "Admins can manage contractor assignment feedback"
  on public.contractor_assignment_feedback
  for all
  using (public.is_turnly_admin())
  with check (public.is_turnly_admin());

drop policy if exists "Contractors can read own assignment feedback" on public.contractor_assignment_feedback;
create policy "Contractors can read own assignment feedback"
  on public.contractor_assignment_feedback
  for select
  using (contractor_id = auth.uid());

drop policy if exists "Contractors can create own assignment feedback" on public.contractor_assignment_feedback;
create policy "Contractors can create own assignment feedback"
  on public.contractor_assignment_feedback
  for insert
  with check (
    contractor_id = auth.uid()
    and exists (
      select 1
      from public.assignment_blocks a
      where a.id = contractor_assignment_feedback.assignment_id
        and auth.uid() in (a.claimed_by, a.assigned_to, a.started_by, a.completed_by)
        and (
          lower(regexp_replace(coalesce(a.status::text, ''), '[\s-]+', '_', 'g')) in ('qa_pending', 'completed', 'complete', 'closed', 'done')
          or a.checklist_completed_at is not null
          or a.completed_by = auth.uid()
        )
    )
  );

create or replace function public.create_contractor_assignment_feedback(feedback_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles%rowtype;
  target_assignment public.assignment_blocks%rowtype;
  created_feedback_id uuid;
  feedback_rating integer := coalesce(nullif(feedback_payload ->> 'rating', '')::integer, 0);
  feedback_text text := trim(coalesce(feedback_payload ->> 'feedback', ''));
  submitted_contractor_id uuid;
  is_admin boolean := public.is_turnly_admin();
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to send job feedback.';
  end if;

  if feedback_rating < 1 or feedback_rating > 5 then
    raise exception 'Choose a star rating before sending feedback.';
  end if;

  select * into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null then
    raise exception 'A profile is required before sending job feedback.';
  end if;

  select * into target_assignment
  from public.assignment_blocks
  where id = nullif(feedback_payload ->> 'assignment_id', '')::uuid;

  if target_assignment.id is null then
    raise exception 'The selected assignment could not be found.';
  end if;

  if not is_admin and not (
    auth.uid() = target_assignment.claimed_by
    or auth.uid() = target_assignment.assigned_to
    or auth.uid() = target_assignment.started_by
    or auth.uid() = target_assignment.completed_by
  ) then
    raise exception 'You can only send feedback for your own completed jobs.';
  end if;

  if not is_admin and target_assignment.checklist_completed_at is null and target_assignment.completed_by is distinct from auth.uid() then
    raise exception 'Complete the checklist before sending job feedback.';
  end if;

  submitted_contractor_id := case
    when is_admin and (feedback_payload ->> 'contractor_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (feedback_payload ->> 'contractor_id')::uuid
    else auth.uid()
  end;

  insert into public.contractor_assignment_feedback (
    assignment_id,
    qa_job_id,
    portal_property_id,
    property_id,
    property_name,
    unit_number,
    contractor_id,
    contractor_name,
    contractor_email,
    rating,
    feedback,
    status,
    metadata
  )
  values (
    target_assignment.id,
    case
      when (feedback_payload ->> 'qa_job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (feedback_payload ->> 'qa_job_id')::uuid
      else null
    end,
    case
      when (feedback_payload ->> 'portal_property_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (feedback_payload ->> 'portal_property_id')::uuid
      else coalesce(target_assignment.portal_property_id, target_assignment.recurring_portal_property_id)
    end,
    case
      when (feedback_payload ->> 'property_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (feedback_payload ->> 'property_id')::uuid
      else null
    end,
    coalesce(nullif(feedback_payload ->> 'property_name', ''), target_assignment.property_name),
    coalesce(nullif(feedback_payload ->> 'unit_number', ''), target_assignment.unit_number, target_assignment.unit_name),
    submitted_contractor_id,
    coalesce(nullif(feedback_payload ->> 'contractor_name', ''), requester.full_name, requester.email),
    coalesce(nullif(feedback_payload ->> 'contractor_email', ''), requester.email),
    feedback_rating,
    nullif(feedback_text, ''),
    'new',
    jsonb_strip_nulls(coalesce(feedback_payload -> 'metadata', '{}'::jsonb) || jsonb_build_object(
      'source', 'contractor_assignment_feedback',
      'assignment_status', target_assignment.status,
      'assignment_title', target_assignment.title,
      'service_type', target_assignment.service_type,
      'submitted_from', 'contractor_portal'
    ))
  )
  returning id into created_feedback_id;

  return created_feedback_id;
end;
$$;

grant select, insert, update, delete on public.contractor_assignment_feedback to authenticated;
grant execute on function public.create_contractor_assignment_feedback(jsonb) to authenticated;

notify pgrst, 'reload schema';
