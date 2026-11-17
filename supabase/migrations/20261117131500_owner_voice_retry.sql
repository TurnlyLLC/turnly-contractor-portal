-- Finished calls may retry immediately. Preserve reservations and monthly spending guard.
create function public.owner_voice_reserve_v2(p_incoming_sid text,p_owner uuid) returns jsonb
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
 select coalesce(sum(reserved_cents),0) into total from owner_voice_sessions
 where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York';
 if total+200>2200 then return jsonb_build_object('blocked','budget');end if;
 -- Prevent rapid callback spam without imposing a cooldown after every call.
 if (select count(*) from owner_voice_sessions where created_at>now()-interval '1 minute')>=3 then
  return jsonb_build_object('blocked','rate');
 end if;
 insert into owner_voice_sessions(incoming_sid,owner_id) values(p_incoming_sid,p_owner) returning * into s;
 return jsonb_build_object('id',s.id,'replayed',false);
end;$$;
revoke all on function public.owner_voice_reserve_v2(text,uuid) from public,anon,authenticated;
grant execute on function public.owner_voice_reserve_v2(text,uuid) to service_role;
