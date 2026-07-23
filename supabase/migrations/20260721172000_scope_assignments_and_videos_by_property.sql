-- Scope assignment and QA video data by portal property without deleting data.
-- Per request on 2026-07-21, all existing assignment schedule rows and QA
-- video rows currently in Supabase belong to Vetra Forest Hills.

create extension if not exists pgcrypto;

alter table public.assignment_blocks
  add column if not exists portal_property_id uuid,
  add column if not exists recurring_portal_property_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.qa_videos
  add column if not exists portal_property_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.qa_jobs
  add column if not exists portal_property_id uuid;

create table if not exists public.property_assignment_links (
  id uuid primary key default gen_random_uuid(),
  portal_property_id uuid not null references public.portal_properties(id) on delete restrict,
  assignment_id uuid not null references public.assignment_blocks(id) on delete restrict,
  link_type text not null default 'primary',
  source text not null default 'property_scope_migration',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal_property_id, assignment_id, link_type)
);

create table if not exists public.property_qa_video_links (
  id uuid primary key default gen_random_uuid(),
  portal_property_id uuid not null references public.portal_properties(id) on delete restrict,
  qa_video_id uuid not null references public.qa_videos(id) on delete restrict,
  assignment_id uuid references public.assignment_blocks(id) on delete set null,
  link_type text not null default 'primary',
  source text not null default 'property_scope_migration',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal_property_id, qa_video_id, link_type)
);

create table if not exists public.property_scope_migration_audit (
  id uuid primary key default gen_random_uuid(),
  migration_name text not null unique,
  portal_property_id uuid references public.portal_properties(id) on delete set null,
  assignment_count integer not null default 0,
  qa_video_count integer not null default 0,
  qa_job_count integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.portal_property_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_property_id uuid not null references public.portal_properties(id) on delete restrict,
  alias_property_id uuid not null references public.portal_properties(id) on delete restrict,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alias_property_id)
);

create index if not exists property_assignment_links_property_idx
  on public.property_assignment_links(portal_property_id);

create index if not exists property_assignment_links_assignment_idx
  on public.property_assignment_links(assignment_id);

create index if not exists property_qa_video_links_property_idx
  on public.property_qa_video_links(portal_property_id);

create index if not exists property_qa_video_links_video_idx
  on public.property_qa_video_links(qa_video_id);

create index if not exists assignment_blocks_portal_property_id_idx
  on public.assignment_blocks(portal_property_id);

create index if not exists assignment_blocks_recurring_portal_property_due_idx
  on public.assignment_blocks(recurring_portal_property_id, recurring_due_at);

create index if not exists qa_videos_portal_property_idx
  on public.qa_videos(portal_property_id);

create index if not exists qa_jobs_portal_property_idx
  on public.qa_jobs(portal_property_id);

create index if not exists portal_property_aliases_canonical_idx
  on public.portal_property_aliases(canonical_property_id);

create or replace function public.canonical_portal_property_id(target_property_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select alias.canonical_property_id
      from public.portal_property_aliases as alias
      where alias.alias_property_id = target_property_id
      limit 1
    ),
    target_property_id
  );
$$;

create or replace function public.portal_property_access_matches(user_property_id uuid, scoped_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select user_property_id is not null
    and scoped_property_id is not null
    and (
      user_property_id = scoped_property_id
      or public.canonical_portal_property_id(user_property_id) = public.canonical_portal_property_id(scoped_property_id)
    );
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'qa_videos_portal_property_id_fkey'
      and conrelid = 'public.qa_videos'::regclass
  ) then
    alter table public.qa_videos
      add constraint qa_videos_portal_property_id_fkey
      foreign key (portal_property_id)
      references public.portal_properties(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'qa_jobs_portal_property_id_fkey'
      and conrelid = 'public.qa_jobs'::regclass
  ) then
    alter table public.qa_jobs
      add constraint qa_jobs_portal_property_id_fkey
      foreign key (portal_property_id)
      references public.portal_properties(id)
      on delete set null
      not valid;
  end if;
end $$;

do $$
declare
  vetra_property_id uuid;
  assignment_rows integer := 0;
  qa_video_rows integer := 0;
  qa_job_rows integer := 0;
