create table if not exists public.owner_assistant_diagnostics(id uuid primary key,agent_id text not null,conversation_id text,state text not null default 'running' check(state in ('running','done','unknown')),reserved_cents integer not null check(reserved_cents between 1 and 100),actual_cents numeric check(actual_cents>=0),created_at timestamptz not null default now(),finished_at timestamptz,billing_checked_at timestamptz);
alter table public.owner_assistant_diagnostics enable row level security;
revoke all on public.owner_assistant_diagnostics from public,anon,authenticated;
grant all on public.owner_assistant_diagnostics to service_role;
CREATE OR REPLACE FUNCTION public.owner_assistant_reserved()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select ceil(coalesce((select fixed_cents+case when setup_month=date_trunc('month',now() at time zone 'America/New_York')::date then setup_cents else 0 end+case when stream_month=date_trunc('month',now() at time zone 'America/New_York')::date then stream_cents else 0 end from owner_sms_settings where id),500)
 +coalesce((select sum(case when state in ('completed','failed') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_voice_sessions where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state in ('done','uncertain','blocked') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_sms_messages where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state='reserved' then reserved_cents else coalesce(actual_cents,charged_cents,reserved_cents) end) from communication_usage where source='A.L.I.C.E. external message' and created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(coalesce(actual_cents,reserved_cents)) from owner_assistant_diagnostics where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0))::integer;
$function$;


create or replace function owner_assistant_diagnostic_reserve(p_id uuid,p_agent text,p_cents integer default 50)returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));perform pg_advisory_xact_lock(hashtext('turnly-private-owner-sms'));
 if p_cents not between 1 and 100 or owner_assistant_reserved()+p_cents>2500 then raise exception 'Alice shared monthly allowance reached';end if;
 insert into owner_assistant_diagnostics(id,agent_id,reserved_cents) values(p_id,p_agent,p_cents);return p_id;
end $$;
revoke all on function owner_assistant_diagnostic_reserve(uuid,text,integer) from public,anon,authenticated;grant execute on function owner_assistant_diagnostic_reserve(uuid,text,integer) to service_role;
