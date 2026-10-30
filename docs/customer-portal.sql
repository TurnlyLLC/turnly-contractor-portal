-- Server-only operations; authenticated callers are authorized by the portal API.
create table public.customer_portal_events (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.referral_bookings(id),
 action text not null, actor text not null, data jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.customer_portal_events enable row level security;
revoke all on public.customer_portal_events from public,anon,authenticated;
grant select,insert on public.customer_portal_events to service_role;
create index customer_portal_events_booking on public.customer_portal_events(booking_id,created_at desc);

create function public.customer_portal_change(p_id uuid,p_email text,p_uid uuid,p_op text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare b referral_bookings; j assignment_blocks; new_date date; start_time time; end_time time; charge timestamptz;
begin
 select * into b from referral_bookings where id=p_id and assignment_deleted_at is null for update;
 if not found then raise exception 'Booking unavailable'; end if;
 if p_op<>'card' and not ((p_uid is null and p_email is not null and b.email=p_email) or
  (p_uid is not null and exists(select 1 from residential_referral_links where user_id=p_uid and booking_id=p_id))) then
  raise exception 'Booking unavailable';
 end if;
 select * into j from assignment_blocks where id=p_id for update;
 if b.status not in ('requested','review_required','awaiting_card','scheduled','needs_reschedule') or
  coalesce(j.status,'pending') in ('en_route','in_progress','qa_pending','completed','cancelled') then raise exception 'Visit no longer editable'; end if;
 if p_op<>'notes' and (b.payment_status not in ('not_collected','card_saved','action_required') or
  (b.status<>'needs_reschedule' and b.charge_at<=now())) then raise exception 'Payment is already due'; end if;
 if p_op='reschedule' then
  new_date:=(p_data->>'service_date')::date; start_time:=(p_data->>'arrival_start')::time; end_time:=(p_data->>'arrival_end')::time;
  if new_date is null or start_time is null or end_time is null or new_date<=(now() at time zone 'America/New_York')::date or end_time<=start_time then raise exception 'Choose a future arrival window'; end if;
  charge:=(new_date+least(start_time,'06:00'::time)) at time zone 'America/New_York';
  update referral_bookings set service_date=new_date,arrival_start=start_time,arrival_end=end_time,charge_at=charge,
   status=case when status='needs_reschedule' then case when stripe_payment_method is null then 'requested' else 'scheduled' end else status end where id=p_id;
  update assignment_blocks set start_window=(new_date+start_time) at time zone 'America/New_York',end_window=(new_date+end_time) at time zone 'America/New_York',
   status='pending',assigned_to=null,claimed_by=null,assigned_to_name=null,claimed_by_name=null,visibility='pending',
   metadata=coalesce(metadata,'{}')||jsonb_build_object('customer_rescheduled_at',now(),'admin_approval_status','pending') where id=p_id;
 elsif p_op='cancel' then
  update referral_bookings set status='cancelled',notes=concat_ws(E'\n',notes,'Cancelled by customer: '||left(coalesce(p_data->>'reason',''),300)) where id=p_id;
  update assignment_blocks set status='cancelled',visibility='closed' where id=p_id;
 elsif p_op='notes' then
  update referral_bookings set notes=left(coalesce(p_data->>'notes',''),1500) where id=p_id;
  update assignment_blocks set special_instructions=left(coalesce(p_data->>'notes',''),1500) where id=p_id;
 elsif p_op='card' then
  if p_data->>'customer' is distinct from b.stripe_customer or coalesce(p_data->>'payment_method','') !~ '^pm_[A-Za-z0-9]+$' then raise exception 'Card mismatch'; end if;
  if b.stripe_payment_method=p_data->>'payment_method' then return jsonb_build_object('ok',true); end if;
  update referral_bookings set stripe_payment_method=p_data->>'payment_method',payment_status='card_saved',
   status=case when status='awaiting_card' then 'scheduled' else status end where id=p_id;
 else raise exception 'Unsupported change'; end if;
 insert into customer_portal_events(booking_id,action,actor,data) values(p_id,p_op,coalesce(p_uid::text,p_email,'stripe'),
  case when p_op='card' then jsonb_build_object('session',p_data->>'session') when p_op='reschedule' then jsonb_build_object('previous_date',b.service_date,'service_date',new_date) else '{}'::jsonb end);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.customer_portal_change(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.customer_portal_change(uuid,text,uuid,text,jsonb) to service_role;

create function public.customer_portal_rebook(p_anchor uuid,p_email text,p_uid uuid,p_request text,p_data jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare b referral_bookings; new_id uuid; d date; s time; e time;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request,0));
 select * into b from referral_bookings where id=p_anchor and assignment_deleted_at is null;
 if not found or not ((p_uid is null and p_email is not null and b.email=p_email) or
  (p_uid is not null and exists(select 1 from residential_referral_links where user_id=p_uid and booking_id=p_anchor))) then raise exception 'Booking unavailable'; end if;
 select id into new_id from referral_bookings where request_hash=p_request;
 if found then return new_id; end if;
 if b.stripe_customer is null or b.stripe_payment_method is null then raise exception 'Save a payment card first'; end if;
 d:=(p_data->>'service_date')::date;s:=(p_data->>'arrival_start')::time;e:=(p_data->>'arrival_end')::time;
 if d is null or s is null or e is null or d<=(now() at time zone 'America/New_York')::date or e<=s then raise exception 'Choose a future arrival window'; end if;
 new_id:=gen_random_uuid();
 insert into referral_bookings(id,token_hash,request_hash,customer_id,agent_id,agent_name,referral_code,name,email,phone,profile_address,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,amount_cents,service_date,arrival_start,arrival_end,charge_at,status,notes,consent_text,consent_at,stripe_customer,stripe_payment_method,payment_status,visit_details)
 values(new_id,p_data->>'token_hash',p_request,b.customer_id,b.agent_id,b.agent_name,b.referral_code,b.name,b.email,b.phone,b.profile_address,b.property_address,b.city,b.state,b.zip,b.beds,b.baths,b.sqft,p_data->'quote'->>'service','once',p_data->'quote',(p_data->'quote'->>'amount_cents')::integer,d,s,e,(d+least(s,'06:00'::time)) at time zone 'America/New_York',
 case when (p_data->'quote'->>'review_required')::boolean then 'review_required' else 'scheduled' end,left(coalesce(p_data->>'notes',''),1500),p_data->>'consent_text',now(),b.stripe_customer,b.stripe_payment_method,'card_saved',b.visit_details);
 if p_uid is not null then insert into residential_referral_links(booking_id,user_id,method) values(new_id,p_uid,'customer_portal'); end if;
 insert into customer_portal_events(booking_id,action,actor,data) values(new_id,'book',coalesce(p_uid::text,p_email),jsonb_build_object('from_booking',p_anchor));
 return new_id;
end $$;
revoke all on function public.customer_portal_rebook(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.customer_portal_rebook(uuid,text,uuid,text,jsonb) to service_role;
