-- Private, immutable approval snapshots. Recording payment never sends funds.
create table public.crm_hourly_payments(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),
 period_start timestamptz not null,period_end timestamptz not null,
 hours_seconds numeric not null check(hours_seconds>0),amount_cents bigint not null check(amount_cents>0),
 approved_by uuid not null references public.profiles(id),approved_at timestamptz not null default clock_timestamp(),
 paid_by uuid references public.profiles(id),paid_at timestamptz,reference text,
 check(period_end>period_start),check((paid_at is null and paid_by is null and reference is null) or (paid_at is not null and paid_by is not null and length(trim(reference)) between 3 and 240)),
 unique(user_id,period_end)
);
create index crm_hourly_payments_user on public.crm_hourly_payments(user_id,period_end desc);
alter table public.crm_hourly_payments enable row level security;
revoke all on public.crm_hourly_payments from public,anon,authenticated;
grant select,insert,update on public.crm_hourly_payments to service_role;

create function public.crm_hourly_quote(p_user uuid,p_from timestamptz,p_to timestamptz)
returns table(hours_seconds numeric,amount_cents bigint) language sql stable security invoker set search_path='' as $$
 with raw as (
 select started_at a,ended_at b from public.crm_work_intervals where user_id=p_user and ended_at>p_from and started_at<p_to
 union all
 select answered_at,case when ended_at is not null then answered_at+make_interval(secs=>duration_seconds) else least(now(),created_at+interval '61 minutes') end
 from public.crm_voice_calls where user_id=p_user and answered_at is not null and dialed_at is not null and answered_at<p_to
 ), clipped as(select greatest(a,p_from) a,least(b,p_to,now()) b from raw),
 merged as(select range_agg(tstzrange(a,b,'[)')) ranges from clipped where b>a),
 spans as(select unnest(ranges) r from merged),
 plans as(select mode,hourly_cents,effective_at a,lead(effective_at,1,'infinity'::timestamptz) over(order by effective_at,id) b from public.crm_pay_plans where user_id=p_user),
 pieces as(select hourly_cents,extract(epoch from least(upper(r),b)-greatest(lower(r),a)) secs from spans cross join plans where mode='hourly' and upper(r)>a and lower(r)<b)
 select coalesce(sum(secs),0),coalesce(round(sum(secs*hourly_cents/3600)),0)::bigint from pieces;
$$;

create function public.crm_hourly_summary(p_user uuid,p_through timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) from (
 select p.id user_id,p.full_name name,s.period_start,q.hours_seconds review_seconds,q.amount_cents review_cents,
 pending.hours_seconds pending_seconds,pending.amount_cents pending_cents,
 coalesce((select sum(amount_cents) from public.crm_hourly_payments where user_id=p.id and paid_at is null),0) approved_cents,
 coalesce((select sum(amount_cents) from public.crm_hourly_payments where user_id=p.id and paid_at is not null),0) paid_cents
 from public.profiles p
 cross join lateral(select coalesce((select max(period_end) from public.crm_hourly_payments where user_id=p.id),(select min(effective_at) from public.crm_pay_plans where user_id=p.id and mode='hourly')) period_start) s
 cross join lateral public.crm_hourly_quote(p.id,s.period_start,p_through) q
 cross join lateral public.crm_hourly_quote(p.id,s.period_start,now()) pending
 where p.role::text in ('admin','sales','sales_team') and (p_user is null or p.id=p_user) and s.period_start is not null
 ) result;
$$;

create function public.crm_hourly_payment_review(p_admin uuid,p_user uuid,p_action text,p_from timestamptz,p_to timestamptz,p_expected bigint,p_id uuid default null,p_reference text default '')
returns uuid language plpgsql security invoker set search_path='' as $$
declare v public.crm_hourly_payments; start_at timestamptz; q record;
begin
 if not exists(select 1 from public.profiles where id=p_admin and role::text='admin' and status='active') then raise exception 'Administrator access required';end if;
 if p_action not in ('approve','record_paid') or p_expected is null or p_expected<=0 then raise exception 'Invalid payment review';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,705));
 if p_action='record_paid' then
  select * into v from public.crm_hourly_payments where id=p_id and user_id=p_user for update;
  if not found then raise exception 'Approved hourly payment not found';end if;
  if p_expected<>v.amount_cents then raise exception 'Amount changed. Refresh before recording payment';end if;
  if length(trim(p_reference)) not between 3 and 240 or p_reference is null then raise exception 'Enter the completed payment reference';end if;
  if v.paid_at is not null then
   if v.reference=trim(p_reference) then return v.id;end if;
   raise exception 'This period is already marked paid';
  end if;
  update public.crm_hourly_payments set paid_by=p_admin,paid_at=clock_timestamp(),reference=trim(p_reference) where id=v.id;
 else
  if p_from is null or p_to is null or p_to<=p_from or p_to>clock_timestamp()-interval '2 minutes' then raise exception 'Choose a completed period ending at least two minutes ago';end if;
  select * into v from public.crm_hourly_payments where user_id=p_user and period_start=p_from and period_end=p_to;
  if found then
   if v.amount_cents=p_expected then return v.id;end if;
   raise exception 'This period has already been approved';
  end if;
  select coalesce((select max(period_end) from public.crm_hourly_payments where user_id=p_user),(select min(effective_at) from public.crm_pay_plans where user_id=p_user and mode='hourly')) into start_at;
  if start_at is null or start_at<>p_from then raise exception 'The review period changed. Refresh to prevent duplicate pay';end if;
  if exists(select 1 from public.crm_hourly_payments where user_id=p_user and period_start<p_to and period_end>p_from) then raise exception 'This period overlaps an existing approval';end if;
  if exists(select 1 from public.crm_voice_calls where user_id=p_user and created_at<p_to and created_at>p_from-interval '61 minutes' and status in ('dialing','initiated','ringing','in-progress') and created_at>now()-interval '61 minutes') then raise exception 'Wait for ongoing calls to finish before approving this period';end if;
  select * into q from public.crm_hourly_quote(p_user,p_from,p_to);
  if q.amount_cents<>p_expected or q.amount_cents<=0 then raise exception 'Tracked earnings changed. Refresh and review the current amount';end if;
  insert into public.crm_hourly_payments(user_id,period_start,period_end,hours_seconds,amount_cents,approved_by)
  values(p_user,p_from,p_to,q.hours_seconds,q.amount_cents,p_admin) returning * into v;
 end if;
 insert into public.crm_access_audit(actor_id,subject_id,action)values(p_admin,p_user,'hourly_'||p_action||':'||v.id::text);
 return v.id;
end $$;
revoke all on function public.crm_hourly_quote(uuid,timestamptz,timestamptz),public.crm_hourly_summary(uuid,timestamptz),public.crm_hourly_payment_review(uuid,uuid,text,timestamptz,timestamptz,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_hourly_quote(uuid,timestamptz,timestamptz),public.crm_hourly_summary(uuid,timestamptz),public.crm_hourly_payment_review(uuid,uuid,text,timestamptz,timestamptz,bigint,uuid,text) to service_role;
