create table public.crm_user_access (
 user_id uuid primary key references public.profiles(id),
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
 must_change_password boolean not null default true,
 enabled boolean not null default true,
 valid_after timestamptz not null default now(),
 revision uuid not null default gen_random_uuid(),
 lock_token uuid, lock_until timestamptz,
 created_by uuid references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.crm_user_access enable row level security;
revoke all on public.crm_user_access from anon,authenticated;
grant all on public.crm_user_access to service_role;
create table public.crm_access_audit(id uuid primary key default gen_random_uuid(),actor_id uuid,subject_id uuid,action text not null,created_at timestamptz not null default now());
alter table public.crm_access_audit enable row level security;
revoke all on public.crm_access_audit from anon,authenticated;
grant all on public.crm_access_audit to service_role;
create table public.crm_login_limits(key text primary key,window_start timestamptz not null default now(),attempts int not null default 1);
alter table public.crm_login_limits enable row level security;
revoke all on public.crm_login_limits from anon,authenticated;
grant all on public.crm_login_limits to service_role;
create function public.crm_allow_login(p_key text,p_limit integer) returns boolean language plpgsql security invoker set search_path=public as $$
declare n int; begin
 insert into crm_login_limits as l(key) values(p_key) on conflict(key) do update set
 attempts=case when l.window_start<now()-interval '15 minutes' then 1 else l.attempts+1 end,
 window_start=case when l.window_start<now()-interval '15 minutes' then now() else l.window_start end returning attempts into n;
 delete from crm_login_limits where window_start<now()-interval '1 day';
 return n<=p_limit;
end;$$;
revoke all on function public.crm_allow_login(text,integer) from public,anon,authenticated;
grant execute on function public.crm_allow_login(text,integer) to service_role;
create function public.crm_lock_user(p_user uuid,p_token uuid) returns setof public.crm_user_access language sql security invoker set search_path=public as $$
 update crm_user_access set lock_token=p_token,lock_until=now()+interval '2 minutes'
 where user_id=p_user and (lock_until is null or lock_until<now()) returning *;
$$;
revoke all on function public.crm_lock_user(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_lock_user(uuid,uuid) to service_role;
-- Server-owned access state also checks the session, so old JWTs cannot survive a reset.
create function public.crm_access_state() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('active',coalesce(p.status='active' and p.role::text in ('admin','sales','sales_team') and coalesce(a.enabled,true),false),
 'must_change_password',coalesce(a.must_change_password,false),'username',a.username,
 'session_valid',case when a.user_id is null then true else exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and s.created_at>=a.valid_after) end)
 from profiles p left join crm_user_access a on a.user_id=p.id where p.id=auth.uid();
$$;
revoke all on function public.crm_access_state() from public,anon;
grant execute on function public.crm_access_state() to authenticated;
create or replace function public.current_user_can_use_sales_portal() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((s->>'active')::boolean and (s->>'session_valid')::boolean and not (s->>'must_change_password')::boolean,false) from (select public.crm_access_state() s) x;
$$;
-- Restrictive gates cover legacy permissive sales policies too.
do $$ declare t text; begin
 foreach t in array array['sales_leads','sales_tasks','sales_activities','sales_quotes','sales_contracts','sales_walkthroughs'] loop
 execute format('create policy crm_session_gate on public.%I as restrictive for all to authenticated using (public.current_user_can_use_sales_portal()) with check (public.current_user_can_use_sales_portal())',t);
 end loop;
end $$;
-- Client profile edits cannot promote themselves or undo an administrator's lockout.
create function public.crm_guard_profile_access() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then return new; end if;
 if tg_op='UPDATE' and (old.role is distinct from new.role or old.status is distinct from new.status) then
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='admin' and p.status='active') or not public.current_user_can_use_sales_portal() then raise exception 'Account access is managed by your administrator.'; end if;
 elsif tg_op='INSERT' and new.role::text in ('admin','sales','sales_team') then
  raise exception 'Staff accounts must be created by an administrator.';
 end if;
 return new;
end;$$;
create trigger crm_guard_profile_access before insert or update on public.profiles for each row execute function public.crm_guard_profile_access();
-- Public signup cannot request a staff/admin role through editable metadata.
create function public.crm_guard_staff_signup() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if lower(coalesce(new.raw_user_meta_data->>'role','')) in ('admin','sales','sales_team') and coalesce((new.raw_app_meta_data->>'crm_provisioned')='true',false)=false and coalesce(new.raw_app_meta_data->>'role','') not in ('admin','sales','sales_team') then
 new.raw_user_meta_data=jsonb_set(coalesce(new.raw_user_meta_data,'{}'::jsonb),'{role}','"contractor"'::jsonb);
 end if;return new;
end;$$;
create trigger crm_guard_staff_signup before insert on auth.users for each row execute function public.crm_guard_staff_signup();
create function public.crm_server_session_ready(p_user uuid,p_session text) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(a.enabled and not a.must_change_password and exists(select 1 from auth.sessions s where s.id::text=p_session and s.user_id=p_user and s.created_at>=a.valid_after),false)
 from crm_user_access a where a.user_id=p_user;
$$;
revoke all on function public.crm_server_session_ready(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_server_session_ready(uuid,text) to service_role;
