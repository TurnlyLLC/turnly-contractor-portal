-- Activity is server-owned, session-bound and never supplied as accumulated seconds by clients.
create table public.crm_pay_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 mode text not null check(mode in ('commission','hourly')),
 commission_bps integer not null default 1000 check(commission_bps between 0 and 10000),
 hourly_cents integer not null default 0 check(hourly_cents between 0 and 100000),
 effective_at timestamptz not null default clock_timestamp(), changed_by uuid references public.profiles(id),
 check(mode<>'hourly' or hourly_cents>0)
);
create index crm_pay_plans_user_date on public.crm_pay_plans(user_id,effective_at desc);
insert into public.crm_pay_plans(user_id,mode,commission_bps)
 select id,'commission',1000 from public.profiles where role::text in ('admin','sales','sales_team');
create table public.crm_activity_sessions (
 session_id uuid primary key, user_id uuid not null references public.profiles(id),
 started_at timestamptz not null default clock_timestamp(), last_seen_at timestamptz not null default clock_timestamp(),
 last_activity_at timestamptz not null default clock_timestamp(), last_work_at timestamptz,
 ended_at timestamptz, end_reason text, check(ended_at is null or ended_at>=started_at)
);
create index crm_activity_sessions_user_date on public.crm_activity_sessions(user_id,started_at desc);
create table public.crm_work_intervals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 session_id uuid not null references public.crm_activity_sessions(session_id),
 started_at timestamptz not null, ended_at timestamptz not null, plan_id uuid references public.crm_pay_plans(id),
 check(ended_at>started_at)
);
create index crm_work_intervals_user_date on public.crm_work_intervals(user_id,ended_at desc);
do $$ declare t text; begin foreach t in array array['crm_pay_plans','crm_activity_sessions','crm_work_intervals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;

alter table public.crm_voice_calls add column dialed_at timestamptz,add column answered_at timestamptz,add column ended_at timestamptz;
-- Old calls keep their measured durations; timestamps cannot be reconstructed reliably.
create function public.crm_stamp_voice_times() returns trigger language plpgsql set search_path='' as $$
begin
 if new.parent_sid is not null and old.parent_sid is null then new.dialed_at:=clock_timestamp();end if;
 if new.status='in-progress' and new.answered_at is null then new.answered_at:=clock_timestamp();end if;
 if new.status in ('completed','busy','failed','no-answer','canceled') and new.ended_at is null then
  new.ended_at:=clock_timestamp();
  if new.duration_seconds>0 then new.answered_at:=new.ended_at-make_interval(secs=>new.duration_seconds);end if;
 end if;
 return new;
end $$;
create trigger crm_stamp_voice_times before update on public.crm_voice_calls for each row execute function public.crm_stamp_voice_times();
revoke all on function public.crm_stamp_voice_times() from public,anon,authenticated;

create function public.crm_activity_allowed(p_user uuid,p_session text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.crm_activity_sessions s where s.user_id=p_user and s.session_id::text=p_session
 and (s.ended_at is not null or (greatest(s.last_activity_at,coalesce((select max(c.ended_at) from public.crm_voice_calls c where c.user_id=p_user and c.session_id=s.session_id),s.last_activity_at))<=now()-interval '5 minutes' and not exists(
 select 1 from public.crm_voice_calls c where c.user_id=p_user and c.session_id=s.session_id and c.status in ('dialing','initiated','ringing','in-progress') and c.created_at>now()-interval '61 minutes'))));
$$;
revoke all on function public.crm_activity_allowed(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_activity_allowed(uuid,text) to service_role;

create function public.crm_track_activity(p_user uuid,p_session uuid,p_action text,p_active boolean default false,p_work boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.crm_activity_sessions; t timestamptz:=clock_timestamp(); a timestamptz; b timestamptz; plan public.crm_pay_plans; live_call boolean; call_end timestamptz;
begin
 if p_action not in ('start','heartbeat','logout') then raise exception 'Invalid activity action';end if;
 if not exists(select 1 from auth.sessions x join public.profiles p on p.id=x.user_id where x.id=p_session and x.user_id=p_user and p.status='active' and p.role::text in ('admin','sales','sales_team')) then return jsonb_build_object('expired',true);end if;
 if exists(select 1 from public.crm_user_access u where u.user_id=p_user and (not u.enabled or u.must_change_password or u.valid_after>(select created_at from auth.sessions where id=p_session))) then return jsonb_build_object('expired',true);end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,705));
 insert into public.crm_activity_sessions(session_id,user_id) values(p_session,p_user) on conflict do nothing;
 select * into s from public.crm_activity_sessions where session_id=p_session and user_id=p_user for update;
 if not found or s.ended_at is not null then return jsonb_build_object('expired',true);end if;
 select exists(select 1 from public.crm_voice_calls c where c.user_id=p_user and c.session_id=p_session and c.status in ('dialing','initiated','ringing','in-progress') and c.created_at>t-interval '61 minutes'),
 (select max(ended_at) from public.crm_voice_calls where user_id=p_user and session_id=p_session)
 into live_call,call_end;
 -- A real call is activity even if the browser is minimized or no keys are pressed.
 s.last_activity_at:=greatest(s.last_activity_at,coalesce(call_end,s.last_activity_at));
 if not live_call and s.last_activity_at<=t-interval '5 minutes' then
 update public.crm_activity_sessions set ended_at=greatest(started_at,s.last_activity_at+interval '5 minutes'),end_reason='inactive' where session_id=p_session;
 return jsonb_build_object('expired',true);
 end if;
 select * into plan from public.crm_pay_plans where user_id=p_user order by effective_at desc,id desc limit 1;
 -- Award only short, observed intervals. Offline/suspended browser gaps are not wages.
 -- The user lock and last interval endpoint prevent double-counting across tabs/devices.
 if s.last_work_at is not null and s.last_work_at>=s.last_seen_at-interval '5 seconds' and t-s.last_seen_at<=interval '45 seconds' then
  a:=greatest(s.last_seen_at,coalesce((select max(ended_at) from public.crm_work_intervals where user_id=p_user),s.last_seen_at),coalesce(plan.effective_at,s.last_seen_at));
  b:=least(t,s.last_activity_at+interval '5 minutes');
  if b>a then insert into public.crm_work_intervals(user_id,session_id,started_at,ended_at,plan_id) values(p_user,p_session,a,b,plan.id);end if;
 end if;
 update public.crm_activity_sessions set last_seen_at=t,last_activity_at=case when p_active or live_call then t else s.last_activity_at end,
 last_work_at=case when p_work then t else last_work_at end,
 ended_at=case when p_action='logout' then t else null end,end_reason=case when p_action='logout' then 'logout' else null end where session_id=p_session;
 return jsonb_build_object('expired',false,'started_at',s.started_at,'last_activity_at',case when p_active or live_call then t else s.last_activity_at end,'server_now',t,'in_call',live_call);
end $$;
revoke all on function public.crm_track_activity(uuid,uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.crm_track_activity(uuid,uuid,text,boolean,boolean) to service_role;

create function public.crm_set_pay_plan(p_admin uuid,p_user uuid,p_mode text,p_bps integer,p_hourly integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid; active_session record;
begin
 if not exists(select 1 from public.profiles where id=p_admin and role::text='admin' and status='active') then raise exception 'Administrator access required';end if;
 if not exists(select 1 from public.profiles where id=p_user and role::text in ('admin','sales','sales_team')) then raise exception 'Choose a sales member';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,705));
 for active_session in select session_id from public.crm_activity_sessions where user_id=p_user and ended_at is null loop
  perform public.crm_track_activity(p_user,active_session.session_id,'heartbeat',false,false);
 end loop;
 insert into public.crm_pay_plans(user_id,mode,commission_bps,hourly_cents,changed_by) values(p_user,p_mode,p_bps,p_hourly,p_admin) returning id into result;
 insert into public.crm_access_audit(actor_id,subject_id,action)values(p_admin,p_user,'pay_plan_changed:'||result::text);
 return result;
end $$;
revoke all on function public.crm_set_pay_plan(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.crm_set_pay_plan(uuid,uuid,text,integer,integer) to service_role;

-- Extend existing RLS and server gates; activity cannot revive an expired session.
create or replace function public.crm_access_state() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('active',coalesce(p.status='active' and p.role::text in ('admin','sales','sales_team') and coalesce(a.enabled,true),false),
 'must_change_password',coalesce(a.must_change_password,false),'username',a.username,
 'session_valid',exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and (a.user_id is null or s.created_at>=a.valid_after)) and public.crm_activity_allowed(p.id,auth.jwt()->>'session_id'))
 from public.profiles p left join public.crm_user_access a on a.user_id=p.id where p.id=auth.uid();
$$;
create or replace function public.crm_server_session_ready(p_user uuid,p_session text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id left join public.crm_user_access a on a.user_id=p.id where s.id::text=p_session and s.user_id=p_user and p.status='active' and p.role::text in ('admin','sales','sales_team') and coalesce(a.enabled,true) and not coalesce(a.must_change_password,false) and (a.user_id is null or s.created_at>=a.valid_after)) and public.crm_activity_allowed(p_user,p_session);
$$;

-- A prepared call may not bypass an expired session, including legacy admin logins.
create or replace function public.crm_consume_voice_call(p_id uuid,p_identity text,p_sid text)
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
 if not coalesce(crm_server_session_ready(v.user_id,v.session_id::text),false) then return null; end if;
 if not exists(select 1 from sales_leads where id=v.lead_id and business_segment='residential' and not coalesce(do_not_contact,false) and (v_admin or sales_owner_id=v.user_id)) then return null; end if;
 update crm_voice_calls set status='dialing',parent_sid=p_sid where id=v.id;
 return to_jsonb(v)||jsonb_build_object('is_admin',v_admin);
end $$;