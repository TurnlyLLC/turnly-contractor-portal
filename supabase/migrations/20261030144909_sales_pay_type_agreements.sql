alter table public.crm_pay_plans add column hourly_policy text not null default 'active' check(hourly_policy in ('active','qualified_logged')),
 add column dials_per_hour integer not null default 30 check(dials_per_hour between 1 and 120),
 add column min_answered_seconds integer not null default 30 check(min_answered_seconds between 0 and 300),
 add column payment_terms text not null default 'After admin approval, with no fixed schedule, subject to mandatory payment deadlines.' check(length(payment_terms) between 10 and 2000);
alter table public.crm_voice_calls add column answered_by text check(answered_by in ('human','machine_start','machine_end_beep','machine_end_silence','machine_end_other','fax','unknown'));
create index crm_voice_calls_user_dialed on public.crm_voice_calls(user_id,dialed_at);
-- Future-only terms: historical pay-plan rows and approved payments remain unchanged.
insert into public.crm_pay_plans(user_id,mode,commission_bps,hourly_cents,hourly_policy)
 select user_id,mode,commission_bps,hourly_cents,'qualified_logged' from (select distinct on(user_id) * from public.crm_pay_plans order by user_id,effective_at desc,id desc) p where mode='hourly';
create function public.crm_current_agreement_version(p_user uuid) returns text language sql stable security invoker set search_path='' as $$
 select '20261030-pay-'||coalesce((select id::text from public.crm_pay_plans where user_id=p_user order by effective_at desc,id desc limit 1),'default-commission');$$;
create function public.crm_current_agreement_signed(p_user uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.crm_seller_agreements where user_id=p_user and version=public.crm_current_agreement_version(p_user));$$;
create function public.crm_sign_pay_agreement(p_user uuid,p_version text,p_hash text,p_text text,p_name text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,705));
 if p_version<>public.crm_current_agreement_version(p_user) then raise exception 'Pay terms changed. Reload and review the current agreement';end if;
 insert into public.crm_seller_agreements(user_id,version,agreement_hash,agreement_text,signer_name,consent_text)
 values(p_user,p_version,p_hash,p_text,p_name,'I have read and agree to this agreement and intend my typed full legal name as my electronic signature.') on conflict do nothing;
 return true;
end $$;
-- Replace all current training gates with the current pay-plan agreement check.
do $$ declare r record; definition text; begin
 for r in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('crm_seller_training_ready','crm_seller_training_ready_v3','crm_seller_training_record_v3','crm_seller_training_record_v4','crm_playbook_section_review','crm_seller_training_acknowledge_v3','crm_seller_training_acknowledge_v4') loop
 definition:=pg_get_functiondef(r.oid);
 definition:=replace(definition,'exists(select 1 from crm_seller_agreements where user_id=p_user and version=''20261027-v1'')','public.crm_current_agreement_signed(p_user)');
 execute definition;
 end loop;
end $$;
create function public.crm_set_pay_plan_v2(p_admin uuid,p_user uuid,p_mode text,p_bps integer,p_hourly integer,p_dials integer,p_average integer,p_terms text) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;begin
 if p_dials not between 1 and 120 or p_average not between 0 and 300 or length(trim(p_terms)) not between 10 and 2000 then raise exception 'Check the quota and payment terms';end if;
 result:=public.crm_set_pay_plan(p_admin,p_user,p_mode,p_bps,p_hourly);
 update public.crm_pay_plans set hourly_policy='qualified_logged',dials_per_hour=p_dials,min_answered_seconds=p_average,payment_terms=trim(p_terms) where id=result;
 return result;
