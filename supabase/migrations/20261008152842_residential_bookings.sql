-- Private booking records. Customer access is through a hashed, high-entropy receipt token.
create table public.referral_bookings (
 id uuid primary key, token_hash text not null, request_hash text not null,
 customer_id uuid not null references public.referral_customers(id),
 agent_id uuid not null references public.referral_agents(id), agent_name text not null, referral_code text not null,
 name text not null,email text not null,phone text not null,profile_address text not null,
 property_address text not null,city text not null,state text not null,zip text not null,
 beds integer not null check(beds between 0 and 30),baths numeric not null check(baths between .5 and 30),sqft integer not null check(sqft between 100 and 50000),
 service text not null check(service in ('standard','deep','move','listing')),
 frequency text not null check(frequency in ('once','monthly','biweekly','weekly')),
 quote jsonb not null,amount_cents integer not null check(amount_cents>0),
 service_date date not null,arrival_start time not null,arrival_end time not null check(arrival_end>arrival_start),charge_at timestamptz not null,
 status text not null check(status in ('requested','review_required','awaiting_card','scheduled','completed','cancelled','needs_reschedule')),
 notes text not null default '',consent_text text,consent_at timestamptz,
 stripe_customer text,stripe_session text unique,stripe_payment_method text,stripe_payment_intent text unique,
 payment_status text not null default 'not_collected' check(payment_status in ('not_collected','card_saved','charging','processing','paid','action_required','adjusted','uncertain')),
 charge_key uuid not null default gen_random_uuid(),charge_started_at timestamptz,charge_locked_at timestamptz,
 paid_at timestamptz,completed_at timestamptz,completed_by uuid references auth.users(id),cancelled_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 check(status not in ('scheduled','completed') or stripe_payment_method is not null)
);
create index referral_bookings_due on public.referral_bookings(charge_at) where status='scheduled' and payment_status in ('card_saved','charging','processing');
create index referral_bookings_created on public.referral_bookings(created_at desc);
create index referral_bookings_customer on public.referral_bookings(customer_id);
create index referral_bookings_agent on public.referral_bookings(agent_id,service_date);
alter table public.referral_bookings enable row level security;
revoke all on public.referral_bookings from public,anon,authenticated;
grant all on public.referral_bookings to service_role;
alter table public.referral_customers add column first_booking_id uuid unique references public.referral_bookings(id);
alter table public.referral_customers add constraint referral_one_first_clean check(first_booking_id is null or first_assignment_id is null);

