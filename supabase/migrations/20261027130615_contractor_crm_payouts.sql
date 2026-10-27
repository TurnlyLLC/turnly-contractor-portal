create table public.contractor_connect_accounts (
 profile_id uuid primary key references public.profiles(id), account_id text unique not null,
 created_at timestamptz not null default now()
);
create table public.contractor_payouts (
 id uuid primary key default gen_random_uuid(), assignment_id uuid unique not null references public.assignment_blocks(id),
 contractor_id uuid not null references public.profiles(id), actor_id uuid not null references public.profiles(id),
 method text not null check(method in ('stripe','external')), amount_cents bigint not null check(amount_cents>0),
 destination text, status text not null check(status in ('reserved','completed')) default 'reserved',
 reference text not null default '', stripe_transfer_id text unique, created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.contractor_connect_accounts enable row level security;
alter table public.contractor_payouts enable row level security;
revoke all on public.contractor_connect_accounts,public.contractor_payouts from anon,authenticated;
grant select,insert,update on public.contractor_connect_accounts,public.contractor_payouts to service_role;
create index contractor_payouts_contractor_idx on public.contractor_payouts(contractor_id,created_at desc);
create or replace function public.reserve_contractor_payout(p_actor uuid,p_contractor uuid,p_assignment uuid,p_method text,p_expected bigint,p_reference text default '') returns public.contractor_payouts
language plpgsql security invoker set search_path=public as $$
declare j public.assignment_blocks; r public.contractor_payouts; amount bigint; destination text; m jsonb;
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin' and status='active') then raise exception 'Active admin required'; end if;
 if not exists(select 1 from profiles where id=p_contractor and role='contractor') then raise exception 'Choose a cleaning contractor'; end if;
 select * into j from assignment_blocks where id=p_assignment for update;
 if j.id is null or coalesce(j.claimed_by,j.assigned_to) is distinct from p_contractor then raise exception 'Assignment does not belong to this contractor'; end if;
 select * into r from contractor_payouts where assignment_id=j.id;
 if r.id is not null then
  if r.method<>p_method or r.contractor_id<>p_contractor or r.amount_cents<>p_expected then raise exception 'A different payment is already recorded or in progress'; end if;
  return r;
 end if;
 if j.status not in ('completed','approved','paid') then raise exception 'Complete and approve the assignment before payment'; end if;
 if coalesce(j.paid_out,false) or j.paid_at is not null or 'paid'=any(array[j.payment_status,j.pay_status,j.payout_status]) or j.metadata->'payment'->>'status'='paid' or j.quickbooks_payment_status='paid' then raise exception 'This assignment is already paid'; end if;
 m=coalesce(j.metadata->'payment','{}'::jsonb);
 amount=round(greatest(0,coalesce(j.pay_amount,0)+coalesce(nullif(m->>'added_fee_amount','')::numeric,0)-coalesce(nullif(m->>'fee_amount','')::numeric,0))*100);
 if amount<=0 or amount<>p_expected then raise exception 'Pay amount changed. Refresh before paying'; end if;
 if p_method='stripe' then
  if coalesce(j.metadata->>'is_test','false')='true' then raise exception 'Test assignments cannot receive real Stripe payments'; end if;
  select account_id into destination from contractor_connect_accounts where profile_id=p_contractor;
  if destination is null then raise exception 'Contractor must finish Stripe setup first'; end if;
 elsif p_method='external' then
  if length(trim(p_reference))<3 or length(p_reference)>500 then raise exception 'Enter a payment method and reference'; end if;
 else raise exception 'Choose a payment method'; end if;
 insert into contractor_payouts(assignment_id,contractor_id,actor_id,method,amount_cents,destination,reference) values(j.id,p_contractor,p_actor,p_method,amount,destination,trim(p_reference)) returning * into r;
 return r;
end $$;
create or replace function public.finish_contractor_payout(p_id uuid,p_transfer text default null) returns public.contractor_payouts
language plpgsql security invoker set search_path=public as $$
declare r public.contractor_payouts;
begin
 select * into r from contractor_payouts where id=p_id for update;
 if r.id is null then raise exception 'Payment not found'; end if;
 if r.status='completed' then return r; end if;
 if r.method='stripe' and (p_transfer is null or p_transfer not like 'tr_%') then raise exception 'Stripe transfer confirmation required'; end if;
 update contractor_payouts set status='completed',stripe_transfer_id=p_transfer,completed_at=now() where id=p_id returning * into r;
 update assignment_blocks set payment_status='paid',pay_status='paid',payout_status='paid',paid_out=true,paid_at=now(),paid_by=r.actor_id,paid_amount=r.amount_cents/100.0,paid_notes=case when r.method='stripe' then 'Stripe transfer '||p_transfer||' (bank payout follows Stripe schedule)' else r.reference end,
 metadata=jsonb_set(coalesce(metadata,'{}'),'{payment}',coalesce(metadata->'payment','{}')||jsonb_build_object('status','paid','paid_amount',r.amount_cents/100.0,'paid_at',now(),'source',r.method,'payout_record_id',r.id,'stripe_transfer_id',p_transfer)) where id=r.assignment_id;
 return r;
end $$;
revoke all on function public.reserve_contractor_payout(uuid,uuid,uuid,text,bigint,text),public.finish_contractor_payout(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_contractor_payout(uuid,uuid,uuid,text,bigint,text),public.finish_contractor_payout(uuid,text) to service_role;
create schema if not exists turnly_private;
create or replace function turnly_private.protect_contractor_payout() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contractor_payouts;
begin
 select * into r from contractor_payouts where assignment_id=old.id;
 if r.id is null then return new; end if;
 if (new.pay_amount,new.claimed_by,new.assigned_to) is distinct from (old.pay_amount,old.claimed_by,old.assigned_to) then raise exception 'Payment is recorded or in progress. Resolve it before changing pay or contractor'; end if;
 if (new.payment_status,new.pay_status,new.payout_status,new.paid_out,new.paid_at,new.paid_amount,new.metadata->'payment') is distinct from (old.payment_status,old.pay_status,old.payout_status,old.paid_out,old.paid_at,old.paid_amount,old.metadata->'payment') then
  if r.status<>'completed' or new.payment_status is distinct from 'paid' or new.pay_status is distinct from 'paid' or new.payout_status is distinct from 'paid' or new.paid_out is distinct from true or new.paid_amount is distinct from r.amount_cents/100.0 or new.metadata->'payment'->>'payout_record_id' is distinct from r.id::text then raise exception 'Use the contractor payout record to manage this payment'; end if;
 end if;
 return new;
end $$;
revoke all on function turnly_private.protect_contractor_payout() from public,anon,authenticated;
create trigger protect_contractor_payout before update on public.assignment_blocks for each row execute function turnly_private.protect_contractor_payout();
