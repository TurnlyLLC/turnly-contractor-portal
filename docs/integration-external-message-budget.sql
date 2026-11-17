CREATE OR REPLACE FUNCTION public.owner_assistant_reserved()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select ceil(coalesce((select fixed_cents+case when setup_month=date_trunc('month',now() at time zone 'America/New_York')::date then setup_cents else 0 end+case when stream_month=date_trunc('month',now() at time zone 'America/New_York')::date then stream_cents else 0 end from owner_sms_settings where id),500)
 +coalesce((select sum(case when state in ('completed','failed') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_voice_sessions where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state in ('done','uncertain','blocked') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_sms_messages where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state='reserved' then reserved_cents else coalesce(actual_cents,charged_cents,reserved_cents) end) from communication_usage where source='A.L.I.C.E. external message' and created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0))::integer;
$function$;

CREATE OR REPLACE FUNCTION public.communication_reserve(p_id text, p_user uuid, p_channel text, p_source text, p_units integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare s communication_settings;r communication_rep_limits;t jsonb;u jsonb;cost integer;secs integer;
begin
 if p_source='A.L.I.C.E. external message' then perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));perform pg_advisory_xact_lock(hashtext('turnly-private-owner-sms'));end if;
 perform pg_advisory_xact_lock(87105020);
 if exists(select 1 from communication_usage where id=p_id) then raise exception 'This communication has already been submitted. Check its status before retrying.';end if;
 select * into s from communication_settings where id;
 if s.paused or (p_channel='call' and s.calls_paused) or (p_channel='sms' and s.texts_paused) then raise exception 'Calling or texting is paused by your administrator.';end if;
 if p_channel not in ('call','sms') or p_units not between 1 and 100 then raise exception 'Invalid communication.';end if;
 if p_channel='call' then secs:=s.max_call_minutes*60;cost:=(s.max_call_minutes+2)*s.voice_cents_per_minute+1;else cost:=p_units*s.sms_cents_per_segment;end if;
 if p_source='A.L.I.C.E. external message' and owner_assistant_reserved()+cost>2500 then raise exception 'Alice shared monthly allowance reached';end if;
 t:=communication_totals();
 if (t->>'daily_cents')::numeric+cost>s.daily_cents or (t->>'monthly_cents')::numeric+cost>s.monthly_cents then raise exception 'Combined calling and texting budget reached. Ask an administrator to review the limits.';end if;
 if p_user is not null then
 select * into r from communication_rep_limits where user_id=p_user;u:=communication_totals(p_user);
 if coalesce(r.paused,false) or (u->>'daily_cents')::numeric+cost>coalesce(r.daily_cents,s.default_rep_daily_cents) or (u->>'monthly_cents')::numeric+cost>coalesce(r.monthly_cents,s.default_rep_monthly_cents) then raise exception 'Your calling and texting allowance has been reached or paused. Ask your administrator.';end if;
 end if;
 insert into communication_usage(id,user_id,channel,source,reserved_cents,units,max_seconds,rate_cents) values(p_id,p_user,p_channel,p_source,cost,p_units,secs,case when p_channel='call' then s.voice_cents_per_minute else s.sms_cents_per_segment end);
 perform communication_alerts();return jsonb_build_object('max_seconds',secs,'reserved_cents',cost);
end$function$
