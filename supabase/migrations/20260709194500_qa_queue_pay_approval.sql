do $$
begin
  create type public.qa_status as enum ('pending_upload', 'in_review', 'approved', 'rejected');
exception
  when duplicate_object then
    alter type public.qa_status add value if not exists 'pending_upload';
    alter type public.qa_status add value if not exists 'in_review';
    alter type public.qa_status add value if not exists 'approved';
    alter type public.qa_status add value if not exists 'rejected';
end $$;

create table if not exists public.qa_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  assignment_id uuid references public.assignment_blocks(id) on delete set null,
  service_date date not null default current_date,
  cleaner_name text,
  job_type text,
  qa_status public.qa_status not null default 'pending_upload',
  checklist_summary text,
  reviewer_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz
);

alter table public.qa_jobs
  add column if not exists assignment_id uuid references public.assignment_blocks(id) on delete set null,
  add column if not exists qa_status public.qa_status not null default 'pending_upload',
  add column if not exists reviewer_notes text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

alter table public.qa_videos
  add column if not exists qa_job_id uuid references public.qa_jobs(id) on delete cascade,
  add column if not exists room_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists review_status text not null default 'pending_review',
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_notes text;

alter table public.assignment_blocks
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists pay_status text,
  add column if not exists payout_status text,
  add column if not exists qa_approved_at timestamptz,
  add column if not exists qa_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists qa_reviewer_notes text;

create index if not exists qa_jobs_assignment_id_idx
  on public.qa_jobs(assignment_id);

create index if not exists qa_jobs_status_idx
  on public.qa_jobs(qa_status);

create index if not exists qa_videos_review_status_idx
  on public.qa_videos(review_status);

create index if not exists assignment_blocks_qa_approved_at_idx
  on public.assignment_blocks(qa_approved_at);

alter table public.qa_jobs enable row level security;

drop policy if exists "Admins can manage QA jobs" on public.qa_jobs;
create policy "Admins can manage QA jobs"
  on public.qa_jobs
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

grant select, insert, update, delete on public.qa_jobs to authenticated;

create or replace function public.ensure_assignment_qa_job(target_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_row public.assignment_blocks%rowtype;
  existing_qa_job_id uuid;
  new_qa_job_id uuid;
  qa_property_id uuid;
  qa_summary text;
begin
  select *
  into assignment_row
  from public.assignment_blocks
  where id = target_assignment_id
    and (
      claimed_by = auth.uid()
      or assigned_to = auth.uid()
      or started_by = auth.uid()
      or completed_by = auth.uid()
      or created_by = auth.uid()
      or public.current_user_has_role(array['admin'])
    );

  if not found then
    raise exception 'Assignment is not available for this user'
      using errcode = '42501';
  end if;

  begin
    existing_qa_job_id := nullif(assignment_row.metadata ->> 'qa_job_id', '')::uuid;
  exception
    when invalid_text_representation then
      existing_qa_job_id := null;
  end;

  if existing_qa_job_id is not null
    and exists (select 1 from public.qa_jobs where id = existing_qa_job_id)
  then
    update public.qa_jobs
    set assignment_id = assignment_row.id
    where id = existing_qa_job_id
      and assignment_id is distinct from assignment_row.id;
    return existing_qa_job_id;
  end if;

  if assignment_row.property_id is not null
    and exists (select 1 from public.properties where id = assignment_row.property_id)
  then
    qa_property_id := assignment_row.property_id;
  else
    qa_property_id := null;
  end if;

  qa_summary := concat_ws(
    ' | ',
    nullif(assignment_row.property_name, ''),
    nullif(assignment_row.title, ''),
    nullif(assignment_row.service_type, ''),
    'Assignment ' || assignment_row.id::text
  );

  insert into public.qa_jobs (
    property_id,
    assignment_id,
    service_date,
    cleaner_name,
    job_type,
    checklist_summary
  )
  values (
    qa_property_id,
    assignment_row.id,
    coalesce(
      assignment_row.start_window::date,
      assignment_row.recurring_due_at::date,
      assignment_row.created_at::date,
      current_date
    ),
    nullif(coalesce(assignment_row.claimed_by_name, assignment_row.assigned_to_name, ''), ''),
    nullif(coalesce(assignment_row.service_type, assignment_row.title, ''), ''),
    qa_summary
  )
  returning id into new_qa_job_id;

  update public.assignment_blocks
  set
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{qa_job_id}',
      to_jsonb(new_qa_job_id::text),
      true
    ),
    updated_at = now()
  where id = assignment_row.id;

  return new_qa_job_id;