begin
  select property.id
  into vetra_property_id
  from public.portal_properties as property
  where concat_ws(
    ' ',
    property.name,
    property.property_name,
    property.address
  ) ilike '%vetra%forest%hills%'
  order by
    (
      select count(*)
      from public.property_units as unit
      where unit.property_id = property.id
         or (property.client_id is not null and unit.property_id = property.client_id)
    ) desc,
    property.created_at asc nulls last
  limit 1;

  if vetra_property_id is null then
    insert into public.portal_properties (
      name,
      property_name,
      address,
      pipeline_stage,
      default_service_type,
      created_at,
      updated_at
    )
    values (
      'Vetra Forest Hills',
      'Vetra Forest Hills',
      '',
      'active',
      'Turn Cleaning',
      now(),
      now()
    )
    returning id into vetra_property_id;
  end if;

  insert into public.portal_property_aliases (
    canonical_property_id,
    alias_property_id,
    reason
  )
  select
    vetra_property_id,
    property.id,
    'Duplicate Vetra Forest Hills property record canonicalized during 2026-07-21 property scope migration.'
  from public.portal_properties as property
  where property.id <> vetra_property_id
    and concat_ws(
      ' ',
      property.name,
      property.property_name,
      property.address
    ) ilike '%vetra%forest%hills%'
  on conflict (alias_property_id)
  do update set
    canonical_property_id = excluded.canonical_property_id,
    reason = excluded.reason,
    updated_at = now();

  update public.profiles as profile
  set property_manager_property_id = vetra_property_id
  where profile.role = 'property_manager'
    and profile.property_manager_property_id is not null
    and profile.property_manager_property_id <> vetra_property_id
    and exists (
      select 1
      from public.portal_property_aliases as alias
      where alias.alias_property_id = profile.property_manager_property_id
        and alias.canonical_property_id = vetra_property_id
    );

  update public.assignment_blocks as assignment
  set
    metadata = jsonb_set(
      coalesce(assignment.metadata, '{}'::jsonb),
      '{property_scope_migration}',
      coalesce(
        assignment.metadata -> 'property_scope_migration',
        jsonb_build_object(
          'migration', '20260721172000_scope_assignments_and_videos_by_property',
          'migrated_at', now()::text,
          'reason', 'All existing assignment schedule rows assigned to Vetra Forest Hills per 2026-07-21 request.',
          'previous_property_id', assignment.property_id::text,
          'previous_portal_property_id', assignment.portal_property_id::text,
          'previous_recurring_portal_property_id', assignment.recurring_portal_property_id::text,
          'previous_property_name', assignment.property_name
        )
      ),
      true
    ),
    portal_property_id = vetra_property_id,
    recurring_portal_property_id = case
      when assignment.recurring_portal_property_id is not null
        or assignment.recurring_due_at is not null
        or coalesce(assignment.assignment_type, '') <> 'one_time'
      then vetra_property_id
      else assignment.recurring_portal_property_id
    end,
    property_name = coalesce(nullif(assignment.property_name, ''), 'Vetra Forest Hills'),
    updated_at = now()
  where (
      assignment.portal_property_id is distinct from vetra_property_id
      or assignment.recurring_portal_property_id is distinct from case
          when assignment.recurring_portal_property_id is not null
            or assignment.recurring_due_at is not null
            or coalesce(assignment.assignment_type, '') <> 'one_time'
          then vetra_property_id
          else assignment.recurring_portal_property_id
        end
      or assignment.property_name is null
      or assignment.property_name = ''
    )
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
    );

  get diagnostics assignment_rows = row_count;

  begin
    update public.assignment_blocks as assignment
    set property_id = vetra_property_id,
        updated_at = now()
    where assignment.property_id is distinct from vetra_property_id
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
      );
  exception
    when foreign_key_violation then
      raise notice 'Skipped assignment_blocks.property_id backfill because an existing foreign key does not point at portal_properties.';
  end;

  insert into public.property_assignment_links (
    portal_property_id,
    assignment_id,
    link_type,
    source,
    metadata
  )
  select
    vetra_property_id,
    assignment.id,
    'primary',
    '20260721_vetra_backfill',
    jsonb_build_object(
      'assignment_status', assignment.status,
      'assignment_start_window', assignment.start_window,
      'assignment_created_at', assignment.created_at
    )
  from public.assignment_blocks as assignment
  on conflict (portal_property_id, assignment_id, link_type)
  do update set
    source = excluded.source,
    metadata = excluded.metadata,
    updated_at = now();

  update public.qa_videos as video
  set
    metadata = jsonb_set(
      coalesce(video.metadata, '{}'::jsonb),
      '{property_scope_migration}',
      coalesce(
        video.metadata -> 'property_scope_migration',
        jsonb_build_object(
          'migration', '20260721172000_scope_assignments_and_videos_by_property',
          'migrated_at', now()::text,
          'reason', 'All existing QA video uploads assigned to Vetra Forest Hills per 2026-07-21 request.',
          'previous_property_id', video.property_id::text,
          'previous_portal_property_id', video.portal_property_id::text,
          'previous_property_name', video.property_name,
          'assignment_id', video.assignment_id::text
        )
      ),
      true
    ),
    portal_property_id = vetra_property_id,
    property_id = vetra_property_id,
    property_name = coalesce(nullif(video.property_name, ''), 'Vetra Forest Hills'),
    updated_at = now()
  where video.portal_property_id is distinct from vetra_property_id
     or video.property_id is distinct from vetra_property_id
     or video.property_name is null
     or video.property_name = '';

  get diagnostics qa_video_rows = row_count;

  update public.qa_jobs as job
  set portal_property_id = vetra_property_id
  where job.portal_property_id is distinct from vetra_property_id
     or (
       job.assignment_id is not null
       and exists (
         select 1
         from public.assignment_blocks as assignment
         where assignment.id = job.assignment_id
           and assignment.portal_property_id = vetra_property_id
       )
     );

  get diagnostics qa_job_rows = row_count;

  insert into public.property_qa_video_links (
    portal_property_id,
    qa_video_id,
    assignment_id,
    link_type,
    source,
    metadata
  )
  select
    vetra_property_id,
    video.id,
    video.assignment_id,
    'primary',
    '20260721_vetra_backfill',
    jsonb_build_object(
      'video_phase', video.video_phase,
      'video_created_at', video.created_at,
      'qa_job_id', video.qa_job_id
    )
  from public.qa_videos as video
  on conflict (portal_property_id, qa_video_id, link_type)
  do update set
    assignment_id = excluded.assignment_id,
    source = excluded.source,
    metadata = excluded.metadata,
    updated_at = now();

  insert into public.property_scope_migration_audit (
    migration_name,
    portal_property_id,
    assignment_count,
    qa_video_count,
    qa_job_count,
    notes
  )
  values (
    '20260721172000_scope_assignments_and_videos_by_property',
    vetra_property_id,
    assignment_rows,
    qa_video_rows,
    qa_job_rows,
    'Existing assignment schedule rows and QA video uploads were scoped to Vetra Forest Hills without deleting records.'
  )
  on conflict (migration_name)
  do update set
    portal_property_id = excluded.portal_property_id,
    assignment_count = excluded.assignment_count,
    qa_video_count = excluded.qa_video_count,
    qa_job_count = excluded.qa_job_count,
    notes = excluded.notes;