end $$;
-- Each UTC clock hour is evaluated across sessions; overlapping logins never multiply hours.
create function public.crm_hourly_windows(p_user uuid,p_from timestamptz,p_to timestamptz)
returns table(window_start timestamptz,window_end timestamptz,plan_id uuid,logged_seconds numeric,dials bigint,human_answers bigint,average_seconds numeric,target_dials numeric,qualifies boolean,hourly_cents integer)
language sql stable security invoker set search_path='' as $$
 with plans as(select *,lead(effective_at,1,'infinity'::timestamptz) over(order by effective_at,id) until from public.crm_pay_plans where user_id=p_user),
 sessions as(select started_at a,least(coalesce(ended_at,greatest(last_activity_at,coalesce((select max(c.ended_at) from public.crm_voice_calls c where c.user_id=p_user and c.session_id=s.session_id),last_activity_at))+interval '5 minutes'),now()) b from public.crm_activity_sessions s where user_id=p_user and started_at<p_to),
 spans as(select unnest(range_agg(tstzrange(a,b,'[)'))) r from sessions where b>a),
 windows as(select p.id,p.hourly_cents,p.dials_per_hour,p.min_answered_seconds,greatest(h,p.effective_at,p_from) a,least(h+interval '1 hour',p.until,p_to,now()) b
 from plans p cross join lateral generate_series(date_trunc('hour',greatest(p.effective_at,p_from),'UTC'),least(p.until,p_to,now()),interval '1 hour') h where p.mode='hourly' and p.hourly_policy='qualified_logged'),
 amounts as(select w.*,coalesce((select sum(extract(epoch from least(upper(r),w.b)-greatest(lower(r),w.a))) from spans where upper(r)>w.a and lower(r)<w.b),0) secs,
 (select count(*) from public.crm_voice_calls c where c.user_id=p_user and c.call_sid is not null and c.dialed_at>=w.a and c.dialed_at<w.b) dial_count,
 (select count(*) from public.crm_voice_calls c where c.user_id=p_user and c.call_sid is not null and c.dialed_at>=w.a and c.dialed_at<w.b and c.status='completed' and c.answered_by='human' and c.duration_seconds>0) humans,
 (select avg(c.duration_seconds) from public.crm_voice_calls c where c.user_id=p_user and c.call_sid is not null and c.dialed_at>=w.a and c.dialed_at<w.b and c.status='completed' and c.answered_by='human' and c.duration_seconds>0) avg_seconds
 from windows w where b>a)
 select a,b,id,secs,dial_count,humans,avg_seconds,ceil(secs*dials_per_hour/3600),
 secs>0 and dial_count>=ceil(secs*dials_per_hour/3600) and humans>0 and avg_seconds>=min_answered_seconds and b<=date_trunc('hour',now(),'UTC'),hourly_cents from amounts where secs>0;
$$;
create or replace function public.crm_hourly_quote(p_user uuid,p_from timestamptz,p_to timestamptz)
returns table(hours_seconds numeric,amount_cents bigint) language sql stable security invoker set search_path='' as $$
 with raw as (
 select started_at a,ended_at b from public.crm_work_intervals where user_id=p_user and ended_at>p_from and started_at<p_to
 union all
 select answered_at,case when ended_at is not null then answered_at+make_interval(secs=>duration_seconds) else least(now(),created_at+interval '61 minutes') end
 from public.crm_voice_calls where user_id=p_user and answered_at is not null and dialed_at is not null and answered_at<p_to
 ), clipped as(select greatest(a,p_from) a,least(b,p_to,now()) b from raw),
 merged as(select range_agg(tstzrange(a,b,'[)')) ranges from clipped where b>a),
 spans as(select unnest(ranges) r from merged),
 plans as(select mode,hourly_policy,hourly_cents,effective_at a,lead(effective_at,1,'infinity'::timestamptz) over(order by effective_at,id) b from public.crm_pay_plans where user_id=p_user),
 pieces as(select hourly_cents,extract(epoch from least(upper(r),b)-greatest(lower(r),a)) secs from spans cross join plans where mode='hourly' and hourly_policy='active' and upper(r)>a and lower(r)<b)
 select coalesce(sum(secs),0),coalesce(round(sum(secs*hourly_cents/3600)),0)::bigint from (select * from pieces union all select hourly_cents,logged_seconds from public.crm_hourly_windows(p_user,p_from,p_to) where qualifies) payable;
$$;


-- Give the running session clock an authoritative pay mode.
do $$ declare d text;begin d:=pg_get_functiondef('public.crm_track_activity(uuid,uuid,text,boolean,boolean)'::regprocedure);d:=replace(d,$old$'in_call',live_call$old$,$new$'in_call',live_call,'pay_mode',coalesce(plan.mode,'commission')$new$);execute d;end $$;
alter table public.crm_voice_calls add column amd_requested boolean not null default false;
-- Reserve/settle a conservative extra cent for AMD without raising spending limits.
do $$ declare d text;begin
 d:=pg_get_functiondef('public.communication_reserve(text,uuid,text,text,integer)'::regprocedure);
 d:=replace(d,'cost:=(s.max_call_minutes+2)*s.voice_cents_per_minute','cost:=(s.max_call_minutes+2)*s.voice_cents_per_minute+1');execute d;
 d:=pg_get_functiondef('public.communication_settle(text,integer,text,boolean)'::regprocedure);
 d:=replace(d,'greatest(0,p_units)*rate_cents','greatest(0,p_units)*rate_cents+case when channel=''call'' then 1 else 0 end');execute d;
end $$;
revoke all on function public.crm_current_agreement_version(uuid),public.crm_current_agreement_signed(uuid),public.crm_sign_pay_agreement(uuid,text,text,text,text),public.crm_set_pay_plan_v2(uuid,uuid,text,integer,integer,integer,integer,text),public.crm_hourly_windows(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_current_agreement_version(uuid),public.crm_current_agreement_signed(uuid),public.crm_sign_pay_agreement(uuid,text,text,text,text),public.crm_set_pay_plan_v2(uuid,uuid,text,integer,integer,integer,integer,text),public.crm_hourly_windows(uuid,timestamptz,timestamptz) to service_role;
