-- Private SMS queue and a shared voice/text spending allowance. No public access.
create table public.owner_sms_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 agent_id text, opted_out boolean not null default true,
 fixed_cents integer not null default 500 check(fixed_cents>=500),
 setup_month date, setup_cents integer not null default 0 check(setup_cents>=0)
);
insert into public.owner_sms_settings(id) values(true);
create table public.owner_sms_messages (
 id uuid primary key, message_sid text not null unique, owner_id uuid not null references public.profiles(id),
 body_sealed text not null, reply_sealed text, key_id uuid references public.integration_keys(id),
 state text not null default 'queued' check(state in ('queued','processing','done','uncertain','blocked')),
 reserved_cents integer not null default 50 check(reserved_cents=50),
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 outbound_sid text unique, delivery_status text, conversation_id text
);
alter table public.owner_sms_settings enable row level security;
alter table public.owner_sms_messages enable row level security;
revoke all on public.owner_sms_settings,public.owner_sms_messages from public,anon,authenticated;
grant all on public.owner_sms_settings,public.owner_sms_messages to service_role;
create index owner_sms_queue on public.owner_sms_messages(state,created_at);
create function public.owner_assistant_reserved() returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select fixed_cents+case when setup_month=date_trunc('month',now() at time zone 'America/New_York')::date then setup_cents else 0 end from owner_sms_settings where id),500)
 +coalesce((select sum(reserved_cents) from owner_voice_sessions where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)::integer
 +coalesce((select sum(reserved_cents) from owner_sms_messages where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)::integer;
$$;
create function public.owner_sms_enqueue(p_id uuid,p_sid text,p_owner uuid,p_body text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous owner_sms_messages; cfg owner_sms_settings;
begin
 perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));
 select * into cfg from owner_sms_settings where id;
 if not cfg.enabled or cfg.opted_out or cfg.agent_id is null then return jsonb_build_object('blocked','disabled');end if;
 if p_sid !~ '^SM[a-fA-F0-9]{32}$' or not exists(select 1 from profiles where id=p_owner and role::text='admin' and status='active') then return jsonb_build_object('blocked','owner');end if;
 select * into previous from owner_sms_messages where message_sid=p_sid;
 if found then return jsonb_build_object('id',previous.id,'replayed',true);end if;
 if owner_assistant_reserved()+50>2500 then return jsonb_build_object('blocked','budget');end if;
 if (select count(*) from owner_sms_messages where created_at>now()-interval '1 minute')>=3 then return jsonb_build_object('blocked','rate');end if;
 insert into owner_sms_messages(id,message_sid,owner_id,body_sealed) values(p_id,p_sid,p_owner,p_body);
 return jsonb_build_object('id',p_id);
end;$$;
create function public.owner_sms_claim(p_owner uuid,p_key uuid,p_hash text,p_prefix text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare m owner_sms_messages;
begin
 perform pg_advisory_xact_lock(hashtext('turnly-private-owner-sms'));
 if not exists(select 1 from owner_sms_settings where id and enabled and not opted_out) or not exists(select 1 from profiles where id=p_owner and role::text='admin' and status='active') then return null;end if;
 update integration_keys set revoked_at=coalesce(revoked_at,now()) where id in(select key_id from owner_sms_messages where state='processing' and started_at<now()-interval '3 minutes');
 update owner_sms_messages set state='uncertain',finished_at=now() where state='processing' and started_at<now()-interval '3 minutes';
 if exists(select 1 from owner_sms_messages where state='processing') then return null;end if;
 -- Old commands must never execute hours later without the owner knowing.
 update owner_sms_messages set state='blocked',finished_at=now() where state='queued' and created_at<now()-interval '5 minutes';
 select * into m from owner_sms_messages where state='queued' and owner_id=p_owner order by created_at limit 1 for update;
 if not found then return null;end if;
 insert into integration_keys(id,name,secret_hash,prefix,scopes,created_by,expires_at,deny_record_deletion)
 values(p_key,'Private Alice SMS '||m.id,p_hash,p_prefix,array['platform:full'],p_owner,now()+interval '2 minutes',true);
 update owner_sms_messages set state='processing',started_at=now(),key_id=p_key where id=m.id returning * into m;
 return to_jsonb(m);
end;$$;
revoke all on function public.owner_assistant_reserved(),public.owner_sms_enqueue(uuid,text,uuid,text),public.owner_sms_claim(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.owner_assistant_reserved(),public.owner_sms_enqueue(uuid,text,uuid,text),public.owner_sms_claim(uuid,uuid,text,text) to service_role;

-- Finished calls may retry immediately. Preserve reservations and monthly spending guard.
create or replace function public.owner_voice_reserve_v2(p_incoming_sid text,p_owner uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s owner_voice_sessions; total integer;
begin
 if p_incoming_sid !~ '^CA[a-fA-F0-9]{32}$' or not exists(select 1 from profiles where id=p_owner and role::text='admin' and status='active') then return null;end if;
 perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));
 select * into s from owner_voice_sessions where incoming_sid=p_incoming_sid;
 if found then return jsonb_build_object('id',s.id,'replayed',true);end if;
 update integration_keys k set revoked_at=coalesce(k.revoked_at,now())
 where exists(select 1 from owner_voice_sessions v where v.key_id=k.id and v.expires_at<=now() and v.state in ('reserved','connecting','accepting','active'));
 update owner_voice_sessions set state='failed',key_sealed=null,completed_at=coalesce(completed_at,now()),provider_status='expired'
 where expires_at<=now() and state in ('reserved','connecting','accepting','active');
 if exists(select 1 from owner_voice_sessions where state in ('reserved','connecting','accepting','active') and expires_at>now()) then
  return jsonb_build_object('blocked','active');
 end if;
 if owner_assistant_reserved()+200>2500 then return jsonb_build_object('blocked','budget');end if;
 -- Prevent rapid callback spam without imposing a cooldown after every call.
 if (select count(*) from owner_voice_sessions where created_at>now()-interval '1 minute')>=3 then
  return jsonb_build_object('blocked','rate');
 end if;
 insert into owner_voice_sessions(incoming_sid,owner_id) values(p_incoming_sid,p_owner) returning * into s;
 return jsonb_build_object('id',s.id,'replayed',false);
end;$$;
revoke all on function public.owner_voice_reserve_v2(text,uuid) from public,anon,authenticated;
grant execute on function public.owner_voice_reserve_v2(text,uuid) to service_role;
