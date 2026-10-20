create table public.crm_voice_calls (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 lead_id uuid not null references public.sales_leads(id), session_id uuid not null,
 phone text not null, status text not null default 'prepared', created_at timestamptz not null default now(),
 parent_sid text unique, call_sid text unique, sequence integer not null default -1,
 duration_seconds integer not null default 0 check(duration_seconds>=0)
);
alter table public.crm_voice_calls enable row level security;
revoke all on public.crm_voice_calls from anon,authenticated;
grant all on public.crm_voice_calls to service_role;
create index crm_voice_calls_lead_date on public.crm_voice_calls(lead_id,created_at desc);
create index crm_voice_calls_user_date on public.crm_voice_calls(user_id,created_at desc);

create function public.crm_prepare_voice_call(p_user uuid,p_lead uuid,p_session uuid,p_number text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,123));
 if (select count(*) from crm_voice_calls where user_id=p_user and created_at>now()-interval '1 minute')>=6 then
  raise exception 'Please wait before placing another call.';
 end if;
 if exists(select 1 from crm_voice_calls where user_id=p_user and status in ('dialing','initiated','ringing','in-progress') and created_at>now()-interval '61 minutes') then
  raise exception 'Finish the current call first.';
 end if;
 insert into crm_voice_calls(user_id,lead_id,session_id,phone) values(p_user,p_lead,p_session,p_number) returning id into v_id;
 return v_id;
end $$;

create function public.crm_consume_voice_call(p_id uuid,p_identity text,p_sid text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v crm_voice_calls; v_admin boolean;
begin
 select * into v from crm_voice_calls where id=p_id;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(v.user_id::text,123));
 select * into v from crm_voice_calls where id=p_id for update;
 if not found or v.status<>'prepared' or v.created_at<now()-interval '2 minutes' or p_identity<>'client:sales_'||v.user_id::text then return null; end if;
 select role='admin' into v_admin from profiles where id=v.user_id and status='active' and role in ('admin','sales','sales_team');
 if not found then return null; end if;
 if exists(select 1 from crm_voice_calls where user_id=v.user_id and id<>v.id and status in ('dialing','initiated','ringing','in-progress') and created_at>now()-interval '61 minutes') then return null; end if;
 if exists(select 1 from crm_user_access where user_id=v.user_id and (not enabled or must_change_password)) then return null; end if;
 if exists(select 1 from crm_user_access where user_id=v.user_id) and not coalesce(crm_server_session_ready(v.user_id,v.session_id),false) then return null; end if;
 if not exists(select 1 from sales_leads where id=v.lead_id and business_segment='residential' and not coalesce(do_not_contact,false) and (v_admin or sales_owner_id=v.user_id)) then return null; end if;
 update crm_voice_calls set status='dialing',parent_sid=p_sid where id=v.id;
 return to_jsonb(v)||jsonb_build_object('is_admin',v_admin);
end $$;

create function public.crm_voice_status(p_parent text,p_sid text,p_status text,p_sequence integer,p_duration integer)
returns void language plpgsql security invoker set search_path=public as $$
declare v crm_voice_calls;
begin
 if p_status not in ('initiated','ringing','in-progress','completed','busy','failed','no-answer','canceled') then return; end if;
 update crm_voice_calls set call_sid=p_sid,status=p_status,sequence=p_sequence,duration_seconds=p_duration
 where parent_sid=p_parent and (call_sid is null or call_sid=p_sid) and sequence<p_sequence returning * into v;
 if found then
  insert into sales_activities(id,lead_id,user_id,user_name,activity_type,activity_text,metadata)
  values(v.id,v.lead_id,v.user_id,(select full_name from profiles where id=v.user_id),'call',
   'Portal call · '||p_status||' · '||p_duration||' seconds',jsonb_build_object('voice_call_id',v.id,'call_sid',p_sid,'duration_seconds',p_duration))
  on conflict(id) do update set activity_text=excluded.activity_text,metadata=excluded.metadata;
 end if;
end $$;
revoke all on function public.crm_prepare_voice_call(uuid,uuid,uuid,text),public.crm_consume_voice_call(uuid,text,text),public.crm_voice_status(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.crm_prepare_voice_call(uuid,uuid,uuid,text),public.crm_consume_voice_call(uuid,text,text),public.crm_voice_status(text,text,text,integer,integer) to service_role;
