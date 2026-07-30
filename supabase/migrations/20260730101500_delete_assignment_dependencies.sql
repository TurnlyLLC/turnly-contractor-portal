-- Delete assignment attachments in dependency order so admins can remove a
-- completed/scheduled job and its QA/checklist records together.

do $$
begin
  if to_regclass('public.property_assignment_links') is not null then
    alter table public.property_assignment_links
      drop constraint if exists property_assignment_links_assignment_id_fkey;

    alter table public.property_assignment_links
      add constraint property_assignment_links_assignment_id_fkey
      foreign key (assignment_id)
      references public.assignment_blocks(id)
      on delete cascade;
  end if;

  if to_regclass('public.property_qa_video_links') is not null then
    alter table public.property_qa_video_links
      drop constraint if exists property_qa_video_links_qa_video_id_fkey;

    alter table public.property_qa_video_links
      add constraint property_qa_video_links_qa_video_id_fkey
      foreign key (qa_video_id)
      references public.qa_videos(id)
      on delete cascade;
  end if;
end $$;

create or replace function public.delete_assignment_block_dependencies(
  target_assignment_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_ids uuid[] := '{}'::uuid[];
  clean_id_texts text[] := '{}'::text[];
  qa_job_ids uuid[] := '{}'::uuid[];
  qa_job_id_texts text[] := '{}'::text[];
  metadata_qa_job_ids uuid[] := '{}'::uuid[];
  video_qa_job_ids uuid[] := '{}'::uuid[];
  qa_video_ids uuid[] := '{}'::uuid[];
  uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  into clean_ids
  from unnest(coalesce(target_assignment_ids, '{}'::uuid[])) as ids(id)
  where id is not null;

  if coalesce(array_length(clean_ids, 1), 0) = 0 then
    return;
  end if;

  select coalesce(array_agg(id::text), '{}'::text[])
  into clean_id_texts
  from unnest(clean_ids) as ids(id);

  select coalesce(array_agg(distinct (metadata ->> 'qa_job_id')::uuid), '{}'::uuid[])
  into metadata_qa_job_ids
  from public.assignment_blocks
  where id = any(clean_ids)
    and nullif(metadata ->> 'qa_job_id', '') ~* uuid_pattern;

  if to_regclass('public.qa_jobs') is not null then
    execute
      'select coalesce(array_agg(distinct id), ''{}''::uuid[]) from public.qa_jobs where assignment_id = any($1)'
    into qa_job_ids
    using clean_ids;
  end if;

  if to_regclass('public.qa_videos') is not null then
    execute
      'select coalesce(array_agg(distinct qa_job_id), ''{}''::uuid[]) from public.qa_videos where assignment_id = any($1) and qa_job_id is not null'
    into video_qa_job_ids
    using clean_ids;
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
  into qa_job_ids
  from unnest(qa_job_ids || metadata_qa_job_ids || video_qa_job_ids) as ids(value)
  where value is not null;

  select coalesce(array_agg(id::text), '{}'::text[])
  into qa_job_id_texts
  from unnest(qa_job_ids) as ids(id);

  if to_regclass('public.qa_videos') is not null then
    execute
      'select coalesce(array_agg(distinct id), ''{}''::uuid[]) from public.qa_videos where assignment_id = any($1) or qa_job_id = any($2)'
    into qa_video_ids
    using clean_ids, qa_job_ids;
  end if;

  if to_regclass('storage.objects') is not null and to_regclass('public.qa_videos') is not null then
    execute
      'delete from storage.objects as object
       using public.qa_videos as video
       where object.bucket_id = video.storage_bucket
         and object.name = video.storage_path
         and video.storage_path is not null
         and video.storage_path <> ''''
         and (video.assignment_id = any($1) or video.qa_job_id = any($2))'
    using clean_ids, qa_job_ids;
  end if;

  if to_regclass('storage.objects') is not null and to_regclass('public.qa_photos') is not null then
    execute
      'delete from storage.objects as object
       using public.qa_photos as photo
       where object.bucket_id = photo.storage_bucket
         and object.name = photo.storage_path
         and photo.storage_path is not null
         and photo.storage_path <> ''''
         and photo.assignment_id = any($1)'
    using clean_ids;
  end if;

  if to_regclass('public.property_qa_video_links') is not null then
    execute
      'delete from public.property_qa_video_links
       where assignment_id = any($1)
          or qa_video_id = any($2)
          or metadata ->> ''assignment_id'' = any($3)
          or metadata ->> ''qa_job_id'' = any($4)'
    using clean_ids, qa_video_ids, clean_id_texts, qa_job_id_texts;
  end if;

  if to_regclass('public.qa_videos') is not null then
    execute
      'delete from public.qa_videos where assignment_id = any($1) or qa_job_id = any($2)'
    using clean_ids, qa_job_ids;
  end if;

  if to_regclass('public.qa_photos') is not null then
    execute
      'delete from public.qa_photos where assignment_id = any($1)'
    using clean_ids;
  end if;

  if to_regclass('public.qa_jobs') is not null then
    execute
      'delete from public.qa_jobs where assignment_id = any($1) or id = any($2)'
    using clean_ids, qa_job_ids;
  end if;

  if to_regclass('public.coverage_requests') is not null then
    delete from public.coverage_requests
    where assignment_id = any(clean_ids)
       or metadata ->> 'assignment_id' = any(clean_id_texts);
  end if;

  if to_regclass('public.qa_alerts') is not null then
    delete from public.qa_alerts
    where assignment_id = any(clean_ids)
       or (
        source_table in ('assignment_blocks', 'assignment_block', 'assignments')
        and source_id = any(clean_ids)
      )
       or metadata ->> 'assignment_id' = any(clean_id_texts);
  end if;

  if to_regclass('public.command_center_action_items') is not null then
    delete from public.command_center_action_items
    where (
        source_table in ('assignment_blocks', 'assignment_block', 'assignments')
        and source_id = any(clean_ids)
      )
       or metadata ->> 'assignment_id' = any(clean_id_texts)
       or metadata ->> 'source_assignment_id' = any(clean_id_texts);
  end if;

  if to_regclass('public.property_assignment_links') is not null then
    execute
      'delete from public.property_assignment_links
       where assignment_id = any($1)
          or metadata ->> ''assignment_id'' = any($2)
          or metadata ->> ''source_assignment_id'' = any($2)'
    using clean_ids, clean_id_texts;
  end if;

  update public.assignment_blocks
  set source_assignment_id = null,
      updated_at = now()
  where source_assignment_id = any(clean_ids);
end;
$$;

revoke all on function public.delete_assignment_block_dependencies(uuid[]) from public;

create or replace function public.delete_completed_assignment_blocks(
  target_assignment_ids uuid[],
  confirmation_text text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_ids uuid[] := '{}'::uuid[];
  target_count integer := 0;
  match_count integer := 0;
  invalid_count integer := 0;
  deleted_count integer := 0;
begin
  if not public.current_user_has_role(array['admin']) then
    raise exception 'Only admins can delete completed contractor jobs'
      using errcode = '42501';
  end if;

  if confirmation_text is distinct from 'DELETE' then
    raise exception 'Delete confirmation text must be DELETE'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct id), '{}'::uuid[])
  into clean_ids
  from unnest(coalesce(target_assignment_ids, '{}'::uuid[])) as ids(id)
  where id is not null;

  target_count := coalesce(array_length(clean_ids, 1), 0);
  if target_count = 0 then
    raise exception 'Choose at least one completed contractor job to delete'
      using errcode = '22023';
  end if;

  select count(*)
  into match_count
  from public.assignment_blocks
  where id = any(clean_ids);

  if match_count <> target_count then
    raise exception 'One or more selected jobs could not be found'
      using errcode = 'P0002';
  end if;

  select count(*)
  into invalid_count
  from public.assignment_blocks
  where id = any(clean_ids)
    and (
      lower(regexp_replace(coalesce(status, ''), '[^a-z0-9]+', '-', 'g')) <> 'completed'
      or not (
        assigned_to is not null
        or claimed_by is not null
        or completed_by is not null
        or nullif(assigned_to_name, '') is not null
        or nullif(claimed_by_name, '') is not null
        or nullif(assigned_to_email, '') is not null
        or nullif(claimed_by_email, '') is not null
      )
    );

  if invalid_count > 0 then
    raise exception 'Only completed contractor jobs can be deleted from this action'
      using errcode = '22023';
  end if;

  perform public.delete_assignment_block_dependencies(clean_ids);

  delete from public.assignment_blocks
  where id = any(clean_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_completed_assignment_blocks(uuid[], text) from public;
grant execute on function public.delete_completed_assignment_blocks(uuid[], text) to authenticated;

create or replace function public.delete_schedule_assignment_blocks(
  target_assignment_ids uuid[],
  confirmation_text text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_ids uuid[] := '{}'::uuid[];
  target_count integer := 0;
  match_count integer := 0;
  deleted_count integer := 0;
begin
  if not public.current_user_has_role(array['admin']) then
    raise exception 'Only admins can permanently delete scheduled assignments'
      using errcode = '42501';
  end if;

  if confirmation_text is distinct from 'DELETE' then
    raise exception 'Delete confirmation text must be DELETE'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct id), '{}'::uuid[])
  into clean_ids
  from unnest(coalesce(target_assignment_ids, '{}'::uuid[])) as ids(id)
  where id is not null;

  target_count := coalesce(array_length(clean_ids, 1), 0);
  if target_count = 0 then
    raise exception 'Choose at least one assignment to delete'
      using errcode = '22023';
  end if;

  select count(*)
  into match_count
  from public.assignment_blocks
  where id = any(clean_ids);

  if match_count <> target_count then
    raise exception 'One or more selected assignments could not be found'
      using errcode = 'P0002';
  end if;

  perform public.delete_assignment_block_dependencies(clean_ids);

  delete from public.assignment_blocks
  where id = any(clean_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_schedule_assignment_blocks(uuid[], text) from public;
grant execute on function public.delete_schedule_assignment_blocks(uuid[], text) to authenticated;

grant select, insert, update, delete on public.property_assignment_links to authenticated;
grant select, insert, update, delete on public.property_qa_video_links to authenticated;

notify pgrst, 'reload schema';
