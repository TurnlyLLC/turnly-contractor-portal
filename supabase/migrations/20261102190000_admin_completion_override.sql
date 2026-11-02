alter table public.assignment_blocks add column admin_completion_override_by uuid;
create function public.stamp_admin_completion_override() returns trigger
language plpgsql set search_path = '' as $$
declare
  actor uuid := auth.uid();
  legacy_marker boolean := jsonb_typeof(new.checklist_responses) = 'array'
    and new.checklist_responses->0->>'type' = 'admin_status_update';
begin
  -- Ignore client-supplied override identities. Reopening ends the override.
  new.admin_completion_override_by := null;
  if new.status <> 'completed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    new.admin_completion_override_by := old.admin_completion_override_by;
    return new;
  end if;

  if actor is not null and exists (
    select 1 from public.profiles where id = actor and role::text = 'admin' and status = 'active'
  ) then
    if legacy_marker and jsonb_array_length(new.checklist_responses) = 1 then
      new.checklist_responses := case when tg_op = 'UPDATE' then old.checklist_responses else '[]'::jsonb end;
      new.checklist_completed_at := case when tg_op = 'UPDATE' then old.checklist_completed_at else null end;
    end if;
    if new.checklist_completed_at is null or
      not (case when jsonb_typeof(new.checklist_responses) = 'array' then jsonb_array_length(new.checklist_responses)>0 else false end) then
      new.admin_completion_override_by := actor;
      new.completed_by := actor;
      new.completed_at := coalesce(new.completed_at, now());
      new.visibility := 'closed';
    end if;
  elsif legacy_marker then
    raise exception 'Only an active admin can override checklist completion.';
  end if;
  return new;
end $$;
revoke all on function public.stamp_admin_completion_override() from public, anon, authenticated;
create trigger stamp_admin_completion_override before insert or update on public.assignment_blocks
for each row execute function public.stamp_admin_completion_override();

alter table public.assignment_blocks drop constraint assignment_blocks_completed_with_checklist_check,
  add constraint assignment_blocks_completed_with_checklist_check check (
    status <> 'completed' or (
      completed_at is not null and completed_by is not null and (
        (admin_completion_override_by is not null and admin_completion_override_by = completed_by)
        or (checklist_completed_at is not null and case when jsonb_typeof(checklist_responses)='array'
          then jsonb_array_length(checklist_responses)>0 else false end)
      )
    )
  ) not valid;
