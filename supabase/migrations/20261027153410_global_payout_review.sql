-- Private admin-only payment review queue. No bank credentials are stored here.
create table public.payout_recipients (
 id uuid primary key default gen_random_uuid(),stripe_account text not null unique,
 contractor_id uuid unique references public.profiles(id),kind text not null check(kind in ('contractor','assistant')),
 name text not null,country text not null check(country in ('US','PH','PK')),created_by uuid references public.profiles(id),created_at timestamptz default now()
);
create table public.global_payout_requests (
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.payout_recipients(id),
 assignment_id uuid unique references public.assignment_blocks(id),ledger_id uuid unique references public.contractor_payouts(id),
 recipient_account text not null,financial_account text not null,amount_cents bigint not null check(amount_cents>0),currency text not null check(currency in ('usd','php','pkr')),
 reference text not null,status text not null default 'draft' check(status in ('draft','preparing','review','approved','pending','processing','posted','requires_action','canceled')),
 stripe_intent text unique,created_by uuid not null references public.profiles(id),approved_by uuid references public.profiles(id),created_at timestamptz not null default now(),prepared_at timestamptz,approved_at timestamptz,updated_at timestamptz not null default now(),approval_snapshot jsonb,status_detail jsonb,
 unique(recipient_id,reference)
);
alter table public.payout_recipients enable row level security;
alter table public.global_payout_requests enable row level security;
revoke all on public.payout_recipients,public.global_payout_requests from anon,authenticated;
grant select,insert,update on public.payout_recipients,public.global_payout_requests to service_role;
alter table public.contractor_payouts drop constraint contractor_payouts_method_check;
alter table public.contractor_payouts add constraint contractor_payouts_method_check check(method in ('stripe','external','global'));
create function public.draft_global_payout(p_actor uuid,p_recipient uuid,p_assignment uuid,p_amount bigint,p_currency text,p_reference text,p_financial text) returns public.global_payout_requests
language plpgsql security invoker set search_path=public as $$
declare recipient payout_recipients; j assignment_blocks; amount bigint; ledger uuid; r global_payout_requests;
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin' and status='active') then raise exception 'Active admin required'; end if;
 select * into recipient from payout_recipients where id=p_recipient for update;
 if recipient.id is null then raise exception 'Recipient not found'; end if;
 if p_amount<=0 or p_amount>10000000 or length(trim(p_reference))<3 then raise exception 'Invalid amount or reference'; end if;
 if (recipient.country='US' and p_currency<>'usd') or (recipient.country='PH' and p_currency not in ('usd','php')) or (recipient.country='PK' and p_currency not in ('usd','pkr')) then raise exception 'Currency does not match recipient'; end if;
 if recipient.kind='contractor' then
  select * into j from assignment_blocks where id=p_assignment for update;
  if j.id is null or coalesce(j.claimed_by,j.assigned_to) is distinct from recipient.contractor_id then raise exception 'Choose an assignment belonging to this contractor'; end if;
  if j.status not in ('completed','approved') or coalesce(j.metadata->>'is_test','false')='true' then raise exception 'Only completed real assignments can be paid'; end if;
  if coalesce(j.paid_out,false) or j.paid_at is not null or 'paid'=any(array[j.payment_status,j.pay_status,j.payout_status,j.quickbooks_payment_status,j.metadata->'payment'->>'status']) then raise exception 'Assignment already paid'; end if;
  amount=round(greatest(0,coalesce(j.pay_amount,0)+coalesce(nullif(j.metadata->'payment'->>'added_fee_amount','')::numeric,0)-coalesce(nullif(j.metadata->'payment'->>'fee_amount','')::numeric,0))*100);
  if p_currency<>'usd' or amount<>p_amount then raise exception 'Pay amount changed. Refresh before reviewing'; end if;
  insert into contractor_payouts(assignment_id,contractor_id,actor_id,method,amount_cents,destination,reference) values(j.id,recipient.contractor_id,p_actor,'global',amount,recipient.stripe_account,p_reference) returning id into ledger;
 elsif p_assignment is not null then raise exception 'Assistant payments cannot claim cleaning assignments'; end if;
 insert into global_payout_requests(recipient_id,assignment_id,ledger_id,recipient_account,financial_account,amount_cents,currency,reference,created_by) values(recipient.id,p_assignment,ledger,recipient.stripe_account,p_financial,p_amount,p_currency,p_reference,p_actor) returning * into r;
 return r;
