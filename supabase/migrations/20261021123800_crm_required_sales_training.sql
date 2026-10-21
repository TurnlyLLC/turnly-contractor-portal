-- Only the authenticated server can record verified playback or acknowledgments.
create table public.crm_training_progress (
 user_id uuid not null references public.profiles(id) on delete cascade,
 version text not null, lesson text not null check(lesson in ('introduction','portal')),
 watched_seconds double precision not null default 0 check(watched_seconds>=0),
 last_position double precision not null default 0,
 last_tick timestamptz, playback_session uuid,
 completed_at timestamptz,
 primary key(user_id,version,lesson)
);
create table public.crm_training_reviews (
 user_id uuid not null references public.profiles(id) on delete cascade,
 version text not null, acknowledged_at timestamptz not null default now(),
 primary key(user_id,version)
);
alter table public.crm_training_progress enable row level security;
alter table public.crm_training_reviews enable row level security;
revoke all on public.crm_training_progress,public.crm_training_reviews from public,anon,authenticated;
grant all on public.crm_training_progress,public.crm_training_reviews to service_role;

create function public.crm_training_ready(p_user uuid) returns boolean
language sql stable security invoker set search_path=public as $$
 select (select count(*)=2 from crm_training_progress where user_id=p_user
  and version='20261021-v1' and completed_at is not null)
 and exists(select 1 from crm_training_reviews where user_id=p_user and version='20261021-v1');
$$;

create function public.crm_training_record(p_user uuid,p_lesson text,p_session uuid,p_position double precision,p_start boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v crm_training_progress; duration double precision; elapsed double precision; delta double precision; tick timestamptz:=clock_timestamp();
begin
 if p_lesson not in ('introduction','portal') or p_session is null or p_position is null or p_position<0 or p_position>1000 or p_position='NaN'::float8 then raise exception 'Invalid training progress.'; end if;
 duration:=case p_lesson when 'introduction' then 148.33 else 292.58 end;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,812));
 insert into crm_training_progress(user_id,version,lesson) values(p_user,'20261021-v1',p_lesson) on conflict do nothing;
 select * into v from crm_training_progress where user_id=p_user and version='20261021-v1' and lesson=p_lesson for update;
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
 where user_id=p_user and version='20261021-v1' and lesson=p_lesson;
 return to_jsonb(v);
end $$;

create function public.crm_training_acknowledge(p_user uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,812));
 if (select count(*) from crm_training_progress where user_id=p_user and version='20261021-v1' and completed_at is not null)<>2 then
  raise exception 'Finish both training videos before acknowledging the playbook.';
 end if;
 insert into crm_training_reviews(user_id,version) values(p_user,'20261021-v1') on conflict do nothing;
 return true;
end $$;
revoke all on function public.crm_training_ready(uuid),public.crm_training_record(uuid,text,uuid,double precision,boolean),public.crm_training_acknowledge(uuid) from public,anon,authenticated;
grant execute on function public.crm_training_ready(uuid),public.crm_training_record(uuid,text,uuid,double precision,boolean),public.crm_training_acknowledge(uuid) to service_role;