end;
$$;

create or replace function public.submit_assignment_for_qa(
  target_assignment_id uuid,
  checklist_payload jsonb default '[]'::jsonb,
  submitted_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_row public.assignment_blocks%rowtype;
  qa_id uuid;
  clean_submitted_at timestamptz := coalesce(submitted_at, now());
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select *
  into assignment_row
  from public.assignment_blocks
  where id = target_assignment_id
    and (
      claimed_by = auth.uid()
      or assigned_to = auth.uid()
      or started_by = auth.uid()
      or completed_by = auth.uid()
      or public.current_user_has_role(array['admin'])
    );

  if not found then
    raise exception 'Assignment is not available for QA submission'
      using errcode = '42501';
  end if;

  qa_id := public.ensure_assignment_qa_job(target_assignment_id);

  update public.qa_jobs
  set
    assignment_id = assignment_row.id,
    qa_status = 'in_review',
    service_date = coalesce(assignment_row.start_window::date, assignment_row.recurring_due_at::date, clean_submitted_at::date),
    cleaner_name = nullif(coalesce(assignment_row.claimed_by_name, assignment_row.assigned_to_name, ''), ''),
    job_type = nullif(coalesce(assignment_row.service_type, assignment_row.title, ''), ''),
    checklist_summary = concat_ws(
      ' | ',
      nullif(assignment_row.property_name, ''),
      nullif(assignment_row.title, ''),
      nullif(assignment_row.service_type, ''),
      'Submitted ' || clean_submitted_at::text
    )
  where id = qa_id;

  update public.qa_videos
  set
    qa_job_id = qa_id,
    review_status = case
      when review_status in ('approved', 'rejected', 'needs_rework') then review_status
      else 'pending_review'
    end
  where assignment_id = assignment_row.id
    and (qa_job_id is null or qa_job_id = qa_id);

  update public.assignment_blocks
  set
    status = 'qa_pending',
    visibility = 'closed',
    payment_status = 'pending_qa',
    pay_status = 'pending_qa',
    payout_status = 'qa_review',
    checklist_responses = coalesce(checklist_payload, '[]'::jsonb),
    checklist_completed_at = clean_submitted_at,
    completed_at = clean_submitted_at,
    completed_by = auth.uid(),
    metadata = jsonb_set(
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{qa_job_id}',
        to_jsonb(qa_id::text),
        true
      ),
      '{qa_submitted_at}',
      to_jsonb(clean_submitted_at::text),
      true
    ),
    updated_at = now()
  where id = assignment_row.id;

  return qa_id;
end;
$$;

create or replace function public.approve_assignment_qa(
  target_assignment_id uuid,
  target_qa_job_id uuid default null,
  review_notes text default null
)
returns public.assignment_blocks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_row public.assignment_blocks%rowtype;
  approved_row public.assignment_blocks%rowtype;
  qa_id uuid;
  reviewed_time timestamptz := now();
