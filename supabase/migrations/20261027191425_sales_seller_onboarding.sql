create table public.crm_seller_agreements(
 user_id uuid not null references public.profiles(id), version text not null,
 agreement_hash text not null, agreement_text text not null, signer_name text not null,
 consent_text text not null, signed_at timestamptz not null default now(),
 primary key(user_id,version)
);
alter table public.crm_seller_agreements enable row level security;
revoke all on public.crm_seller_agreements from public,anon,authenticated;
grant select,insert on public.crm_seller_agreements to service_role;

create table public.crm_commission_payments(
 order_id uuid primary key references public.crm_sales_commissions(order_id),
 sales_user_id uuid not null references public.profiles(id),
 approved_cents integer not null check(approved_cents>0), approved_by uuid not null references public.profiles(id), approved_at timestamptz not null default now(),
 paid_cents integer check(paid_cents>0), paid_by uuid references public.profiles(id), paid_at timestamptz, reference text,
 check((paid_at is null and paid_cents is null and paid_by is null) or (paid_at is not null and paid_cents is not null and paid_by is not null and length(reference)>=3))
);
alter table public.crm_commission_payments enable row level security;
revoke all on public.crm_commission_payments from public,anon,authenticated;
grant select,insert,update on public.crm_commission_payments to service_role;

create function public.crm_commission_payment_review(p_admin uuid,p_order uuid,p_action text,p_reference text,p_expected integer)
returns boolean language plpgsql security invoker set search_path=public as $$
declare c crm_sales_commissions; p crm_commission_payments;
begin
 if not exists(select 1 from profiles where id=p_admin and role='admin' and status='active') then raise exception 'Administrator access required.';end if;
 select * into c from crm_sales_commissions where order_id=p_order for update;
 if not found or c.status<>'earned' or c.amount_cents<=0 or c.amount_cents is distinct from p_expected then raise exception 'Commission changed or is not eligible. Refresh before approving.';end if;
 select * into p from crm_commission_payments where order_id=p_order for update;
 if p.paid_at is not null then raise exception 'Payment has already been recorded.';end if;
 if p_action='approve' then
  insert into crm_commission_payments(order_id,sales_user_id,approved_cents,approved_by) values(c.order_id,c.sales_user_id,c.amount_cents,p_admin)
  on conflict(order_id) do update set approved_cents=excluded.approved_cents,approved_by=excluded.approved_by,approved_at=now();
 elsif p_action='record_paid' then
  if p.order_id is null or p.approved_cents<>c.amount_cents then raise exception 'Approve the current commission before recording payment.';end if;
  if length(trim(coalesce(p_reference,'')))<3 or length(p_reference)>240 then raise exception 'Enter a payment reference from the actual completed payment.';end if;
  update crm_commission_payments set paid_cents=c.amount_cents,paid_by=p_admin,paid_at=now(),reference=trim(p_reference) where order_id=p_order;
 else raise exception 'Unknown payment action.';
 end if;
 return true;
end $$;
revoke all on function public.crm_commission_payment_review(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.crm_commission_payment_review(uuid,uuid,text,text,integer) to service_role;

create or replace function public.crm_training_ready(p_user uuid) returns boolean
language sql stable security invoker set search_path=public as $$
 select exists(select 1 from crm_training_progress where user_id=p_user and version='20261027-v2' and lesson='introduction' and completed_at is not null)
 and exists(select 1 from crm_training_reviews where user_id=p_user and version='20261027-v2')
 and exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1');
$$;
create or replace function public.crm_training_record(p_user uuid,p_lesson text,p_session uuid,p_position double precision,p_start boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v crm_training_progress; duration double precision; elapsed double precision; delta double precision; tick timestamptz:=clock_timestamp();
begin
 if p_lesson not in ('introduction','portal') or p_session is null or p_position is null or p_position<0 or p_position>1000 or p_position='NaN'::float8 then raise exception 'Invalid training progress.'; end if;
 duration:=case p_lesson when 'introduction' then 150.363 else 292.58 end;
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


create or replace function public.crm_training_acknowledge(p_user uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,812));
 if not exists(select 1 from crm_training_progress where user_id=p_user and version='20261027-v2' and lesson='introduction' and completed_at is not null) then
  raise exception 'Finish the introduction before acknowledging the playbook.';
 end if;
 insert into crm_training_reviews(user_id,version) values(p_user,'20261027-v2') on conflict do nothing;
 return true;
end $$;
