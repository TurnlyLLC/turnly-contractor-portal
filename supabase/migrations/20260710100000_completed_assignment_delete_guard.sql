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

  with input_ids as (
    select distinct unnest(coalesce(target_assignment_ids, '{}'::uuid[])) as id
  )
  select count(*) into target_count
  from input_ids
  where id is not null;

  if target_count = 0 then
    raise exception 'Choose at least one completed contractor job to delete'
      using errcode = '22023';
  end if;

  with input_ids as (
    select distinct unnest(target_assignment_ids) as id
  )
  select count(*) into match_count
  from public.assignment_blocks ab
  join input_ids ids on ids.id = ab.id;

  if match_count <> target_count then
    raise exception 'One or more selected jobs could not be found'
      using errcode = 'P0002';
  end if;

  with input_ids as (
    select distinct unnest(target_assignment_ids) as id
  )
  select count(*) into invalid_count
  from public.assignment_blocks ab
  join input_ids ids on ids.id = ab.id
  where lower(regexp_replace(coalesce(ab.status, ''), '[^a-z0-9]+', '-', 'g')) <> 'completed'
    or not (
      ab.assigned_to is not null
      or ab.claimed_by is not null
      or ab.completed_by is not null
      or nullif(ab.assigned_to_name, '') is not null
      or nullif(ab.claimed_by_name, '') is not null
      or nullif(ab.assigned_to_email, '') is not null
      or nullif(ab.claimed_by_email, '') is not null
    );

  if invalid_count > 0 then
    raise exception 'Only completed contractor jobs can be deleted from this action'
      using errcode = '22023';
  end if;

  with input_ids as (
    select distinct unnest(target_assignment_ids) as id
  )
  delete from public.assignment_blocks ab
  using input_ids ids
  where ab.id = ids.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_completed_assignment_blocks(uuid[], text) from public;
grant execute on function public.delete_completed_assignment_blocks(uuid[], text) to authenticated;

notify pgrst, 'reload schema';