begin
  if not public.current_user_has_role(array['admin']) then
    raise exception 'Only admins can approve QA for pay' using errcode = '42501';
  end if;

  select *
  into assignment_row
  from public.assignment_blocks
  where id = target_assignment_id;

  if not found then
    raise exception 'Assignment not found';
  end if;

  qa_id := coalesce(target_qa_job_id, nullif(assignment_row.metadata ->> 'qa_job_id', '')::uuid);
  if qa_id is null then
    select qa_job_id
    into qa_id
    from public.qa_videos
    where assignment_id = target_assignment_id
      and qa_job_id is not null
    order by created_at desc
    limit 1;
  end if;
  if qa_id is null then
    qa_id := public.ensure_assignment_qa_job(target_assignment_id);
  end if;

  update public.qa_jobs
  set
    qa_status = 'approved',
    reviewer_notes = review_notes,
    reviewed_by = auth.uid(),
    reviewed_at = reviewed_time
  where id = qa_id;

  update public.qa_videos
  set
    review_status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = reviewed_time,
    reviewer_notes = review_notes
  where assignment_id = target_assignment_id
     or qa_job_id = qa_id;

  update public.assignment_blocks
  set
    status = 'completed',
    payment_status = 'approved_for_pay',
    pay_status = 'approved_for_pay',
    payout_status = 'ready_for_payout',
    qa_approved_at = reviewed_time,
    qa_approved_by = auth.uid(),
    qa_reviewer_notes = review_notes,
    metadata = jsonb_set(
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{qa_job_id}',
        to_jsonb(qa_id::text),
        true
      ),
      '{qa_approved_at}',
      to_jsonb(reviewed_time::text),
      true
    ),
    updated_at = now()
  where id = target_assignment_id
  returning * into approved_row;

  return approved_row;
end;
$$;

create or replace function public.request_assignment_qa_revision(
  target_assignment_id uuid,
  target_qa_job_id uuid default null,
  review_notes text default null
)
returns public.assignment_blocks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_row public.assignment_blocks%rowtype;
  revised_row public.assignment_blocks%rowtype;
  qa_id uuid;
  reviewed_time timestamptz := now();
begin
  if not public.current_user_has_role(array['admin']) then
    raise exception 'Only admins can request QA rework' using errcode = '42501';
  end if;

  select *
  into assignment_row
  from public.assignment_blocks
  where id = target_assignment_id;

  if not found then
    raise exception 'Assignment not found';
  end if;

  qa_id := coalesce(target_qa_job_id, nullif(assignment_row.metadata ->> 'qa_job_id', '')::uuid);
  if qa_id is null then
    select qa_job_id
    into qa_id
    from public.qa_videos
    where assignment_id = target_assignment_id
      and qa_job_id is not null
    order by created_at desc
    limit 1;
  end if;
  if qa_id is null then
    qa_id := public.ensure_assignment_qa_job(target_assignment_id);
  end if;

  update public.qa_jobs
  set
    qa_status = 'rejected',
    reviewer_notes = review_notes,
    reviewed_by = auth.uid(),
    reviewed_at = reviewed_time
  where id = qa_id;

  update public.qa_videos
  set
    review_status = 'needs_rework',
    reviewed_by = auth.uid(),
    reviewed_at = reviewed_time,
    reviewer_notes = review_notes
  where assignment_id = target_assignment_id
     or qa_job_id = qa_id;

  update public.assignment_blocks
  set
    status = 'qa_pending',
    payment_status = 'qa_rejected',
    pay_status = 'qa_rejected',
    payout_status = 'qa_rework',
    qa_reviewer_notes = review_notes,
    updated_at = now()
  where id = target_assignment_id
  returning * into revised_row;

  return revised_row;
end;
$$;

revoke all on function public.ensure_assignment_qa_job(uuid) from public;
revoke all on function public.submit_assignment_for_qa(uuid, jsonb, timestamptz) from public;
revoke all on function public.approve_assignment_qa(uuid, uuid, text) from public;
revoke all on function public.request_assignment_qa_revision(uuid, uuid, text) from public;

grant execute on function public.ensure_assignment_qa_job(uuid) to authenticated;
grant execute on function public.submit_assignment_for_qa(uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.approve_assignment_qa(uuid, uuid, text) to authenticated;
grant execute on function public.request_assignment_qa_revision(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
