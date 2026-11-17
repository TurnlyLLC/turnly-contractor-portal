create or replace function integration_booking_snapshot(p_actor uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b referral_bookings;j assignment_blocks;g gift_reservations;c gift_cards;plan customer_recurring_plans;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 select * into b from referral_bookings where id=p_id;if b.id is null then raise exception 'booking_not_found';end if;
 select * into j from assignment_blocks where id=p_id;select * into g from gift_reservations where booking_id=p_id;if g.card_id is not null then select * into c from gift_cards where id=g.card_id;end if;
 select * into plan from customer_recurring_plans where id=b.recurring_plan_id;
 return jsonb_build_object('plan',case when plan.id is not null then to_jsonb(plan) end,'plan_revision',md5(to_jsonb(plan)::text),'booking',to_jsonb(b),'assignment',case when j.id is not null then to_jsonb(j) end,'gift',case when g.card_id is not null then to_jsonb(g) end,'card',case when c.id is not null then to_jsonb(c) end,'revision',md5(to_jsonb(b)::text),'gift_revision',md5(jsonb_build_array(to_jsonb(g),to_jsonb(c))::text));
end $$;
revoke all on function integration_booking_snapshot(uuid,uuid) from public,anon,authenticated;grant execute on function integration_booking_snapshot(uuid,uuid) to service_role;

create or replace function integration_booking_amend(p_actor uuid,p_id uuid,p_review jsonb,p_booking jsonb,p_assignment jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b referral_bookings;j assignment_blocks;g gift_reservations;c gift_cards;plan customer_recurring_plans;newb referral_bookings;amount integer;applied integer;pay numeric;plan_paused boolean:=false;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 select * into b from referral_bookings where id=p_id for update;
 select * into j from assignment_blocks where id=p_id for update;
 select * into g from gift_reservations where booking_id=p_id for update;if g.card_id is not null then select * into c from gift_cards where id=g.card_id for update;end if;
 select * into plan from customer_recurring_plans where id=b.recurring_plan_id for update;
 if b.id is null or md5(to_jsonb(plan)::text) is distinct from p_review->>'plan_revision' or md5(to_jsonb(b)::text) is distinct from p_review->>'revision' or j.updated_at is distinct from (p_review->>'assignment_revision')::timestamptz or md5(jsonb_build_array(to_jsonb(g),to_jsonb(c))::text) is distinct from p_review->>'gift_revision' then raise exception 'booking_changed_preview_again';end if;
 if b.assignment_deleted_at is not null or b.status not in ('requested','review_required','awaiting_card','scheduled','needs_reschedule') or b.payment_status not in ('not_collected','card_saved','action_required') or b.paid_at is not null or b.stripe_payment_intent is not null or b.charge_locked_at is not null or b.charge_started_at is not null or b.charge_at<=now() then raise exception 'payment_or_booking_no_longer_editable';end if;
 if j.id is not null and (j.metadata->>'source' is distinct from 'residential_booking' or j.started_at is not null or j.completed_at is not null or j.paid_at is not null or j.paid_out or j.status not in ('pending','open','preferred_pending','claimed','scheduled')) or exists(select 1 from contractor_payouts where assignment_id=p_id) or exists(select 1 from global_payout_requests where assignment_id=p_id) then raise exception 'assignment_or_payout_requires_reconciliation';end if;
 amount:=(p_booking->>'amount_cents')::integer;
 if amount is null or amount<=0 or amount is distinct from (p_review->>'amount_cents')::integer or (p_booking->'quote'->>'amount_cents')::integer is distinct from amount then raise exception 'invalid_quote';end if;
 if g.card_id is not null then
  if g.status<>'reserved' or c.status<>'active' or g.amount_cents is distinct from b.gift_applied_cents then raise exception 'gift_requires_reconciliation';end if;
  applied:=least(amount,c.balance_cents-c.reserved_cents+g.amount_cents);
  if applied is distinct from (p_review->>'gift_applied_cents')::integer then raise exception 'gift_changed_preview_again';end if;
  update gift_cards set reserved_cents=reserved_cents-g.amount_cents+applied where id=c.id;
  update gift_reservations set amount_cents=applied where booking_id=p_id;
 else applied:=0;end if;
 newb:=jsonb_populate_record(null::referral_bookings,p_booking);
 update referral_bookings set property_address=newb.property_address,city=newb.city,state=newb.state,zip=newb.zip,beds=newb.beds,baths=newb.baths,sqft=newb.sqft,service=newb.service,frequency=newb.frequency,visit_details=newb.visit_details,notes=newb.notes,quote=newb.quote,amount_cents=amount,gift_applied_cents=applied,charge_key=gen_random_uuid() where id=p_id;
 pay:=case when j.metadata->>'contractor_pay_override'='true' then j.pay_amount else round(amount*0.36)/100 end;
 if pay is distinct from (p_review->>'contractor_pay')::numeric then raise exception 'pay_changed_preview_again';end if;
 if j.id is not null then
  update assignment_blocks set address=p_assignment->>'address',service_type=p_assignment->>'service_type',scope=p_assignment->>'scope',special_instructions=p_assignment->>'special_instructions',pay_amount=pay,status='pending',visibility='pending',assigned_to=null,assigned_to_name=null,claimed_by=null,claimed_by_name=null,
   property_checklist_items=coalesce(p_assignment->'property_checklist_items','[]'::jsonb),materials_list=null,materials_template_id=null,
   metadata=(coalesce(metadata,'{}'::jsonb)-array['checklist_template_id','checklist_template_name','checklist_item_count','checklist_reviewed_at','checklist_reviewed_by','approved_at','approved_by'])||coalesce(p_assignment->'metadata','{}')||jsonb_build_object('admin_approval_status','pending','last_admin_amendment',jsonb_build_object('actor',p_actor,'at',clock_timestamp(),'reason',p_review->>'reason','previous_booking',to_jsonb(b)-array['token_hash','request_hash','stripe_payment_method','stripe_customer','stripe_session','stripe_payment_intent'],'previous_assignment',jsonb_build_object('assigned_to',j.assigned_to,'claimed_by',j.claimed_by,'pay_amount',j.pay_amount,'status',j.status,'checklist',j.property_checklist_items))),updated_at=clock_timestamp() where id=p_id;
 end if;
 if plan.latest_booking_id=p_id and plan.status='active' then update customer_recurring_plans set status='needs_review',review_reason='Booking scope amended by administrator. Confirm future scope, price and customer authorization before resuming.' where id=plan.id;plan_paused:=true;end if;
 insert into customer_portal_events(booking_id,action,actor,data) values(p_id,'admin_amendment',p_actor::text,jsonb_build_object('reason',p_review->>'reason','previous_amount_cents',b.amount_cents,'amount_cents',amount,'previous_gift_cents',b.gift_applied_cents,'gift_applied_cents',applied,'customer_acceptance_fabricated',false));
 return jsonb_build_object('id',p_id,'saved',true,'amount_cents',amount,'gift_applied_cents',applied,'card_charge_cents',amount-applied,'contractor_pay',pay,'assignment_status',case when j.id is not null then 'pending' end,'charged_now',false,'customer_email_sent',false,'future_recurring_visits_changed',false,'recurring_renewal_paused',plan_paused);
end $$;
revoke all on function integration_booking_amend(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;grant execute on function integration_booking_amend(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

create table if not exists public.owner_assistant_diagnostics(id uuid primary key,agent_id text not null,conversation_id text,state text not null default 'running' check(state in ('running','done','unknown')),reserved_cents integer not null check(reserved_cents between 1 and 100),actual_cents numeric check(actual_cents>=0),created_at timestamptz not null default now(),finished_at timestamptz,billing_checked_at timestamptz);
alter table public.owner_assistant_diagnostics enable row level security;
revoke all on public.owner_assistant_diagnostics from public,anon,authenticated;
grant all on public.owner_assistant_diagnostics to service_role;
CREATE OR REPLACE FUNCTION public.owner_assistant_reserved()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select ceil(coalesce((select fixed_cents+case when setup_month=date_trunc('month',now() at time zone 'America/New_York')::date then setup_cents else 0 end+case when stream_month=date_trunc('month',now() at time zone 'America/New_York')::date then stream_cents else 0 end from owner_sms_settings where id),500)
 +coalesce((select sum(case when state in ('completed','failed') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_voice_sessions where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state in ('done','uncertain','blocked') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_sms_messages where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state='reserved' then reserved_cents else coalesce(actual_cents,charged_cents,reserved_cents) end) from communication_usage where source='A.L.I.C.E. external message' and created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(coalesce(actual_cents,reserved_cents)) from owner_assistant_diagnostics where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0))::integer;
$function$;


create or replace function owner_assistant_diagnostic_reserve(p_id uuid,p_agent text,p_cents integer default 50)returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));perform pg_advisory_xact_lock(hashtext('turnly-private-owner-sms'));
 if p_cents not between 1 and 100 or owner_assistant_reserved()+p_cents>2500 then raise exception 'Alice shared monthly allowance reached';end if;
 insert into owner_assistant_diagnostics(id,agent_id,reserved_cents) values(p_id,p_agent,p_cents);return p_id;
end $$;
revoke all on function owner_assistant_diagnostic_reserve(uuid,text,integer) from public,anon,authenticated;grant execute on function owner_assistant_diagnostic_reserve(uuid,text,integer) to service_role;
