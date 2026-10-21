-- Claims must pass the API's live native-onboarding check. No browser fallback.
revoke all on function public.claim_assignment_block(uuid) from public,anon,authenticated;
drop policy if exists "Approved contractors can claim open assignments" on public.assignment_blocks;
drop policy if exists "Contractors can claim open assignments" on public.assignment_blocks;

create or replace function public.claim_onboarded_contractor_job(p_actor uuid,p_job uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare contractor public.profiles; claimed_id uuid;
begin
 select * into contractor from public.profiles where id=p_actor and role::text='contractor' and status='active' and contractor_approved=true for share;
 if not found then raise exception 'Complete onboarding and wait for Turnly approval before accepting jobs.'; end if;
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

-- Prevent accepting via a direct insert/update or the older start-job path.
create or replace function turnly_private.guard_contractor_claim_path()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is not null and current_user in ('authenticated','anon') and exists(select 1 from public.profiles where id=auth.uid() and role::text='contractor') then
   if TG_OP='INSERT' then
     raise exception 'Contractors cannot create jobs. Use the job board to accept available work.';
   elsif (new.claimed_by is not null and new.claimed_by is distinct from old.claimed_by)
     or (new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to)
     or (old.status in ('open','preferred_pending') and new.status in ('claimed','scheduled','in_progress')) then
     raise exception 'Accept jobs through the updated portal so onboarding can be verified.';
   end if;
 end if;
 return new;
end;
$$;
create trigger guard_contractor_claim_path before insert or update on public.assignment_blocks
for each row execute function turnly_private.guard_contractor_claim_path();
