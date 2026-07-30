-- Supabase Storage files must be deleted through the Storage API, not by
-- deleting from storage.objects in SQL. Keep this helper focused on database
-- rows and relationship links; the admin portal removes bucket objects first.

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

notify pgrst, 'reload schema';
