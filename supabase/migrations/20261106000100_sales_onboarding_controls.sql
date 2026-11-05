create table public.crm_onboarding_rules (
 scope text primary key,
 requirements jsonb not null check(jsonb_typeof(requirements)='object'),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id)
);
alter table public.crm_onboarding_rules enable row level security;
revoke all on public.crm_onboarding_rules from public,anon,authenticated;
grant select,insert,update,delete on public.crm_onboarding_rules to service_role;
create function public.crm_onboarding_requirements(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select '{"training":true,"introduction":true,"agreement":true,"portal":true,"playbook":true}'::jsonb
 ||coalesce((select requirements from public.crm_onboarding_rules where scope='team'),'{}'::jsonb)
 ||coalesce((select requirements from public.crm_onboarding_rules where scope=p_user::text),'{}'::jsonb);
$$;
create function public.crm_onboarding_required(p_user uuid,p_key text) returns boolean
language sql stable security invoker set search_path='' as $$
 select case when p_key='agreement' then (r->>'agreement')::boolean
 else (r->>'training')::boolean and coalesce((r->>p_key)::boolean,true) end
 from (select public.crm_onboarding_requirements(p_user) r) s;
$$;
create or replace function public.crm_seller_training_ready_v3(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select (not public.crm_onboarding_required(p_user,'agreement') or public.crm_current_agreement_signed(p_user))
 and (not public.crm_onboarding_required(p_user,'introduction') or exists(select 1 from public.crm_training_progress where user_id=p_user and version='20261027-v2' and lesson='introduction' and completed_at is not null))
 and (not public.crm_onboarding_required(p_user,'portal') or exists(select 1 from public.crm_training_progress where user_id=p_user and version='20261027-v2' and lesson='portal' and completed_at is not null))
 and (not public.crm_onboarding_required(p_user,'playbook') or exists(select 1 from public.crm_training_reviews where user_id=p_user and version='20261028-v3'));
$$;
create or replace function public.crm_seller_training_acknowledge_v4(p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if public.crm_onboarding_required(p_user,'agreement') and not public.crm_current_agreement_signed(p_user) then raise exception 'Sign your seller agreement first.';end if;
 if exists(select 1 from (values('introduction'),('portal')) as l(lesson) where public.crm_onboarding_required(p_user,l.lesson) and not exists(select 1 from public.crm_training_progress p where p.user_id=p_user and p.version='20261027-v2' and p.lesson=l.lesson and p.completed_at is not null)) then raise exception 'Finish the required videos before confirming the playbook.';end if;
 insert into public.crm_training_reviews(user_id,version) values(p_user,'20261028-v3') on conflict do nothing;
 return true;
end $$;
do $$
declare f regprocedure; definition text;
begin
 foreach f in array array['public.crm_seller_training_record_v4(uuid,text,uuid,double precision,boolean)'::regprocedure,'public.crm_playbook_section_review(uuid,text,boolean)'::regprocedure] loop
 definition:=pg_get_functiondef(f);
 definition:=replace(definition,'not public.crm_current_agreement_signed(p_user)','public.crm_onboarding_required(p_user,''agreement'') and not public.crm_current_agreement_signed(p_user)');
 execute definition;
 end loop;
end $$;
revoke all on function public.crm_onboarding_requirements(uuid),public.crm_onboarding_required(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_onboarding_requirements(uuid),public.crm_onboarding_required(uuid,text) to service_role;