end $$;

alter table public.qa_videos validate constraint qa_videos_portal_property_id_fkey;
alter table public.qa_jobs validate constraint qa_jobs_portal_property_id_fkey;

create or replace function public.normalize_assignment_property_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.portal_property_id is null
    and new.property_id is not null
    and exists (
      select 1
      from public.portal_properties as property
      where property.id = new.property_id
    )
  then
    new.portal_property_id := new.property_id;
  end if;

  if new.portal_property_id is not null then
    new.portal_property_id := public.canonical_portal_property_id(new.portal_property_id);
    new.metadata := jsonb_set(
      coalesce(new.metadata, '{}'::jsonb),
      '{portal_property_id}',
      to_jsonb(new.portal_property_id::text),
      true
    );
  end if;

  return new;
end;
$$;

create or replace function public.sync_assignment_property_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.portal_property_id is not null then
    insert into public.property_assignment_links (
      portal_property_id,
      assignment_id,
      link_type,
      source,
      metadata
    )
    values (
      new.portal_property_id,
      new.id,
      'primary',
      'assignment_trigger',
      jsonb_build_object('assignment_status', new.status, 'assignment_start_window', new.start_window)
    )
    on conflict (portal_property_id, assignment_id, link_type)
    do update set
      source = excluded.source,
      metadata = excluded.metadata,
      updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.normalize_qa_video_property_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  assignment_property_id uuid;
  direct_property_id uuid;
