create or replace function public.crm_seller_training_record_v4(p_user uuid,p_lesson text,p_session uuid,p_position double precision,p_start boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v crm_training_progress; duration double precision; elapsed double precision; delta double precision; tick timestamptz:=clock_timestamp();
begin
 if p_lesson='portal' and not exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1') then raise exception 'Sign your seller agreement before opening the playbook training.';end if;
 if p_lesson not in ('introduction','portal') or p_session is null or p_position is null or p_position<0 or p_position>1000 or p_position='NaN'::float8 then raise exception 'Invalid training progress.'; end if;
 duration:=case p_lesson when 'introduction' then 150.363 else 253.47 end;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,812));
 insert into crm_training_progress(user_id,version,lesson) values(p_user,'20261027-v2',p_lesson) on conflict do nothing;
 select * into v from crm_training_progress where user_id=p_user and version='20261027-v2' and lesson=p_lesson for update;
 if v.completed_at is not null then return to_jsonb(v); end if;
 if p_start then
  -- Starting another lesson or tab cancels the old playback clock.
  update crm_training_progress set last_tick=null,playback_session=null where user_id=p_user and completed_at is null;
  v.playback_session:=p_session;v.last_position:=least(p_position,v.watched_seconds);v.last_tick:=tick;
 elsif v.playback_session is distinct from p_session or v.last_tick is null then
  raise exception 'Training playback changed. Pause and resume this video.';
 else
  elapsed:=greatest(0,least(12,extract(epoch from tick-v.last_tick)));
  delta:=p_position-v.last_position;
  if delta>=0 and delta<=elapsed+1 and v.last_position<=v.watched_seconds+1 then
   v.watched_seconds:=least(duration,greatest(v.watched_seconds,least(p_position,v.watched_seconds+elapsed)));
   v.last_position:=p_position;
   if v.watched_seconds>=duration-1 and p_position>=duration-0.35 then v.completed_at:=tick; end if;
  else
   -- Seeking ahead earns no credit; the client resumes at the saved position.
   v.last_position:=least(p_position,v.watched_seconds);
  end if;
  v.last_tick:=tick;
 end if;
 update crm_training_progress set watched_seconds=v.watched_seconds,last_position=v.last_position,last_tick=v.last_tick,playback_session=v.playback_session,completed_at=v.completed_at
 where user_id=p_user and version='20261027-v2' and lesson=p_lesson;
 return to_jsonb(v);
end $$;
revoke all on function public.crm_seller_training_record_v4(uuid,text,uuid,double precision,boolean) from public,anon,authenticated;
grant execute on function public.crm_seller_training_record_v4(uuid,text,uuid,double precision,boolean) to service_role;
