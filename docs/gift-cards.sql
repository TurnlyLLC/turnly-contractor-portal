-- Gift cards: additive schema; all money operations are service-role-only transactions.
create table public.gift_orders (
 id uuid primary key, token_hash text not null, request_hash text not null,
 email text not null, name text not null, quantity integer not null check(quantity between 1 and 25),
 amount_cents integer not null check(amount_cents=quantity*10000),
 terms_version text not null, terms_accepted_at timestamptz not null default now(),
 stripe_session text unique, payment_intent text unique,
 status text not null default 'pending' check(status in ('pending','paid','review','expired')),
 email_status text not null default 'pending', email_id text, email_attempted_at timestamptz,
 created_at timestamptz not null default now(), paid_at timestamptz
);
create table public.gift_cards (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.gift_orders(id),
 ordinal integer not null, code text unique not null check(code ~ '^[A-Z0-9]{24}$'),
 balance_cents integer not null default 10000 check(balance_cents between 0 and 10000),
 reserved_cents integer not null default 0 check(reserved_cents between 0 and balance_cents),
 status text not null default 'active' check(status in ('active','spent','suspended','refund_pending','refunded')),
 refund_id text, created_at timestamptz not null default now(), unique(order_id,ordinal)
);
create table public.gift_events (
 id uuid primary key default gen_random_uuid(), card_id uuid references public.gift_cards(id),
 order_id uuid not null references public.gift_orders(id), kind text not null,
 amount_cents integer, booking_id uuid references public.referral_bookings(id), actor uuid,
 details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index gift_events_card on public.gift_events(card_id,created_at);
create index gift_cards_order on public.gift_cards(order_id);
create index gift_orders_created on public.gift_orders(created_at desc);
create table public.gift_reservations (
 booking_id uuid primary key references public.referral_bookings(id), card_id uuid not null references public.gift_cards(id),
 amount_cents integer not null check(amount_cents>0), status text not null check(status in ('reserved','captured','released')),
 created_at timestamptz not null default now()
);
create index gift_reservations_card on public.gift_reservations(card_id);
alter table public.gift_orders enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_events enable row level security;
alter table public.gift_reservations enable row level security;
revoke all on public.gift_orders,public.gift_cards,public.gift_events,public.gift_reservations from public,anon,authenticated;
grant all on public.gift_orders,public.gift_cards,public.gift_events,public.gift_reservations to service_role;
revoke update,delete on public.gift_events from service_role;
alter table public.referral_customers alter column agent_id drop not null;
alter table public.referral_bookings alter column agent_id drop not null;
alter table public.referral_bookings add column gift_applied_cents integer not null default 0 check(gift_applied_cents>=0 and gift_applied_cents<=amount_cents);

create function public.gift_issue(p_order uuid,p_session text,p_intent text,p_codes jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare o gift_orders; c gift_cards; n integer=0; v text;
begin
 select * into o from gift_orders where id=p_order for update;
 if not found or o.stripe_session<>p_session then raise exception 'Order mismatch'; end if;
 if o.status='paid' then return; end if;
 if o.status<>'pending' or jsonb_array_length(p_codes)<>o.quantity then raise exception 'Order requires review'; end if;
 update gift_orders set status='paid',payment_intent=p_intent,paid_at=now() where id=o.id;
 for v in select jsonb_array_elements_text(p_codes) loop
  n=n+1; insert into gift_cards(order_id,ordinal,code) values(o.id,n,v) returning * into c;
  insert into gift_events(card_id,order_id,kind,amount_cents) values(c.id,o.id,'issued',10000);
 end loop;
end $$;

create function public.gift_reserve(p_booking uuid,p_code text) returns integer
language plpgsql security invoker set search_path=public as $$
declare b referral_bookings; c gift_cards; r gift_reservations; v integer;
begin
 select * into b from referral_bookings where id=p_booking for update;
 select * into c from gift_cards where code=p_code for update;
 if c.id is null or c.status<>'active' then raise exception 'Gift card is unavailable'; end if;
 select * into r from gift_reservations where booking_id=p_booking;
 if found then
  if r.card_id<>c.id or r.status='released' then raise exception 'Start a new booking'; end if;
  return r.amount_cents;
 end if;
 if b.id is null or b.state<>'NC' or b.status not in ('awaiting_card','requested','review_required') then raise exception 'Booking is not eligible'; end if;
 v=least(b.amount_cents,c.balance_cents-c.reserved_cents);
 if v<=0 then raise exception 'Gift card balance is already reserved'; end if;
 update gift_cards set reserved_cents=reserved_cents+v where id=c.id;
 insert into gift_reservations values(b.id,c.id,v,'reserved',now());
 update referral_bookings set gift_applied_cents=v where id=b.id;
 insert into gift_events(card_id,order_id,kind,amount_cents,booking_id) values(c.id,c.order_id,'reserved',v,b.id);
 return v;
end $$;

create function public.gift_settle(p_booking uuid,p_capture boolean) returns void
language plpgsql security invoker set search_path=public as $$
declare b referral_bookings; r gift_reservations; c gift_cards;
begin
 select * into b from referral_bookings where id=p_booking for update;
 select * into r from gift_reservations where booking_id=p_booking for update;
 if not found or r.status<>'reserved' then return; end if;
 select * into c from gift_cards where id=r.card_id for update;
 if p_capture then
  if c.status<>'active' then raise exception 'Gift card needs review'; end if;
  update gift_cards set balance_cents=balance_cents-r.amount_cents,reserved_cents=reserved_cents-r.amount_cents,
   status=case when balance_cents=r.amount_cents then 'spent' else 'active' end where id=c.id;
 else
  update gift_cards set reserved_cents=reserved_cents-r.amount_cents where id=c.id;
 end if;
 update gift_reservations set status=case when p_capture then 'captured' else 'released' end where booking_id=b.id;
 insert into gift_events(card_id,order_id,kind,amount_cents,booking_id) values(c.id,c.order_id,case when p_capture then 'redeemed' else 'released' end,r.amount_cents,b.id);
 if p_capture and c.balance_cents=r.amount_cents then
  insert into gift_events(card_id,order_id,kind,booking_id) values(c.id,c.order_id,'fully_used',b.id);
 end if;
end $$;

create function public.gift_booking_lifecycle() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.payment_status='paid' and old.payment_status is distinct from 'paid' then perform gift_settle(new.id,true);
 elsif (new.status in ('cancelled','needs_reschedule') or new.assignment_deleted_at is not null) and new.payment_status not in ('charging','processing','paid','uncertain','adjusted') then perform gift_settle(new.id,false);
 end if;
 return new;
end $$;
create trigger gift_booking_lifecycle after update on public.referral_bookings for each row execute function public.gift_booking_lifecycle();

create function public.gift_refund_lock(p_card uuid,p_actor uuid,p_reason text) returns public.gift_cards
language plpgsql security invoker set search_path=public as $$
declare c gift_cards;
begin
 select * into c from gift_cards where id=p_card for update;
 if c.status='refund_pending' then return c; end if;
 if c.id is null or c.status<>'active' or c.balance_cents<>10000 or c.reserved_cents<>0 or length(trim(p_reason))<10 then raise exception 'Only completely unused, unreserved cards qualify; record why service cannot be provided'; end if;
 update gift_cards set status='refund_pending' where id=c.id returning * into c;
 insert into gift_events(card_id,order_id,kind,actor,details) values(c.id,c.order_id,'refund_requested',p_actor,jsonb_build_object('reason',p_reason));
 return c;
end $$;

create function public.gift_refund_finish(p_card uuid,p_refund text) returns void
language plpgsql security invoker set search_path=public as $$
declare c gift_cards;
begin
 select * into c from gift_cards where id=p_card for update;
 if c.status='refunded' then return; end if;
 if c.status<>'refund_pending' then raise exception 'Refund not pending'; end if;
 update gift_cards set status='refunded',balance_cents=0,refund_id=p_refund where id=c.id;
 insert into gift_events(card_id,order_id,kind,amount_cents,details) values(c.id,c.order_id,'refunded',10000,jsonb_build_object('stripe_refund',p_refund));
end $$;

create function public.gift_freeze_order(p_order uuid,p_reason text) returns void
language plpgsql security invoker set search_path=public as $$
declare c gift_cards;
begin
 perform 1 from gift_orders where id=p_order for update;
 update gift_orders set status='review' where id=p_order;
 for c in select * from gift_cards where order_id=p_order and status in ('active','spent') for update loop
  update gift_cards set status='suspended' where id=c.id;
  insert into gift_events(card_id,order_id,kind,details) values(c.id,c.order_id,'suspended',jsonb_build_object('reason',p_reason));
 end loop;
end $$;

revoke all on function public.gift_issue(uuid,text,text,jsonb),public.gift_reserve(uuid,text),public.gift_settle(uuid,boolean),public.gift_booking_lifecycle(),public.gift_refund_lock(uuid,uuid,text),public.gift_refund_finish(uuid,text),public.gift_freeze_order(uuid,text) from public,anon,authenticated;
grant execute on function public.gift_issue(uuid,text,text,jsonb),public.gift_reserve(uuid,text),public.gift_settle(uuid,boolean),public.gift_booking_lifecycle(),public.gift_refund_lock(uuid,uuid,text),public.gift_refund_finish(uuid,text),public.gift_freeze_order(uuid,text) to service_role;

create function public.create_gift_booking(p_id uuid,p_token text,p_hash text,p_gift text,p_data jsonb,p_status text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c referral_customers; a referral_agents; prior referral_bookings;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into prior from referral_bookings where id=p_id;
 if found then
   if prior.token_hash<>p_token or prior.request_hash<>p_hash then raise exception 'Booking request changed. Start a new checkout.'; end if;
   return prior.id;
 end if;
 if p_data->>'gift_expected_cents' is null then raise exception 'Refresh your quote'; end if;
 if p_data->>'state'<>'NC' then raise exception 'Gift cards are valid only in NC'; end if;
 if not exists(select 1 from gift_cards where code=p_gift and status='active') then raise exception 'Gift card unavailable'; end if;
 if not exists(select 1 from referral_customers where email=p_data->>'email' or phone=p_data->>'phone') then
 insert into referral_customers(name,email,phone) values(p_data->>'name',p_data->>'email',p_data->>'phone'); end if;
 select * into c from referral_customers where email=p_data->>'email' or phone=p_data->>'phone' order by created_at,id limit 1;
 select * into a from referral_agents where id=c.agent_id;
 insert into referral_bookings(id,token_hash,request_hash,customer_id,agent_id,agent_name,referral_code,name,email,phone,profile_address,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,amount_cents,service_date,arrival_start,arrival_end,charge_at,status,notes,visit_details,consent_text,consent_at)
 values(p_id,p_token,p_hash,c.id,a.id,coalesce(a.name,'Turnly gift card'),coalesce(a.referral_code,''),p_data->>'name',p_data->>'email',p_data->>'phone',p_data->>'profile_address',p_data->>'property_address',p_data->>'city',p_data->>'state',p_data->>'zip',(p_data->>'beds')::integer,(p_data->>'baths')::numeric,(p_data->>'sqft')::integer,p_data->>'service',p_data->>'frequency',p_data->'quote',(p_data->>'amount_cents')::integer,(p_data->>'service_date')::date,(p_data->>'arrival_start')::time,(p_data->>'arrival_end')::time,(p_data->>'charge_at')::timestamptz,p_status,p_data->>'notes',coalesce(p_data->'visit_details','{}'::jsonb),p_consent,case when p_consent is not null then now() end);
 if gift_reserve(p_id,p_gift)<>(p_data->>'gift_expected_cents')::integer then raise exception 'Gift balance changed. Refresh your quote before booking.'; end if;
 return p_id;
end $$;
revoke all on function public.create_gift_booking(uuid,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_gift_booking(uuid,text,text,text,jsonb,text,text) to service_role;

