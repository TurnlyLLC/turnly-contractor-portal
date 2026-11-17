alter table public.owner_voice_auth add column speech_hashes text[] not null default '{}';
create or replace function public.owner_voice_verify(p_id uuid,p_hash text) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare s owner_voice_sessions; ok boolean;
begin
 perform pg_advisory_xact_lock(hashtext('turnly-owner-voice-auth'));
 select * into s from owner_voice_sessions where id=p_id for update;
 if not found or not s.direct_call or s.state<>'reserved' or s.expires_at<=now() or s.auth_attempts>=3 then return false;end if;
 if (select coalesce(sum(auth_attempts),0) from owner_voice_sessions where created_at>now()-interval '1 hour')>=5 then update owner_voice_sessions set auth_attempts=3 where id=p_id;return false;end if;
 select (secret_hash=p_hash or p_hash=any(speech_hashes)) into ok from owner_voice_auth where id;
 update owner_voice_sessions set auth_attempts=auth_attempts+case when coalesce(ok,false) then 0 else 1 end,state=case when coalesce(ok,false) then 'connecting' else state end where id=p_id;
 return coalesce(ok,false);
end;$$;
revoke all on function public.owner_voice_verify(uuid,text) from public,anon,authenticated;
grant execute on function public.owner_voice_verify(uuid,text) to service_role;
