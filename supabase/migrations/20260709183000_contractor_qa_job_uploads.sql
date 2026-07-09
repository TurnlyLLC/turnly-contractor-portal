-- Contractor checklist media uploads need a QA job row before qa_videos insert.
-- This RPC creates or reuses one for the active assignment without exposing broad
-- qa_jobs insert permissions to contractor clients.

do $$
begin
  create type public.qa_status as enum ('pending_upload', 'in_review', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.qa_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  service_date date not null,
  cleaner_name text,
  job_type text,
  qa_status public.qa_status not null default 'pending_upload',
  checklist_summary text,
  reviewer_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz
);

alter table public.qa_jobs
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists property_id uuid references public.properties(id) on delete cascade,
  add column if not exists service_date date not null default current_date,
  add column if not exists cleaner_name text,
  add column if not exists job_type text,
  add column if not exists checklist_summary text,
  add column if not exists reviewer_notes text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

alter table public.qa_jobs
  alter column service_date drop default;

alter table public.qa_videos
  add column if not exists qa_job_id uuid references public.qa_jobs(id) on delete cascade,
  add column if not exists room_name text,
  add column if not exists file_size_bytes bigint;

do $$
begin
  if not exists (
    select 1
    from public.qa_videos
    where qa_job_id is null
    limit 1
  ) then
    alter table public.qa_videos alter column qa_job_id set not null;
  end if;
end $$;

create index if not exists qa_jobs_service_date_idx
  on public.qa_jobs(service_date desc);

create index if not exists qa_videos_qa_job_id_idx
  on public.qa_videos(qa_job_id);

alter table public.qa_jobs enable row level security;

drop policy if exists "Contractors can read assignment QA jobs" on public.qa_jobs;
create policy "Contractors can read assignment QA jobs"
  on public.qa_jobs for select
  to authenticated
  using (
    exists (
      select 1
      from public.assignment_blocks ab
      where (ab.metadata ->> 'qa_job_id') = qa_jobs.id::text
        and (
          ab.claimed_by = auth.uid()
          or ab.assigned_to = auth.uid()
          or ab.started_by = auth.uid()
          or ab.completed_by = auth.uid()
        )
    )
  );

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
    service_date,
    cleaner_name,
    job_type,
    checklist_summary
  )
  values (
    qa_property_id,
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

revoke all on function public.ensure_assignment_qa_job(uuid) from public;
grant execute on function public.ensure_assignment_qa_job(uuid) to authenticated;

notify pgrst, 'reload schema';
