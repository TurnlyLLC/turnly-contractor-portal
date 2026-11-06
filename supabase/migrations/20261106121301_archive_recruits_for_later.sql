alter table public.recruiting_applications add column archived_at timestamptz;
create function public.archive_recruit(p_id uuid,p_actor uuid,p_archive boolean,p_version integer) returns void
language plpgsql security invoker set search_path='' as $$
declare a public.recruiting_applications;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin access required';end if;
 select * into a from public.recruiting_applications where id=p_id for update;
 if not found or a.deleted_at is not null or a.hired_at is not null then raise exception 'Choose an unhired applicant';end if;
 if a.version<>p_version then raise exception 'Application changed. Refresh before trying again';end if;
 if p_archive and exists(select 1 from public.recruiting_hires where application_id=p_id) then raise exception 'Hiring has already started. Resolve hiring before archiving';end if;
 if (p_archive and a.archived_at is not null) or (not p_archive and a.archived_at is null) then return;end if;
 update public.recruiting_applications set archived_at=case when p_archive then now() else null end,version=version+1,updated_at=now(),reviewed_by=p_actor,review_note=case when p_archive then 'Archived for later. Previous application stage preserved.' else 'Restored to active recruits at previous application stage.' end where id=p_id;
end $$;
revoke all on function public.archive_recruit(uuid,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.archive_recruit(uuid,uuid,boolean,integer) to service_role;
create or replace function public.reserve_applicant_hire(p_id uuid,p_user uuid,p_payload text,p_existing boolean)
returns public.recruiting_hires language plpgsql set search_path='' as $$
declare a public.recruiting_applications; h public.recruiting_hires;
begin
 select * into a from public.recruiting_applications where id=p_id for update;
 if not found or a.deleted_at is not null then raise exception 'Application unavailable';end if;
 if a.archived_at is not null then raise exception 'Restore this recruit to the active pool before hiring';end if;
 insert into public.recruiting_hires(application_id,user_id,encrypted_payload,existing_account) values(p_id,p_user,p_payload,p_existing) on conflict(application_id) do nothing;
 select * into h from public.recruiting_hires where application_id=p_id for update;
 if h.sent_at is not null then return h;end if;
 if h.processing_at>now()-interval '5 minutes' then raise exception 'Hiring is already processing. Please wait.';end if;
 update public.recruiting_hires set processing_at=now(),attempts=attempts+1 where application_id=p_id returning * into h;
 return h;
end $$;
