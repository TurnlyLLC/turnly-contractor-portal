-- Residential requests belong in Operations, not the sales pipeline.
alter table public.referral_customers alter column lead_id drop not null;
create or replace function public.register_agent_referral(p_code text,p_name text,p_email text,p_phone text,p_address text,p_city text,p_notes text)
returns void language plpgsql security invoker set search_path=public as $$
declare v_agent uuid;
begin
 perform pg_advisory_xact_lock(610081200);
 select id into v_agent from referral_agents where referral_code=p_code and status='active';
 if v_agent is null then raise exception 'Referral link is inactive'; end if;
 if exists(select 1 from referral_customers where email=lower(trim(p_email)) or phone=p_phone) then return; end if;
 insert into referral_customers(agent_id,name,email,phone) values(v_agent,p_name,lower(trim(p_email)),p_phone);
end $$;

-- Dedicated customer sessions do not grant contractor/staff Supabase access.
create table public.residential_accounts (
 id uuid primary key default gen_random_uuid(), email text not null unique check(email=lower(trim(email))),
 name text not null, password_hash text not null, verified_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table public.residential_account_tokens (
 token_hash text primary key, email text not null, name text not null default '',
 purpose text not null check(purpose in ('setup','reset')), password_hash text,
 expires_at timestamptz not null, created_at timestamptz not null default now(),
 check(purpose<>'setup' or password_hash is not null)
);
create table public.residential_sessions (
 token_hash text primary key, account_id uuid not null references public.residential_accounts(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index residential_sessions_account on public.residential_sessions(account_id);
create index residential_tokens_email on public.residential_account_tokens(email);
create index referral_bookings_email on public.referral_bookings(email,service_date desc);
alter table public.residential_accounts enable row level security;
alter table public.residential_account_tokens enable row level security;
alter table public.residential_sessions enable row level security;
revoke all on public.residential_accounts,public.residential_account_tokens,public.residential_sessions from public,anon,authenticated;
grant all on public.residential_accounts,public.residential_account_tokens,public.residential_sessions to service_role;

-- Single-use verification/reset and session revocation are one transaction.
create function public.finish_residential_account(p_token text,p_purpose text,p_password text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare t residential_account_tokens%rowtype; a uuid;
begin
 select * into t from residential_account_tokens where token_hash=p_token and purpose=p_purpose and expires_at>now() for update;
 if not found then raise exception 'This link has expired or was already used. Please request a new link.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(t.email,610082100));
 if t.purpose='setup' then
  insert into residential_accounts(email,name,password_hash) values(t.email,t.name,t.password_hash) on conflict(email) do nothing returning id into a;
  if a is null then raise exception 'An account already exists. Please sign in or reset your password.'; end if;
 else
  if p_password is null then raise exception 'Choose a new password.'; end if;
  update residential_accounts set password_hash=p_password where email=t.email returning id into a;
  if a is null then raise exception 'Please request a new link.'; end if;
  delete from residential_sessions where account_id=a;
 end if;
 delete from residential_account_tokens where email=t.email;
 return a;
end $$;
revoke all on function public.finish_residential_account(text,text,text) from public,anon,authenticated;
grant execute on function public.finish_residential_account(text,text,text) to service_role;

-- Serialize session creation with password changes to prevent a stale login
-- from restoring a session after a concurrent password reset.
create function public.start_residential_session(p_account uuid,p_password_hash text,p_token text)
returns void language plpgsql security invoker set search_path=public as $$
declare a residential_accounts%rowtype;
begin
 select * into a from residential_accounts where id=p_account for update;
 if not found or a.password_hash<>p_password_hash then raise exception 'Please sign in again.'; end if;
 delete from residential_sessions where account_id=a.id and expires_at<now();
 insert into residential_sessions(token_hash,account_id,expires_at) values(p_token,a.id,now()+interval '7 days');
end $$;
revoke all on function public.start_residential_session(uuid,text,text) from public,anon,authenticated;
grant execute on function public.start_residential_session(uuid,text,text) to service_role;

-- Protect releases through both admin screens and direct assignment updates.
create schema if not exists turnly_private;
revoke all on schema turnly_private from public,anon,authenticated;
create function turnly_private.guard_residential_assignment_release() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.metadata->>'source'='residential_booking' and new.status in ('open','preferred_pending','claimed','scheduled','in_progress','qa_pending','completed') then
  if not exists(select 1 from referral_bookings where id=new.id and status in ('scheduled','completed')) then
   raise exception 'Confirm the residential booking and save its card before releasing this job.';
  end if;
  if coalesce(new.pay_amount,0)<=0 then raise exception 'Set the agreed contractor pay before releasing this job.'; end if;
 end if;
 return new;
end $$;
revoke all on function turnly_private.guard_residential_assignment_release() from public,anon,authenticated;
create trigger guard_residential_assignment_release before insert or update on public.assignment_blocks
for each row execute function turnly_private.guard_residential_assignment_release();
notify pgrst,'reload schema';