begin
  if new.portal_property_id is null and new.assignment_id is not null then
    select assignment.portal_property_id
    into assignment_property_id
    from public.assignment_blocks as assignment
    where assignment.id = new.assignment_id;

    if assignment_property_id is not null then
      new.portal_property_id := assignment_property_id;
    end if;
  end if;

  if new.portal_property_id is null and new.property_id is not null then
    select property.id
    into direct_property_id
    from public.portal_properties as property
    where property.id = new.property_id
       or property.client_id = new.property_id
    order by case when property.id = new.property_id then 0 else 1 end
    limit 1;

    if direct_property_id is not null then
      new.portal_property_id := direct_property_id;
    end if;
  end if;

  if new.portal_property_id is not null then
    new.portal_property_id := public.canonical_portal_property_id(new.portal_property_id);
    new.property_id := new.portal_property_id;
    new.metadata := jsonb_set(
      coalesce(new.metadata, '{}'::jsonb),
      '{portal_property_id}',
      to_jsonb(new.portal_property_id::text),
      true
    );
  end if;

  return new;
end;
$$;

create or replace function public.sync_qa_video_property_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.portal_property_id is not null then
    insert into public.property_qa_video_links (
      portal_property_id,
      qa_video_id,
      assignment_id,
      link_type,
      source,
      metadata
    )
    values (
      new.portal_property_id,
      new.id,
      new.assignment_id,
      'primary',
      'qa_video_trigger',
      jsonb_build_object('video_phase', new.video_phase, 'qa_job_id', new.qa_job_id)
    )
    on conflict (portal_property_id, qa_video_id, link_type)
    do update set
      assignment_id = excluded.assignment_id,
      source = excluded.source,
      metadata = excluded.metadata,
      updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.normalize_qa_job_property_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  assignment_property_id uuid;
begin
  if new.portal_property_id is null and new.assignment_id is not null then
    select assignment.portal_property_id
    into assignment_property_id
    from public.assignment_blocks as assignment
    where assignment.id = new.assignment_id;

    if assignment_property_id is not null then
      new.portal_property_id := assignment_property_id;
    end if;
  end if;

  if new.portal_property_id is not null then
    new.portal_property_id := public.canonical_portal_property_id(new.portal_property_id);
  end if;

  return new;
end;
$$;

drop trigger if exists assignment_blocks_normalize_property_scope on public.assignment_blocks;
create trigger assignment_blocks_normalize_property_scope
before insert or update on public.assignment_blocks
for each row
execute function public.normalize_assignment_property_scope();

drop trigger if exists assignment_blocks_sync_property_link on public.assignment_blocks;
create trigger assignment_blocks_sync_property_link
after insert or update on public.assignment_blocks
for each row
execute function public.sync_assignment_property_link();

drop trigger if exists qa_videos_normalize_property_scope on public.qa_videos;
create trigger qa_videos_normalize_property_scope
before insert or update on public.qa_videos
for each row
execute function public.normalize_qa_video_property_scope();

drop trigger if exists qa_videos_sync_property_link on public.qa_videos;
create trigger qa_videos_sync_property_link
after insert or update on public.qa_videos
for each row
execute function public.sync_qa_video_property_link();

drop trigger if exists qa_jobs_normalize_property_scope on public.qa_jobs;
create trigger qa_jobs_normalize_property_scope
before insert or update on public.qa_jobs
for each row
execute function public.normalize_qa_job_property_scope();

alter table public.property_assignment_links enable row level security;
alter table public.property_qa_video_links enable row level security;
alter table public.property_scope_migration_audit enable row level security;
alter table public.portal_property_aliases enable row level security;

drop policy if exists "Admins can manage portal property aliases" on public.portal_property_aliases;
create policy "Admins can manage portal property aliases"
  on public.portal_property_aliases
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Linked property managers can read portal property aliases" on public.portal_property_aliases;
create policy "Linked property managers can read portal property aliases"
  on public.portal_property_aliases
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and public.portal_property_access_matches(
          profiles.property_manager_property_id,
          portal_property_aliases.canonical_property_id
        )
    )
  );

drop policy if exists "Admins can manage property assignment links" on public.property_assignment_links;
create policy "Admins can manage property assignment links"
  on public.property_assignment_links
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Linked property managers can read property assignment links" on public.property_assignment_links;
create policy "Linked property managers can read property assignment links"
  on public.property_assignment_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and public.portal_property_access_matches(
          profiles.property_manager_property_id,
          property_assignment_links.portal_property_id
        )
    )
  );

drop policy if exists "Admins can manage property QA video links" on public.property_qa_video_links;
create policy "Admins can manage property QA video links"
  on public.property_qa_video_links
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Linked property managers can read property QA video links" on public.property_qa_video_links;
create policy "Linked property managers can read property QA video links"
  on public.property_qa_video_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and public.portal_property_access_matches(
          profiles.property_manager_property_id,
          property_qa_video_links.portal_property_id
        )
    )
  );

