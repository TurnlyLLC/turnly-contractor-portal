-- Approved contractors who are also assigned the Brand Ambassador role get referral access
-- right away. Training and the agreement stay available but optional for them.
-- Qualification is always checked live; the columns below only record that an exemption
-- was granted (and when it was paused) so the history is auditable. Nothing is signed,
-- scored or completed on the ambassador's behalf.

alter table public.ba_members
 add column if not exists referral_exemption text check (referral_exemption in ('approved_contractor')),
 add column if not exists exempt_at timestamptz,
 add column if not exists exempt_source text,
 add column if not exists exempt_paused_at timestamptz;

create table if not exists public.ba_exemption_audit (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.ba_members(user_id) on delete cascade,
 event text not null check (event in ('granted','paused','restored')),
 basis text not null default 'approved_contractor',
 source text not null,
 actor_id uuid,
 created_at timestamptz not null default now()
);
create index if not exists ba_exemption_audit_user_idx on public.ba_exemption_audit(user_id, created_at desc);
alter table public.ba_exemption_audit enable row level security;
revoke all on public.ba_exemption_audit from anon, authenticated;
grant select on public.ba_exemption_audit to authenticated;
grant all on public.ba_exemption_audit to service_role;
drop policy if exists ba_exemption_audit_admin_read on public.ba_exemption_audit;
create policy ba_exemption_audit_admin_read on public.ba_exemption_audit for select to authenticated using (public.current_profile_is_admin());

-- Live rule: active profile, contractor approved by Turnly, both contractor and
-- brand_ambassador roles assigned, and an enabled ambassador membership.
create or replace function turnly_private.ba_contractor_qualifies(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from public.profiles p
  join public.app_user_access a on a.user_id = p.id
  join public.ba_members m on m.user_id = p.id
  where p.id = p_user
   and p.status = 'active'
   and p.contractor_approved is true
   and a.roles @> array['contractor','brand_ambassador']::text[]
   and m.enabled
 );
$$;
revoke all on function turnly_private.ba_contractor_qualifies(uuid) from public, anon, authenticated;

