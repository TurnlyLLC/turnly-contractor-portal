alter table public.recruiting_applications add column hired_user_id uuid references public.profiles(id), add column hired_at timestamptz, add column deleted_at timestamptz;
alter table public.recruiting_applications drop constraint recruiting_applications_status_check;
alter table public.recruiting_applications add constraint recruiting_applications_status_check check(status in ('new','reviewing','contacted','interview','onboarding','waitlist','not_selected','withdrawn','hired'));
create table public.recruiting_hires (
 application_id uuid primary key references public.recruiting_applications(id),
 user_id uuid not null, encrypted_payload text, existing_account boolean not null,
 created_at timestamptz not null default now(), processing_at timestamptz,
 sent_at timestamptz, provider_id text, last_error text, attempts integer not null default 0
);
alter table public.recruiting_hires enable row level security;
revoke all on public.recruiting_hires from public,anon,authenticated;
grant select,insert,update on public.recruiting_hires to service_role;
create index recruiting_open_queue on public.recruiting_applications(role,created_at desc) where deleted_at is null and hired_at is null;
create function public.reserve_applicant_hire(p_id uuid,p_user uuid,p_payload text,p_existing boolean) returns public.recruiting_hires language plpgsql security invoker set search_path=public as $$
declare a recruiting_applications; h recruiting_hires;
begin
 select * into a from recruiting_applications where id=p_id for update;
 if not found or a.deleted_at is not null then raise exception 'Application unavailable'; end if;
 insert into recruiting_hires(application_id,user_id,encrypted_payload,existing_account) values(p_id,p_user,p_payload,p_existing) on conflict(application_id) do nothing;
 select * into h from recruiting_hires where application_id=p_id for update;
 if h.sent_at is not null then return h; end if;
 if h.processing_at>now()-interval '5 minutes' then raise exception 'Hiring is already processing. Please wait.'; end if;
 update recruiting_hires set processing_at=now(),attempts=attempts+1 where application_id=p_id returning * into h;
 return h;
end $$;
create function public.delete_applicant(p_id uuid,p_actor uuid) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from recruiting_applications where id=p_id for update;
 if exists(select 1 from recruiting_hires where application_id=p_id) then raise exception 'This application has a hiring record. Manage it from Hired or Directory.'; end if;
 update recruiting_applications set deleted_at=now(),reviewed_by=p_actor,review_note='Application deleted from applicant pool',version=version+1 where id=p_id and hired_at is null and deleted_at is null;
end $$;
revoke all on function public.reserve_applicant_hire(uuid,uuid,text,boolean),public.delete_applicant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_applicant_hire(uuid,uuid,text,boolean),public.delete_applicant(uuid,uuid) to service_role;
