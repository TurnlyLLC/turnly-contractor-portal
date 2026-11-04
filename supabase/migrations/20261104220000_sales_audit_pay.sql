create or replace function public.crm_hourly_windows(p_user uuid,p_from timestamptz,p_to timestamptz)
returns table(window_start timestamptz,window_end timestamptz,plan_id uuid,logged_seconds numeric,dials bigint,human_answers bigint,average_seconds numeric,target_dials numeric,qualifies boolean,hourly_cents integer)
language sql stable security invoker set search_path='' as $$
 with plans as(select *,lead(effective_at,1,'infinity'::timestamptz) over(order by effective_at,id) until from public.crm_pay_plans where user_id=p_user),
 sessions as(select started_at a,least(coalesce(ended_at,greatest(last_activity_at,coalesce((select max(c.ended_at) from public.crm_voice_calls c where c.user_id=p_user and c.session_id=s.session_id),last_activity_at))+interval '5 minutes'),now()) b from public.crm_activity_sessions s where user_id=p_user and started_at<date_trunc('hour',p_to,'UTC')+interval '1 hour'),
 spans as(select unnest(range_agg(tstzrange(a,b,'[)'))) r from sessions where b>a),
 windows as(select p.id,p.hourly_cents,p.dials_per_hour,p.min_answered_seconds,greatest(h,p.effective_at) a,least(h+interval '1 hour',p.until,now()) b
 from plans p cross join lateral generate_series(date_trunc('hour',greatest(p.effective_at,p_from),'UTC'),least(p.until,p_to,now()),interval '1 hour') h where p.mode='hourly' and p.hourly_policy='qualified_logged'),
 amounts as(select w.*,coalesce((select sum(extract(epoch from least(upper(r),w.b)-greatest(lower(r),w.a))) from spans where upper(r)>w.a and lower(r)<w.b),0) secs,
 coalesce((select sum(extract(epoch from least(upper(r),w.b,p_to)-greatest(lower(r),w.a,p_from))) from spans where upper(r)>greatest(w.a,p_from) and lower(r)<least(w.b,p_to)),0) portion,
 (select count(*) from public.crm_voice_calls c where c.user_id=p_user and c.call_sid is not null and c.dialed_at>=w.a and c.dialed_at<w.b) dial_count,
 (select count(*) from public.crm_voice_calls c where c.user_id=p_user and c.call_sid is not null and c.dialed_at>=w.a and c.dialed_at<w.b and c.status='completed' and c.answered_by='human' and c.duration_seconds>0) humans,
 (select avg(c.duration_seconds) from public.crm_voice_calls c where c.user_id=p_user and c.call_sid is not null and c.dialed_at>=w.a and c.dialed_at<w.b and c.status='completed' and c.answered_by='human' and c.duration_seconds>0) avg_seconds
 from windows w where least(b,p_to)>greatest(a,p_from))
 select a,b,id,portion,dial_count,humans,avg_seconds,ceil(secs*dials_per_hour/3600),
 secs>0 and dial_count>=ceil(secs*dials_per_hour/3600) and (min_answered_seconds=0 or (humans>0 and avg_seconds>=min_answered_seconds)) and b<=date_trunc('hour',now(),'UTC'),hourly_cents from amounts where portion>0;
$$;

create function public.crm_hourly_report_batch(p_users uuid[],p_from timestamptz,p_to timestamptz) returns table(user_id uuid,hours_seconds numeric,amount_cents bigint,windows jsonb) language sql stable security invoker set search_path='' as $$ select u,q.hours_seconds,q.amount_cents,coalesce((select jsonb_agg(to_jsonb(w) order by window_start) from public.crm_hourly_windows(u,p_from,p_to) w),'[]'::jsonb) from unnest(p_users) u cross join lateral public.crm_hourly_quote(u,p_from,p_to) q; $$;
revoke all on function public.crm_hourly_report_batch(uuid[],timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_hourly_report_batch(uuid[],timestamptz,timestamptz) to service_role;