-- Idempotent: records the first grant, a pause when qualification is lost, and a
-- restore when it returns. Repeated calls with no change write nothing.
create or replace function turnly_private.ba_sync_exemption(p_user uuid, p_source text, p_actor uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare m public.ba_members; ok boolean;
begin
 select * into m from public.ba_members where user_id = p_user for update;
 if not found then return; end if;
 ok := turnly_private.ba_contractor_qualifies(p_user);
 if ok and m.referral_exemption is null then
  update public.ba_members set referral_exemption = 'approved_contractor', exempt_at = now(), exempt_source = p_source, exempt_paused_at = null where user_id = p_user;
  insert into public.ba_exemption_audit(user_id, event, source, actor_id) values (p_user, 'granted', p_source, p_actor);
 elsif ok and m.exempt_paused_at is not null then
  update public.ba_members set exempt_paused_at = null where user_id = p_user;
  insert into public.ba_exemption_audit(user_id, event, source, actor_id) values (p_user, 'restored', p_source, p_actor);
 elsif not ok and m.referral_exemption is not null and m.exempt_paused_at is null then
  update public.ba_members set exempt_paused_at = now() where user_id = p_user;
  insert into public.ba_exemption_audit(user_id, event, source, actor_id) values (p_user, 'paused', p_source, p_actor);
 end if;
end $$;
revoke all on function turnly_private.ba_sync_exemption(uuid, text, uuid) from public, anon, authenticated;

create or replace function turnly_private.ba_exemption_profile_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform turnly_private.ba_sync_exemption(new.id, 'profile_change', auth.uid());
 return new;
end $$;
create or replace function turnly_private.ba_exemption_access_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform turnly_private.ba_sync_exemption(coalesce(new.user_id, old.user_id), 'role_change', coalesce(new.updated_by, auth.uid()));
 return coalesce(new, old);
end $$;
create or replace function turnly_private.ba_exemption_member_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform turnly_private.ba_sync_exemption(new.user_id, 'membership_change', auth.uid());
 return new;
end $$;
revoke all on function turnly_private.ba_exemption_profile_trigger() from public, anon, authenticated;
revoke all on function turnly_private.ba_exemption_access_trigger() from public, anon, authenticated;
revoke all on function turnly_private.ba_exemption_member_trigger() from public, anon, authenticated;

drop trigger if exists ba_exemption_on_profile on public.profiles;
create trigger ba_exemption_on_profile after update of status, contractor_approved on public.profiles
 for each row execute function turnly_private.ba_exemption_profile_trigger();
drop trigger if exists ba_exemption_on_access on public.app_user_access;
create trigger ba_exemption_on_access after insert or update of roles or delete on public.app_user_access
 for each row execute function turnly_private.ba_exemption_access_trigger();
drop trigger if exists ba_exemption_on_member on public.ba_members;
create trigger ba_exemption_on_member after insert or update of enabled on public.ba_members
 for each row execute function turnly_private.ba_exemption_member_trigger();

-- Leads: a link works for a fully onboarded ambassador or a live-qualified approved contractor.
-- The API still checks training and the current agreement for standard ambassadors first.
create or replace function public.register_ba_lead(p_code text,p_name text,p_email text,p_phone text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare m ba_members; l ba_leads;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into m from ba_members where code=p_code and enabled
  and exists(select 1 from public.profiles p join public.app_user_access a on a.user_id=p.id where p.id=ba_members.user_id and p.status='active' and a.roles @> array['brand_ambassador']::text[])
  and (onboarding_completed_at is not null or turnly_private.ba_contractor_qualifies(user_id));
 if not found then raise exception 'Ambassador link is inactive'; end if;
 if length(trim(p_name))<1 or p_email not like '%@%' or length(p_phone)<10 or coalesce(p_consent,'')='' then raise exception 'Contact details and consent are required'; end if;
 select * into l from ba_leads where email=lower(trim(p_email)) or phone=p_phone order by created_at,id limit 1;
 if found then return l.id; end if;
 insert into ba_leads(member_id,name,email,phone,consent_version)
 values(m.user_id,p_name,lower(trim(p_email)),p_phone,p_consent) returning * into l;
 insert into ba_events(lead_id,event) values(l.id,'lead_registered');
 return l.id;
end $$;

-- Backfill existing members (idempotent; safe to re-run).
select turnly_private.ba_sync_exemption(user_id, 'backfill_20261106', null) from public.ba_members;

comment on column public.ba_members.referral_exemption is 'Recorded basis for immediate referral access. Access is still checked live by turnly_private.ba_contractor_qualifies; exempt_paused_at marks a lost qualification. Never implies training or agreement completion.';
grant usage on schema turnly_private to service_role;
grant execute on function turnly_private.ba_contractor_qualifies(uuid) to service_role;
revoke all on function public.register_ba_lead(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_ba_lead(text,text,text,text,text) to service_role;

-- App logins coexist with the existing portal login. No refresh/access tokens are stored.
create table if not exists turnly_private.ba_app_sessions (
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 user_id uuid not null references public.ba_members(user_id) on delete cascade,
 created_at timestamptz not null default now()
);
create index if not exists ba_app_sessions_user_idx on turnly_private.ba_app_sessions(user_id);
alter table turnly_private.ba_app_sessions enable row level security;
revoke all on turnly_private.ba_app_sessions from public, anon, authenticated;

create or replace function public.ba_app_session(p_user uuid,p_session uuid,p_register boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 -- Serialize membership changes with registration; disable/reset cannot leave a new binding behind.
 perform 1 from public.ba_members where user_id=p_user and enabled for update;
 if not found then return false; end if;
 if not exists(select 1 from public.profiles p join public.app_user_access a on a.user_id=p.id
   where p.id=p_user and p.status='active' and a.roles @> array['brand_ambassador']::text[]) then return false; end if;
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user
   and (not_after is null or not_after>now())) then return false; end if;
 if p_register then
  insert into turnly_private.ba_app_sessions(session_id,user_id) values(p_session,p_user) on conflict(session_id) do nothing;
 end if;
 return exists(select 1 from turnly_private.ba_app_sessions where session_id=p_session and user_id=p_user);
end $$;
revoke all on function public.ba_app_session(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.ba_app_session(uuid,uuid,boolean) to service_role;

create or replace function turnly_private.ba_revoke_app_sessions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.enabled is distinct from old.enabled or new.must_change_password is distinct from old.must_change_password then
  delete from turnly_private.ba_app_sessions where user_id=new.user_id;
 end if;
 return new;
end $$;
revoke all on function turnly_private.ba_revoke_app_sessions() from public,anon,authenticated;
drop trigger if exists ba_revoke_app_sessions on public.ba_members;
create trigger ba_revoke_app_sessions after update of enabled,must_change_password on public.ba_members
for each row execute function turnly_private.ba_revoke_app_sessions();
