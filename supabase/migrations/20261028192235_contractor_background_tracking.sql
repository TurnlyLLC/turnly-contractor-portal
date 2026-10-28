create table public.contractor_background_checks (
 profile_id uuid primary key references public.profiles(id), item_id text not null,
 status text not null check(status in ('needs_invitation','invited','in_progress','awaiting_review','approved','on_hold')),
 reference text not null default '', contractor_note text not null default '',
 version integer not null default 1, sync_state text not null default 'pending' check(sync_state in ('pending','synced')),
 operation_id uuid not null, updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
 invited_at timestamptz, approved_at timestamptz, approved_by uuid references public.profiles(id)
);
create table public.contractor_background_history (
 id bigint generated always as identity primary key, profile_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id), status text not null, reference text not null,
 contractor_note text not null, operation_id uuid not null unique, created_at timestamptz not null default now()
);
alter table public.contractor_background_checks enable row level security;
alter table public.contractor_background_history enable row level security;
revoke all on public.contractor_background_checks,public.contractor_background_history from public,anon,authenticated;
grant select on public.contractor_background_checks,public.contractor_background_history to service_role;

create function public.begin_contractor_background_review(p_actor uuid,p_profile uuid,p_item text,p_status text,p_reference text,p_note text,p_version integer,p_confirm boolean)
returns public.contractor_background_checks language plpgsql security definer set search_path=public as $$
declare r public.contractor_background_checks; op uuid:=gen_random_uuid();
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin access required.'; end if;
 perform 1 from profiles where id=p_profile and role::text='contractor' and status not in ('deleted','deletion_pending','disabled','suspended','inactive','deactivated','rejected') for update;
 if not found then raise exception 'Active contractor account required.'; end if;
 select * into r from contractor_background_checks where profile_id=p_profile for update;
 if coalesce(r.version,0)<>p_version then raise exception 'This review changed. Reload before saving.'; end if;
 if r.sync_state='pending' and r.updated_at>now()-interval '2 minutes' then raise exception 'A checklist update is still processing. Refresh in two minutes before retrying.'; end if;
 if p_status not in ('needs_invitation','invited','in_progress','awaiting_review','approved','on_hold') or length(p_item)>120 or length(p_reference)>120 or length(p_note)>180 then raise exception 'Invalid background review.'; end if;
 if p_status='approved' and (not coalesce(p_confirm,false) or length(trim(p_reference))<1) then raise exception 'Record the report reference and confirm your review before approval.'; end if;
 insert into contractor_background_checks(profile_id,item_id,status,reference,contractor_note,version,sync_state,operation_id,updated_by,invited_at)
 values(p_profile,p_item,p_status,p_reference,p_note,1,'pending',op,p_actor,case when p_status='invited' then now() end)
 on conflict(profile_id) do update set item_id=p_item,status=p_status,reference=p_reference,contractor_note=p_note,version=contractor_background_checks.version+1,sync_state='pending',operation_id=op,updated_by=p_actor,updated_at=now(),approved_at=null,approved_by=null,invited_at=case when p_status='invited' then now() else contractor_background_checks.invited_at end
 returning * into r;
 -- Pause acceptance before touching the remote app; failures cannot grant access.
 update profiles set contractor_approved=false,background_check_status=p_status,background_check_completed_at=null where id=p_profile;
 insert into contractor_background_history(profile_id,actor_id,status,reference,contractor_note,operation_id) values(p_profile,p_actor,p_status,p_reference,p_note,op);
 return r;
end;$$;
create function public.finish_contractor_background_review(p_profile uuid,p_operation uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.contractor_background_checks;
begin
 update contractor_background_checks set sync_state='synced',approved_at=case when status='approved' then now() end,approved_by=case when status='approved' then updated_by end where profile_id=p_profile and operation_id=p_operation returning * into r;
 if not found then raise exception 'This review changed. Reload before retrying.'; end if;
 update profiles set background_check_status=r.status,background_check_completed_at=r.approved_at where id=p_profile;
end;$$;
revoke all on function public.begin_contractor_background_review(uuid,uuid,text,text,text,text,integer,boolean),public.finish_contractor_background_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_contractor_background_review(uuid,uuid,text,text,text,text,integer,boolean),public.finish_contractor_background_review(uuid,uuid) to service_role;

create function turnly_private.guard_background_check_claim() returns trigger language plpgsql security definer set search_path=public as $$
declare candidate uuid;
begin
 candidate:=coalesce(new.claimed_by,new.assigned_to);
 if candidate is null then return new; end if;
 if TG_OP='UPDATE' then
   if new.claimed_by is not distinct from old.claimed_by and not(old.status in ('open','preferred_pending','pending') and new.status in ('claimed','scheduled','in_progress')) then return new; end if;
 elsif new.status not in ('claimed','scheduled','in_progress') then return new;
 end if;
 if exists(select 1 from contractor_background_checks where profile_id=candidate and (status<>'approved' or sync_state<>'synced')) then raise exception 'Your background check is awaiting Turnly approval. Complete onboarding before accepting jobs.'; end if;
 return new;
end;$$;
revoke all on function turnly_private.guard_background_check_claim() from public,anon,authenticated;
create trigger guard_background_check_claim before insert or update on public.assignment_blocks for each row execute function turnly_private.guard_background_check_claim();
