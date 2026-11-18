-- Private conversation turns; no browser/client access or new business privileges.
create table public.owner_openai_turns(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.owner_voice_sessions(id),
 sequence integer not null check(sequence between 1 and 20),state text not null default 'starting' check(state in ('starting','running','audio','done','uncertain')),
 body_sealed text not null,reply_sealed text,response_id text,audio_sealed text,
 reserved_cents numeric not null default 45,ai_cents numeric,tts_cents numeric,
 created_at timestamptz not null default now(),unique(session_id,sequence)
);
alter table public.owner_openai_turns enable row level security;
revoke all on public.owner_openai_turns from public,anon,authenticated;
grant all on public.owner_openai_turns to service_role;
create function public.owner_openai_turn(p_session uuid,p_sequence integer,p_body text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s owner_voice_sessions;t owner_openai_turns;spent numeric;
begin
 select * into s from owner_voice_sessions where id=p_session for update;
 if not found or not s.direct_call or s.state<>'active' or s.expires_at<=now() or s.openai_call_id not like 'responses_%' then return null;end if;
 select * into t from owner_openai_turns where session_id=p_session and sequence=p_sequence;
 if found then return to_jsonb(t)||jsonb_build_object('replayed',true);end if;
 if p_sequence<>1+(select count(*) from owner_openai_turns where session_id=p_session) or p_sequence>20 then return null;end if;
 if exists(select 1 from owner_openai_turns where session_id=p_session and state<>'done') then return null;end if;
 select coalesce(sum(coalesce(ai_cents,40)+coalesce(tts_cents,5)+3),0) into spent from owner_openai_turns where session_id=p_session;
 -- The existing $2 call hold covers bounded model/TTS use, recognition, and carrier time.
 if spent+48>170 then return null;end if;
 insert into owner_openai_turns(session_id,sequence,body_sealed)values(p_session,p_sequence,p_body)returning * into t;
 return to_jsonb(t)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function public.owner_openai_turn(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.owner_openai_turn(uuid,integer,text) to service_role;