drop policy if exists "Admins can view property scope migration audit" on public.property_scope_migration_audit;
create policy "Admins can view property scope migration audit"
  on public.property_scope_migration_audit
  for select
  to authenticated
  using (public.current_user_has_role(array['admin']));

drop policy if exists "Authenticated users can view assignment blocks" on public.assignment_blocks;
drop policy if exists "Approved contractors can view assignments" on public.assignment_blocks;
drop policy if exists "Linked property managers can view assignments" on public.assignment_blocks;
drop policy if exists "Admins and sales can view assignments" on public.assignment_blocks;

create policy "Admins and sales can view assignments"
  on public.assignment_blocks
  for select
  to authenticated
  using (public.current_user_has_role(array['admin', 'sales', 'sales_team']));

create policy "Approved contractors can view assignments"
  on public.assignment_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'contractor'
        and profiles.contractor_approved = true
    )
    and (
      (status = 'open' and claimed_by is null)
      or claimed_by = auth.uid()
      or assigned_to = auth.uid()
      or started_by = auth.uid()
      or completed_by = auth.uid()
    )
  );

create policy "Linked property managers can view assignments"
  on public.assignment_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and profiles.property_manager_property_id is not null
        and (
          public.portal_property_access_matches(
            profiles.property_manager_property_id,
            assignment_blocks.portal_property_id
          )
          or public.portal_property_access_matches(
            profiles.property_manager_property_id,
            assignment_blocks.recurring_portal_property_id
          )
          or exists (
            select 1
            from public.property_assignment_links as link
            where link.assignment_id = assignment_blocks.id
              and public.portal_property_access_matches(
                profiles.property_manager_property_id,
                link.portal_property_id
              )
          )
        )
    )
  );

drop policy if exists "Linked property managers can view QA jobs" on public.qa_jobs;
create policy "Linked property managers can view QA jobs"
  on public.qa_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and profiles.property_manager_property_id is not null
        and (
          public.portal_property_access_matches(
            profiles.property_manager_property_id,
            qa_jobs.portal_property_id
          )
          or exists (
            select 1
            from public.property_assignment_links as link
            where link.assignment_id = qa_jobs.assignment_id
              and public.portal_property_access_matches(
                profiles.property_manager_property_id,
                link.portal_property_id
              )
          )
        )
    )
  );

drop policy if exists "Linked property managers can view QA videos" on public.qa_videos;
create policy "Linked property managers can view QA videos"
  on public.qa_videos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and profiles.property_manager_property_id is not null
        and (
          public.portal_property_access_matches(
            profiles.property_manager_property_id,
            qa_videos.portal_property_id
          )
          or exists (
            select 1
            from public.property_qa_video_links as link
            where link.qa_video_id = qa_videos.id
              and public.portal_property_access_matches(
                profiles.property_manager_property_id,
                link.portal_property_id
              )
          )
          or exists (
            select 1
            from public.property_assignment_links as link
            where link.assignment_id = qa_videos.assignment_id
              and public.portal_property_access_matches(
                profiles.property_manager_property_id,
                link.portal_property_id
              )
          )
        )
    )
  );

drop policy if exists "Linked property managers can read QA video files" on storage.objects;
create policy "Linked property managers can read QA video files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'qa-videos'
    and exists (
      select 1
      from public.qa_videos as video
      where video.storage_path = name
        and exists (
          select 1
          from public.profiles
          where profiles.id = auth.uid()
            and profiles.role = 'property_manager'
            and profiles.property_manager_property_id is not null
            and (
              public.portal_property_access_matches(
                profiles.property_manager_property_id,
                video.portal_property_id
              )
              or exists (
                select 1
                from public.property_qa_video_links as link
                where link.qa_video_id = video.id
                  and public.portal_property_access_matches(
                    profiles.property_manager_property_id,
                    link.portal_property_id
                  )
              )
              or exists (
                select 1
                from public.property_assignment_links as link
                where link.assignment_id = video.assignment_id
                  and public.portal_property_access_matches(
                    profiles.property_manager_property_id,
                    link.portal_property_id
                  )
              )
            )
        )
    )
  );

grant select, insert, update on public.property_assignment_links to authenticated;
grant select, insert, update on public.property_qa_video_links to authenticated;
grant select, insert, update on public.portal_property_aliases to authenticated;
grant select on public.property_scope_migration_audit to authenticated;
grant execute on function public.canonical_portal_property_id(uuid) to authenticated;
grant execute on function public.portal_property_access_matches(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
