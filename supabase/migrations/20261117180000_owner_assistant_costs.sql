-- Reconcile completed usage; retain holds only while provider billing is unknown.
alter table public.owner_voice_sessions add column actual_cents numeric check(actual_cents>=0), add column twilio_cents numeric check(twilio_cents>=0), add column ai_cents numeric check(ai_cents>=0), add column billing_checked_at timestamptz, add column conversation_id text;
alter table public.owner_sms_messages add column actual_cents numeric check(actual_cents>=0), add column twilio_cents numeric check(twilio_cents>=0), add column ai_cents numeric check(ai_cents>=0), add column billing_checked_at timestamptz;
alter table public.owner_sms_settings add column stream_month date, add column stream_cents numeric not null default 0 check(stream_cents>=0);
create or replace function public.owner_assistant_reserved() returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 select ceil(coalesce((select fixed_cents+case when setup_month=date_trunc('month',now() at time zone 'America/New_York')::date then setup_cents else 0 end+case when stream_month=date_trunc('month',now() at time zone 'America/New_York')::date then stream_cents else 0 end from owner_sms_settings where id),500)
 +coalesce((select sum(case when state in ('completed','failed') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_voice_sessions where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state in ('done','uncertain','blocked') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_sms_messages where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0))::integer;
$$;
revoke all on function public.owner_assistant_reserved() from public,anon,authenticated;
grant execute on function public.owner_assistant_reserved() to service_role;