create function public.create_residential_booking(p_id uuid,p_token text,p_hash text,p_code text,p_data jsonb,p_status text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c referral_customers; a referral_agents; prior referral_bookings;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into prior from referral_bookings where id=p_id;
 if found then
   if prior.token_hash<>p_token or prior.request_hash<>p_hash then raise exception 'Booking request changed. Start a new checkout.'; end if;
   return prior.id;
 end if;
 perform register_agent_referral(p_code,p_data->>'name',p_data->>'email',p_data->>'phone',p_data->>'property_address',p_data->>'city',p_data->>'notes');
 select * into c from referral_customers where email=p_data->>'email' or phone=p_data->>'phone' order by created_at,id limit 1;
 select * into a from referral_agents where id=c.agent_id;
 insert into referral_bookings(id,token_hash,request_hash,customer_id,agent_id,agent_name,referral_code,name,email,phone,profile_address,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,amount_cents,service_date,arrival_start,arrival_end,charge_at,status,notes,consent_text,consent_at)
 values(p_id,p_token,p_hash,c.id,a.id,a.name,a.referral_code,p_data->>'name',p_data->>'email',p_data->>'phone',p_data->>'profile_address',p_data->>'property_address',p_data->>'city',p_data->>'state',p_data->>'zip',(p_data->>'beds')::integer,(p_data->>'baths')::numeric,(p_data->>'sqft')::integer,p_data->>'service',p_data->>'frequency',p_data->'quote',(p_data->>'amount_cents')::integer,(p_data->>'service_date')::date,(p_data->>'arrival_start')::time,(p_data->>'arrival_end')::time,(p_data->>'charge_at')::timestamptz,p_status,p_data->>'notes',p_consent,case when p_consent is not null then now() end);
 return p_id;
end $$;
revoke all on function public.create_residential_booking(uuid,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_residential_booking(uuid,text,text,text,jsonb,text,text) to service_role;

-- Lease due charges. A persisted key is reused for every retry; ambiguous charges are never recreated after Stripe's idempotency window.
create function public.claim_residential_charges() returns setof public.referral_bookings
language plpgsql security invoker set search_path=public as $$
begin
 update referral_bookings set payment_status='uncertain',charge_locked_at=null
 where status='scheduled' and payment_status in ('charging','processing') and charge_started_at<now()-interval '23 hours';
 return query update referral_bookings b set payment_status='charging',charge_started_at=coalesce(b.charge_started_at,now()),charge_locked_at=now()
 where b.id in(select id from referral_bookings
   where status='scheduled' and consent_at is not null and stripe_payment_method is not null
     and charge_at<=now() and service_date=(now() at time zone 'America/New_York')::date
     and payment_status in ('card_saved','charging','processing')
     and (charge_locked_at is null or charge_locked_at<now()-interval '10 minutes')
   order by charge_at limit 20 for update skip locked)
 returning b.*;
end $$;
revoke all on function public.claim_residential_charges() from public,anon,authenticated;
grant execute on function public.claim_residential_charges() to service_role;

create function public.finish_residential_booking(p_id uuid,p_actor uuid,p_cancel boolean default false) returns void
language plpgsql security invoker set search_path=public as $$
declare b referral_bookings; c referral_customers;
begin
 select * into b from referral_bookings where id=p_id for update;
 if not found then raise exception 'Booking not found'; end if;
 if p_cancel then
  if b.status='completed' or b.payment_status in ('charging','processing','paid','uncertain','adjusted') then raise exception 'Resolve the payment in Stripe before cancelling this booking'; end if;
  update referral_bookings set status='cancelled',cancelled_by=p_actor where id=p_id;
 else
  if b.status<>'scheduled' or b.service_date>(now() at time zone 'America/New_York')::date then raise exception 'Only a scheduled clean on or after its service date can be completed'; end if;
  select * into c from referral_customers where id=b.customer_id for update;
  update referral_bookings set status='completed',completed_at=now(),completed_by=p_actor where id=p_id;
  if c.first_assignment_id is null and c.first_booking_id is null and c.payout_at is null then
   update referral_customers set first_booking_id=p_id,eligible_subtotal=b.amount_cents/100.0,linked_by=p_actor where id=c.id;
  end if;
 end if;
end $$;
revoke all on function public.finish_residential_booking(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_residential_booking(uuid,uuid,boolean) to service_role;

-- Preserve existing view columns/order for the sales portal and add the residential booking reference last.
create or replace view public.referral_ledger with(security_invoker=true) as
select c.id,c.agent_id,c.lead_id,c.name,c.email,c.phone,c.first_assignment_id,c.eligible_subtotal,c.manual_paid_at,c.payment_reference,c.linked_by,c.payout_at,c.payout_reference,c.payout_amount,c.payout_by,c.created_at,
 a.name as agent_name,a.referral_code,coalesce(b.status,j.status) as clean_status,
 (case when b.id is not null then b.status='completed' else lower(coalesce(j.status,'')) in ('completed','complete','done','closed') end) as clean_completed,
 (case when b.id is not null then b.payment_status='paid' and b.paid_at is not null else c.manual_paid_at is not null or (q.quickbooks_status='paid' and q.quickbooks_balance=0 and q.paid_at is not null) end) as customer_paid,
 round(coalesce(c.eligible_subtotal,0)*.10,2) as bonus_amount,
 case when c.payout_at is not null then 'paid'
 when c.eligible_subtotal is not null and ((b.status='completed' and b.payment_status='paid' and b.paid_at is not null) or
 (b.id is null and lower(coalesce(j.status,'')) in ('completed','complete','done','closed') and (c.manual_paid_at is not null or (q.quickbooks_status='paid' and q.quickbooks_balance=0 and q.paid_at is not null)))) then 'earned' else 'pending' end as bonus_status,
 c.first_booking_id
from referral_customers c join referral_agents a on a.id=c.agent_id
left join referral_bookings b on b.id=c.first_booking_id
left join assignment_blocks j on j.id=c.first_assignment_id
left join quickbooks_invoice_links q on q.id=j.quickbooks_invoice_link_id;
revoke all on public.referral_ledger from public,anon,authenticated;
grant select on public.referral_ledger to service_role;
notify pgrst,'reload schema';
