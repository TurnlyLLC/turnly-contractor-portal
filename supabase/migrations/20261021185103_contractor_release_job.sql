-- Service-only transaction: identity comes from the API's verified access token.
create or replace function public.release_contractor_job(p_actor uuid, p_job uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare job public.assignment_blocks;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='contractor' and status='active') then
    raise exception 'Active contractor access is required.';
  end if;
  select * into job from public.assignment_blocks where id=p_job for update;
  if not found or job.claimed_by is distinct from p_actor or (job.assigned_to is not null and job.assigned_to<>p_actor) then
    raise exception 'You can only release a job you have claimed.';
  end if;
  if job.status not in ('claimed','scheduled') or job.started_at is not null or job.completed_at is not null then
    raise exception 'Only unstarted claimed jobs can be released.';
  end if;
  if job.start_window is null or job.start_window <= clock_timestamp() + interval '48 hours' then
    raise exception 'Jobs can only be released more than 48 hours before their scheduled start. Contact Turnly for help.';
  end if;
  update public.assignment_blocks set status='open', visibility='open',
    claimed_by=null, claimed_by_name=null, claimed_by_email=null, claimed_at=null,
    assigned_to=null, assigned_to_name=null, assigned_to_email=null, accepted_at=null
    where id=p_job;
  insert into public.admin_audit_log(actor_id,action,entity,entity_id,before_value,after_value,source)
    values(p_actor,'contractor_release_job','assignment_blocks',p_job::text,
      jsonb_build_object('status',job.status,'claimed_by',job.claimed_by,'start_window',job.start_window)::text,
      '{"status":"open","claimed_by":null}','contractor_pwa');
end;
$$;
revoke all on function public.release_contractor_job(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_contractor_job(uuid,uuid) to service_role;
