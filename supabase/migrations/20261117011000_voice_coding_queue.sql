create table public.portal_coding_workers(id uuid primary key default gen_random_uuid(),secret_hash text not null unique,expires_at timestamptz not null,revoked_at timestamptz,last_seen_at timestamptz);
create table public.portal_coding_jobs(id uuid primary key default gen_random_uuid(),owner_id uuid not null references profiles(id),instructions text not null check(length(instructions) between 10 and 8000),state text not null default 'queued' check(state in ('queued','running','published','failed','needs_attention')),worker_id uuid references portal_coding_workers(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),summary text,commit_sha text);
alter table public.portal_coding_workers enable row level security;
alter table public.portal_coding_jobs enable row level security;
revoke all on public.portal_coding_workers,public.portal_coding_jobs from anon,authenticated;
grant all on public.portal_coding_workers,public.portal_coding_jobs to service_role;
create function public.portal_coding_claim(p_worker uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j portal_coding_jobs;
begin
 perform pg_advisory_xact_lock(79032510);
 update portal_coding_workers set last_seen_at=now() where id=p_worker and revoked_at is null and expires_at>now();
 if not found then raise exception 'Invalid worker';end if;
 -- Never replay a job after a crash: publication may already have occurred.
 update portal_coding_jobs set state='needs_attention',summary='Worker stopped before confirming the result. Inspect before retrying.',updated_at=now() where state='running' and updated_at<now()-interval '5 minutes';
 if exists(select 1 from portal_coding_jobs where state='running') then return null;end if;
 select * into j from portal_coding_jobs where state='queued' order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update portal_coding_jobs set state='running',worker_id=p_worker,updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end;$$;
revoke all on function public.portal_coding_claim(uuid) from public,anon,authenticated;
grant execute on function public.portal_coding_claim(uuid) to service_role;
