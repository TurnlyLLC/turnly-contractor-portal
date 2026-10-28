create table public.crm_playbook_sections(
 user_id uuid not null references public.profiles(id), version text not null,
 section text not null check(section in ('playbook-0','playbook-1','playbook-2','playbook-3','playbook-4','playbook-5','playbook-6','playbook-7','playbook-8','gift-card-facts')),
 started_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 primary key(user_id,version,section)
);
alter table public.crm_playbook_sections enable row level security;
revoke all on public.crm_playbook_sections from public,anon,authenticated;
grant select,insert,update on public.crm_playbook_sections to service_role;

create function public.crm_seller_training_ready_v3(p_user uuid) returns boolean
language sql stable security invoker set search_path=public as $$
 select exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1')
 and (select count(*)=2 from crm_training_progress where user_id=p_user and version='20261027-v2' and lesson in ('introduction','portal') and completed_at is not null)
 and exists(select 1 from crm_training_reviews where user_id=p_user and version='20261028-v3');
$$;
create function public.crm_seller_training_record_v3(p_user uuid,p_lesson text,p_session uuid,p_position double precision,p_start boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if p_lesson='portal' and not exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1') then raise exception 'Sign your seller agreement before opening the playbook training.';end if;
 return crm_seller_training_record(p_user,p_lesson,p_session,p_position,p_start);
end $$;
create function public.crm_playbook_section_review(p_user uuid,p_section text,p_complete boolean default false)
returns boolean language plpgsql security invoker set search_path=public as $$
declare started timestamptz;
begin
 if not exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1') then raise exception 'Sign your seller agreement first.';end if;
 if p_section not in ('playbook-0','playbook-1','playbook-2','playbook-3','playbook-4','playbook-5','playbook-6','playbook-7','playbook-8','gift-card-facts') or p_section is null then raise exception 'Unknown playbook section.';end if;
 if not p_complete then
  insert into crm_playbook_sections(user_id,version,section) values(p_user,'20261028-v3',p_section) on conflict do nothing;
 else
  select started_at into started from crm_playbook_sections where user_id=p_user and version='20261028-v3' and section=p_section for update;
  if started is null or clock_timestamp()<started+interval '8 seconds' then raise exception 'Read this section before confirming your review.';end if;
  update crm_playbook_sections set completed_at=coalesce(completed_at,clock_timestamp()) where user_id=p_user and version='20261028-v3' and section=p_section;
 end if;
 return true;
end $$;
create function public.crm_seller_training_acknowledge_v3(p_user uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1') then raise exception 'Sign your seller agreement first.';end if;
 if (select count(*) from crm_training_progress where user_id=p_user and version='20261027-v2' and lesson in ('introduction','portal') and completed_at is not null)<>2 then raise exception 'Watch every playbook video before finishing training.';end if;
 if (select count(*) from crm_playbook_sections where user_id=p_user and version='20261028-v3' and completed_at is not null)<>10 then raise exception 'Read and confirm every playbook section before finishing training.';end if;
 insert into crm_training_reviews(user_id,version) values(p_user,'20261028-v3') on conflict do nothing;
 return true;
end $$;
revoke all on function public.crm_seller_training_ready_v3(uuid),public.crm_seller_training_record_v3(uuid,text,uuid,double precision,boolean),public.crm_playbook_section_review(uuid,text,boolean),public.crm_seller_training_acknowledge_v3(uuid) from public,anon,authenticated;
grant execute on function public.crm_seller_training_ready_v3(uuid),public.crm_seller_training_record_v3(uuid,text,uuid,double precision,boolean),public.crm_playbook_section_review(uuid,text,boolean),public.crm_seller_training_acknowledge_v3(uuid) to service_role;
