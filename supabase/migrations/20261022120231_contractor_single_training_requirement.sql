-- One admin decision applies atomically to the whole Academy requirement.
create or replace function public.set_contractor_training_required(p_actor uuid,p_profile uuid,p_required boolean,p_expected_revisions jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare current_revisions jsonb; m integer;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin access required.'; end if;
 perform 1 from profiles where id=p_profile and role::text='contractor' for update;
 if not found then raise exception 'Contractor is unavailable.'; end if;
 select jsonb_object_agg(module_number::text,revision) into current_revisions from contractor_training_status(p_profile);
 if current_revisions is distinct from p_expected_revisions then raise exception 'Training requirements changed. Refresh before saving.'; end if;
 for m in 1..12 loop
  perform set_contractor_training_requirement(p_actor,p_profile,m,p_required,(current_revisions->>m::text)::uuid);
 end loop;
end;
$$;
revoke all on function public.set_contractor_training_required(uuid,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.set_contractor_training_required(uuid,uuid,boolean,jsonb) to service_role;

create or replace function public.claim_onboarded_contractor_job(p_actor uuid,p_job uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare contractor public.profiles; claimed_id uuid;
begin
 select * into contractor from public.profiles where id=p_actor and role::text='contractor' and status='active' and contractor_approved=true for share;
 if not found then raise exception 'Complete onboarding and wait for Turnly approval before accepting jobs.'; end if;
 if not (select count(*)=12 and (bool_and(waived) or bool_and(lessons_done=5 and score>=90)) from public.contractor_training_status(p_actor)) then raise exception 'Complete required training before accepting jobs.'; end if;
 update public.assignment_blocks as assignment set
   status='claimed',visibility='claimed',claimed_by=p_actor,claimed_by_name=coalesce(contractor.full_name,contractor.email),claimed_by_email=contractor.email,
   assigned_to=p_actor,assigned_to_name=coalesce(contractor.full_name,contractor.email),assigned_to_email=contractor.email,accepted_at=now(),claimed_at=now()
 where assignment.id=p_job and assignment.status in ('open','preferred_pending') and assignment.claimed_by is null
   and (assignment.assigned_to is null or assignment.assigned_to=p_actor)
   and (coalesce(assignment.visibility,'open')='open' or p_actor=any(coalesce(assignment.preferred_contractor_ids,'{}'::uuid[])))
   and p_actor<>all(coalesce(assignment.declined_contractor_ids,'{}'::uuid[]))
   and public.contractor_assignment_matches_scope(assignment,p_actor)
 returning id into claimed_id;
 if claimed_id is null then raise exception 'This job is no longer available to claim.'; end if;
end;
$$;
revoke all on function public.claim_onboarded_contractor_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_onboarded_contractor_job(uuid,uuid) to service_role;

