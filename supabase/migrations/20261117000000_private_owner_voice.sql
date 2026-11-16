-- Private voice sessions: service-role only; no recordings or transcripts stored.
create table public.owner_voice_sessions (
 id uuid primary key default gen_random_uuid(), incoming_sid text not null unique,
 owner_id uuid not null references public.profiles(id), callback_sid text unique,
 openai_call_id text unique, key_id uuid references public.integration_keys(id), key_sealed text,
 state text not null default 'reserved' check(state in ('reserved','connecting','accepting','active','completed','failed')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '8 minutes',
 completed_at timestamptz, duration_seconds integer, provider_status text,
 reserved_cents integer not null default 200 check(reserved_cents=200)
);
alter table public.owner_voice_sessions enable row level security;
revoke all on public.owner_voice_sessions from public,anon,authenticated;
grant all on public.owner_voice_sessions to service_role;
create index owner_voice_month on public.owner_voice_sessions(created_at);

create function public.owner_voice_reserve(p_incoming_sid text,p_owner uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s owner_voice_sessions; total integer;
begin
 if p_incoming_sid !~ '^CA[a-fA-F0-9]{32}$' or not exists(select 1 from profiles where id=p_owner and role::text='admin' and status='active') then return null; end if;
 perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));
 select * into s from owner_voice_sessions where incoming_sid=p_incoming_sid;
 if found then return jsonb_build_object('id',s.id,'replayed',true);end if;
 -- Conservative allowance: 11 five-minute sessions/month. $22 usage reserve plus $1.15 number rent.
 -- This is an application allowance, not a guarantee about provider taxes or other account usage.
 select coalesce(sum(reserved_cents),0) into total from owner_voice_sessions
 where created_at >= date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York';
 if total+200>2200 or exists(select 1 from owner_voice_sessions where created_at>now()-interval '10 minutes') then return null;end if;
 insert into owner_voice_sessions(incoming_sid,owner_id) values(p_incoming_sid,p_owner) returning * into s;
 return jsonb_build_object('id',s.id,'replayed',false);
end;$$;

create function public.owner_voice_accept(p_id uuid,p_call_id text,p_key_id uuid,p_hash text,p_prefix text,p_sealed text,p_owner uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s owner_voice_sessions;
begin
 select * into s from owner_voice_sessions where id=p_id for update;
 if not found or s.owner_id<>p_owner or s.expires_at<=now() or s.callback_sid is null or
   s.state not in ('connecting','accepting') or (s.openai_call_id is not null and s.openai_call_id<>p_call_id) or
   not exists(select 1 from profiles where id=p_owner and role::text='admin' and status='active') then return null;end if;
 if s.key_id is null then
   insert into integration_keys(id,name,secret_hash,prefix,scopes,created_by,expires_at)
   values(p_key_id,'Private voice session '||p_id,p_hash,p_prefix,array['platform:full'],p_owner,least(s.expires_at,now()+interval '6 minutes'));
   update owner_voice_sessions set key_id=p_key_id,key_sealed=p_sealed,openai_call_id=p_call_id,state='accepting' where id=p_id returning * into s;
 end if;
 return jsonb_build_object('key_sealed',s.key_sealed);
end;$$;

create function public.owner_voice_finish(p_id uuid,p_status text,p_seconds integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s owner_voice_sessions;
begin
 select * into s from owner_voice_sessions where id=p_id for update;
 if not found then return;end if;
 if s.key_id is not null then update integration_keys set revoked_at=coalesce(revoked_at,now()) where id=s.key_id;end if;
 update owner_voice_sessions set state='completed',key_sealed=null,completed_at=coalesce(completed_at,now()),
   provider_status=p_status,duration_seconds=greatest(0,least(3600,p_seconds)) where id=p_id;
end;$$;
revoke all on function public.owner_voice_reserve(text,uuid) from public,anon,authenticated;
revoke all on function public.owner_voice_accept(uuid,text,uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.owner_voice_finish(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.owner_voice_reserve(text,uuid) to service_role;
grant execute on function public.owner_voice_accept(uuid,text,uuid,text,text,text,uuid) to service_role;
grant execute on function public.owner_voice_finish(uuid,text,integer) to service_role;
