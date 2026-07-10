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
  clean_id_texts text[] := '{}'::text[];
  target_count integer := 0;
  match_count integer := 0;
  deleted_count integer := 0;
  qa_job_ids uuid[] := '{}'::uuid[];
  metadata_qa_job_ids uuid[] := '{}'::uuid[];
  video_qa_job_ids uuid[] := '{}'::uuid[];
  uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
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

  select coalesce(array_agg(id::text), '{}'::text[])
  into clean_id_texts
  from unnest(clean_ids) as ids(id);

  select count(*)
  into match_count
  from public.assignment_blocks
  where id = any(clean_ids);

  if match_count <> target_count then
    raise exception 'One or more selected assignments could not be found'
      using errcode = 'P0002';
  end if;

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

  update public.assignment_blocks
  set source_assignment_id = null,
      updated_at = now()
  where source_assignment_id = any(clean_ids);

  delete from public.assignment_blocks
  where id = any(clean_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_schedule_assignment_blocks(uuid[], text) from public;
grant execute on function public.delete_schedule_assignment_blocks(uuid[], text) to authenticated;

notify pgrst, 'reload schema';