end $$;
create function public.prepare_global_payout(p_actor uuid,p_id uuid) returns public.global_payout_requests language plpgsql security invoker set search_path=public as $$
declare r global_payout_requests;
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin' and status='active') then raise exception 'Active admin required'; end if;
 select * into r from global_payout_requests where id=p_id for update;
 if r.id is null or r.status not in ('draft','preparing','review') then raise exception 'Payment cannot be prepared'; end if;
 update global_payout_requests set prepared_at=coalesce(prepared_at,now()),status=case when stripe_intent is null then 'preparing' else 'review' end,updated_at=now() where id=p_id returning * into r;return r;
end $$;
create function public.approve_global_payout(p_actor uuid,p_id uuid,p_review jsonb) returns public.global_payout_requests language plpgsql security invoker set search_path=public as $$
declare r global_payout_requests;
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin' and status='active') then raise exception 'Active admin required'; end if;
 select * into r from global_payout_requests where id=p_id for update;
 if r.id is null or r.status<>'review' or r.stripe_intent is null then raise exception 'Payment is not awaiting approval'; end if;
 update global_payout_requests set status='approved',approved_by=p_actor,approved_at=now(),approval_snapshot=p_review,updated_at=now() where id=p_id returning * into r;return r;
end $$;
create function public.sync_global_payout(p_id uuid,p_status text,p_detail jsonb) returns public.global_payout_requests language plpgsql security invoker set search_path=public as $$
declare r global_payout_requests;
begin
 select * into r from global_payout_requests where id=p_id for update;
 if r.id is null or r.stripe_intent is null then raise exception 'Stripe record missing'; end if;
 if p_status not in ('pending','processing','posted','requires_action','canceled') then raise exception 'Unknown Stripe state'; end if;
 update global_payout_requests set status=case when p_status='requires_action' and approved_at is null and p_detail->>'type'='confirm' then 'review' else p_status end,status_detail=p_detail,updated_at=now() where id=p_id returning * into r;
 if r.ledger_id is not null and p_status='posted' then
  update contractor_payouts set status='completed',completed_at=now() where id=r.ledger_id;
  update assignment_blocks set payment_status='paid',pay_status='paid',payout_status='paid',paid_out=true,paid_at=now(),paid_by=r.approved_by,paid_amount=r.amount_cents/100.0,paid_notes='Stripe Global Payouts posted: '||r.stripe_intent,
   metadata=jsonb_set(coalesce(metadata,'{}'),'{payment}',coalesce(metadata->'payment','{}')||jsonb_build_object('status','paid','source','global','payout_record_id',r.ledger_id,'stripe_intent',r.stripe_intent,'paid_amount',r.amount_cents/100.0)) where id=r.assignment_id;
 end if;
 -- Failed/returned payments stay reserved for admin reconciliation. Never automatically retry or release the job.
 return r;
end $$;
revoke all on function public.draft_global_payout(uuid,uuid,uuid,bigint,text,text,text),public.prepare_global_payout(uuid,uuid),public.approve_global_payout(uuid,uuid,jsonb),public.sync_global_payout(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.draft_global_payout(uuid,uuid,uuid,bigint,text,text,text),public.prepare_global_payout(uuid,uuid),public.approve_global_payout(uuid,uuid,jsonb),public.sync_global_payout(uuid,text,jsonb) to service_role;
create or replace function public.finish_contractor_payout(p_id uuid,p_transfer text default null) returns public.contractor_payouts
language plpgsql security invoker set search_path=public as $$
declare r public.contractor_payouts;
begin
 select * into r from contractor_payouts where id=p_id for update;
 if r.id is null then raise exception 'Payment not found'; end if;
 if r.method='global' then raise exception 'Use Global Payouts status verification'; end if;
 if r.status='completed' then return r; end if;
 if r.method='stripe' and (p_transfer is null or p_transfer not like 'tr_%') then raise exception 'Stripe transfer confirmation required'; end if;
 update contractor_payouts set status='completed',stripe_transfer_id=p_transfer,completed_at=now() where id=p_id returning * into r;
 update assignment_blocks set payment_status='paid',pay_status='paid',payout_status='paid',paid_out=true,paid_at=now(),paid_by=r.actor_id,paid_amount=r.amount_cents/100.0,paid_notes=case when r.method='stripe' then 'Stripe transfer '||p_transfer||' (bank payout follows Stripe schedule)' else r.reference end,
 metadata=jsonb_set(coalesce(metadata,'{}'),'{payment}',coalesce(metadata->'payment','{}')||jsonb_build_object('status','paid','paid_amount',r.amount_cents/100.0,'paid_at',now(),'source',r.method,'payout_record_id',r.id,'stripe_transfer_id',p_transfer)) where id=r.assignment_id;
 return r;
end $$;
