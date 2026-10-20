create table public.communication_settings (
 id boolean primary key default true check(id), daily_cents integer not null default 1000 check(daily_cents between 0 and 10000000),
 monthly_cents integer not null default 10000 check(monthly_cents between 0 and 100000000),
 paused boolean not null default false, calls_paused boolean not null default false, texts_paused boolean not null default false,
 max_call_minutes integer not null default 20 check(max_call_minutes between 1 and 60),
 default_rep_daily_cents integer not null default 1000 check(default_rep_daily_cents>=0),
 default_rep_monthly_cents integer not null default 10000 check(default_rep_monthly_cents>=0),
 voice_cents_per_minute integer not null default 5 check(voice_cents_per_minute between 5 and 100),
 sms_cents_per_segment integer not null default 5 check(sms_cents_per_segment between 5 and 100),
 updated_at timestamptz not null default now()
);
insert into public.communication_settings(id) values(true);
create table public.communication_rep_limits(user_id uuid primary key references profiles(id),daily_cents integer not null check(daily_cents>=0),monthly_cents integer not null check(monthly_cents>=0),paused boolean not null default false);
create table public.communication_usage(
 id text primary key, user_id uuid references profiles(id), channel text not null check(channel in ('call','sms')),source text not null,
 created_at timestamptz not null default now(), finished_at timestamptz,
 state text not null default 'reserved' check(state in ('reserved','settled','released')),
 reserved_cents integer not null check(reserved_cents>=0), charged_cents integer not null default 0 check(charged_cents>=0),
 units integer not null default 0, max_seconds integer, rate_cents integer not null,
 provider_id text, parent_sid text, provider_status text, actual_cents numeric, actual_checked_at timestamptz
);
create index communication_usage_date on public.communication_usage(created_at);
create index communication_usage_pending on public.communication_usage(state,created_at) where state='reserved';
create table public.communication_provider_usage(id boolean primary key default true check(id),day date,month date,daily_cents numeric not null default 0,monthly_cents numeric not null default 0,balance numeric,synced_at timestamptz,error text);
insert into public.communication_provider_usage(id) values(true);
create table public.communication_audit(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id),created_at timestamptz not null default now(),details jsonb not null);
do $$declare t text;begin foreach t in array array['communication_settings','communication_rep_limits','communication_usage','communication_provider_usage','communication_audit'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end$$;

-- UTC periods match Twilio usage reporting. Outstanding reservations count in every period until resolved.
create function public.communication_totals(p_user uuid default null) returns jsonb language sql stable security invoker set search_path=public as $$
 with x as(select coalesce(sum(reserved_cents) filter(where state='reserved'),0) held,
 coalesce(sum(charged_cents) filter(where state='settled' and (created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' or finished_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')),0) d,
 coalesce(sum(charged_cents) filter(where state='settled' and (created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' or finished_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')),0) m
 from communication_usage where p_user is null or user_id=p_user), p as(select * from communication_provider_usage where id)
 select jsonb_build_object('held_cents',held,'daily_cents',held+greatest(d,case when p_user is null and p.day=(now() at time zone 'UTC')::date then p.daily_cents else 0 end),
 'monthly_cents',held+greatest(m,case when p_user is null and p.month=date_trunc('month',now() at time zone 'UTC')::date then p.monthly_cents else 0 end)) from x cross join p;
$$;
create function public.communication_alerts() returns void language plpgsql security invoker set search_path=public as $$
declare s communication_settings; t jsonb; percent integer; period text; used numeric; lim integer; period_key text;
begin
 select * into s from communication_settings where id; t:=communication_totals();
 foreach period in array array['daily','monthly'] loop
 used:=(t->>(period||'_cents'))::numeric;lim:=case when period='daily' then s.daily_cents else s.monthly_cents end;
 period_key:=case when period='daily' then to_char(now() at time zone 'UTC','YYYY-MM-DD') else to_char(now() at time zone 'UTC','YYYY-MM') end;
 foreach percent in array array[50,80,100] loop
 if used>=lim*percent/100.0 then
 insert into crm_notifications(dedupe_key,recipient_id,kind,title) values('communications:'||period||':'||period_key||':'||percent,null,'communications_budget',
 'Calling & texting: '||percent||'% of '||period||' budget used or reserved. Open Calling & texting to review.') on conflict(dedupe_key) do nothing;
 end if;end loop;end loop;
end$$;
create function public.communication_reserve(p_id text,p_user uuid,p_channel text,p_source text,p_units integer default 1) returns jsonb language plpgsql security invoker set search_path=public as $$
declare s communication_settings;r communication_rep_limits;t jsonb;u jsonb;cost integer;secs integer;
begin
 perform pg_advisory_xact_lock(87105020);
 if exists(select 1 from communication_usage where id=p_id) then raise exception 'This communication has already been submitted. Check its status before retrying.';end if;
 select * into s from communication_settings where id;
 if s.paused or (p_channel='call' and s.calls_paused) or (p_channel='sms' and s.texts_paused) then raise exception 'Calling or texting is paused by your administrator.';end if;
 if p_channel not in ('call','sms') or p_units not between 1 and 100 then raise exception 'Invalid communication.';end if;
 if p_channel='call' then secs:=s.max_call_minutes*60;cost:=(s.max_call_minutes+2)*s.voice_cents_per_minute;else cost:=p_units*s.sms_cents_per_segment;end if;
 t:=communication_totals();
 if (t->>'daily_cents')::numeric+cost>s.daily_cents or (t->>'monthly_cents')::numeric+cost>s.monthly_cents then raise exception 'Combined calling and texting budget reached. Ask an administrator to review the limits.';end if;
 if p_user is not null then
 select * into r from communication_rep_limits where user_id=p_user;u:=communication_totals(p_user);
 if coalesce(r.paused,false) or (u->>'daily_cents')::numeric+cost>coalesce(r.daily_cents,s.default_rep_daily_cents) or (u->>'monthly_cents')::numeric+cost>coalesce(r.monthly_cents,s.default_rep_monthly_cents) then raise exception 'Your calling and texting allowance has been reached or paused. Ask your administrator.';end if;
 end if;
 insert into communication_usage(id,user_id,channel,source,reserved_cents,units,max_seconds,rate_cents) values(p_id,p_user,p_channel,p_source,cost,p_units,secs,case when p_channel='call' then s.voice_cents_per_minute else s.sms_cents_per_segment end);
 perform communication_alerts();return jsonb_build_object('max_seconds',secs,'reserved_cents',cost);
end$$;
create function public.communication_settle(p_id text,p_units integer,p_status text,p_release boolean default false) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(87105020);
 update communication_usage set state=case when p_release then 'released' else 'settled' end,finished_at=now(),units=greatest(0,p_units),provider_status=p_status,
 charged_cents=case when p_release then 0 else greatest(charged_cents,greatest(0,p_units)*rate_cents) end where id=p_id and state='reserved';
 perform communication_alerts();
end$$;
create function public.communication_save_settings(p_user uuid,p_settings jsonb,p_rep uuid default null) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(87105020);
 if not exists(select 1 from profiles where id=p_user and role='admin' and status='active') then raise exception 'Administrator required';end if;
 if p_rep is null then
 update communication_settings set daily_cents=(p_settings->>'daily_cents')::integer,monthly_cents=(p_settings->>'monthly_cents')::integer,
 paused=(p_settings->>'paused')::boolean,calls_paused=(p_settings->>'calls_paused')::boolean,texts_paused=(p_settings->>'texts_paused')::boolean,
 max_call_minutes=(p_settings->>'max_call_minutes')::integer,default_rep_daily_cents=(p_settings->>'default_rep_daily_cents')::integer,
 default_rep_monthly_cents=(p_settings->>'default_rep_monthly_cents')::integer,voice_cents_per_minute=(p_settings->>'voice_cents_per_minute')::integer,
 sms_cents_per_segment=(p_settings->>'sms_cents_per_segment')::integer,updated_at=now() where id;
 else
 if not exists(select 1 from profiles where id=p_rep and role in ('admin','sales','sales_team')) then raise exception 'Choose a sales member';end if;
 insert into communication_rep_limits(user_id,daily_cents,monthly_cents,paused) values(p_rep,(p_settings->>'daily_cents')::integer,(p_settings->>'monthly_cents')::integer,(p_settings->>'paused')::boolean)
 on conflict(user_id)do update set daily_cents=excluded.daily_cents,monthly_cents=excluded.monthly_cents,paused=excluded.paused;
 end if;
 insert into communication_audit(user_id,details) values(p_user,jsonb_build_object('rep',p_rep,'settings',p_settings));perform communication_alerts();
end$$;
revoke all on function public.communication_totals(uuid),public.communication_alerts(),public.communication_reserve(text,uuid,text,text,integer),public.communication_settle(text,integer,text,boolean),public.communication_save_settings(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.communication_totals(uuid),public.communication_alerts(),public.communication_reserve(text,uuid,text,text,integer),public.communication_settle(text,integer,text,boolean),public.communication_save_settings(uuid,jsonb,uuid) to service_role;

create or replace function public.crm_consume_voice_call(p_id uuid,p_identity text,p_sid text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v crm_voice_calls; v_admin boolean;
begin
 perform pg_advisory_xact_lock(87105020);
 if not exists(select 1 from communication_usage where id=p_id::text and state='reserved') then return null;end if;
 if exists(select 1 from communication_settings where paused or calls_paused) then return null;end if;
 select * into v from crm_voice_calls where id=p_id;
 if not found then return null; end if;
 if exists(select 1 from communication_rep_limits where user_id=v.user_id and paused) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(v.user_id::text,123));
 select * into v from crm_voice_calls where id=p_id for update;
 if not found or v.status<>'prepared' or v.created_at<now()-interval '2 minutes' or p_identity<>'client:sales_'||v.user_id::text then return null; end if;
 select role='admin' into v_admin from profiles where id=v.user_id and status='active' and role in ('admin','sales','sales_team');
 if not found then return null; end if;
 if exists(select 1 from crm_voice_calls where user_id=v.user_id and id<>v.id and status in ('dialing','initiated','ringing','in-progress') and created_at>now()-interval '61 minutes') then return null; end if;
 if exists(select 1 from crm_user_access where user_id=v.user_id and (not enabled or must_change_password)) then return null; end if;
 if exists(select 1 from crm_user_access where user_id=v.user_id) and not coalesce(crm_server_session_ready(v.user_id,v.session_id::text),false) then return null; end if;
 if not exists(select 1 from sales_leads where id=v.lead_id and business_segment='residential' and not coalesce(do_not_contact,false) and (v_admin or sales_owner_id=v.user_id)) then return null; end if;
 update crm_voice_calls set status='dialing',parent_sid=p_sid where id=v.id;
 return to_jsonb(v)||jsonb_build_object('is_admin',v_admin);
end $$;

create function public.communication_expire_call(p_id text) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(87105020);
 if exists(select 1 from crm_voice_calls where id::text=p_id and parent_sid is null and status='prepared' and created_at<now()-interval '3 minutes') then
 perform communication_settle(p_id,0,'not_connected',true);
 end if;
end$$;
revoke all on function public.communication_expire_call(text) from public,anon,authenticated;
grant execute on function public.communication_expire_call(text) to service_role;
