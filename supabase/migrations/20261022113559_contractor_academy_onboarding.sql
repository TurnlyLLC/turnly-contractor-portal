create table public.contractor_training_requirements (
 profile_id uuid not null references public.profiles(id), module_number integer not null check(module_number between 1 and 12),
 waived boolean not null default false, revision uuid not null default gen_random_uuid(), updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(), primary key(profile_id,module_number)
);
create table public.contractor_training_requirement_events (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id), module_number integer not null,
 waived boolean not null, actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
alter table public.contractor_training_requirements enable row level security;
alter table public.contractor_training_requirement_events enable row level security;
revoke all on public.contractor_training_requirements,public.contractor_training_requirement_events from public,anon,authenticated;
grant all on public.contractor_training_requirements,public.contractor_training_requirement_events to service_role;
create or replace function public.contractor_training_status(p_profile uuid default null)
returns table(profile_id uuid,module_number integer,lessons_done integer,score integer,waived boolean,revision uuid)
language sql stable security invoker set search_path=public as $$
 select p.id,m.n,
 (select count(distinct l.lesson_key)::integer from academy_learning_progress l where l.user_id=p.id and l.lesson_key in(select 'M'||lpad(m.n::text,2,'0')||'_L'||lpad(n::text,2,'0') from generate_series(1,5) n)),
 coalesce((select max(a.score) from academy_practice_attempts a where a.user_id=p.id and a.module_number=m.n),0),
 coalesce(r.waived,false),r.revision
 from profiles p cross join generate_series(1,12) m(n)
 left join contractor_training_requirements r on r.profile_id=p.id and r.module_number=m.n
 where p.role::text='contractor' and (p_profile is null or p.id=p_profile);
$$;
revoke all on function public.contractor_training_status(uuid) from public,anon,authenticated;
grant execute on function public.contractor_training_status(uuid) to service_role;
create or replace function public.set_contractor_training_requirement(p_actor uuid,p_profile uuid,p_module integer,p_required boolean,p_expected_revision uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare previous uuid;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin access required.'; end if;
 perform 1 from profiles where id=p_profile and role::text='contractor' and status not in ('deleted','deletion_pending','disabled','suspended','inactive','deactivated','rejected') for update;
 if not found then raise exception 'Contractor is unavailable.'; end if;
 if p_module not between 1 and 12 or p_module is null or p_required is null then raise exception 'Choose a training module.'; end if;
 select revision into previous from contractor_training_requirements where profile_id=p_profile and module_number=p_module;
 if previous is distinct from p_expected_revision then raise exception 'Training requirements changed. Refresh before saving.'; end if;
 insert into contractor_training_requirements(profile_id,module_number,waived,updated_by) values(p_profile,p_module,not p_required,p_actor)
 on conflict(profile_id,module_number) do update set waived=excluded.waived,updated_by=p_actor,updated_at=now(),revision=gen_random_uuid();
 insert into contractor_training_requirement_events(profile_id,module_number,waived,actor_id) values(p_profile,p_module,not p_required,p_actor);
end;
$$;
revoke all on function public.set_contractor_training_requirement(uuid,uuid,integer,boolean,uuid) from public,anon,authenticated;
grant execute on function public.set_contractor_training_requirement(uuid,uuid,integer,boolean,uuid) to service_role;

create or replace function public.claim_onboarded_contractor_job(p_actor uuid,p_job uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare contractor public.profiles; claimed_id uuid;
begin
 select * into contractor from public.profiles where id=p_actor and role::text='contractor' and status='active' and contractor_approved=true for share;
 if not found then raise exception 'Complete onboarding and wait for Turnly approval before accepting jobs.'; end if;
 if exists(select 1 from public.contractor_training_status(p_actor) where not waived and (lessons_done<5 or score<90)) then raise exception 'Complete required training before accepting jobs.'; end if;
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

