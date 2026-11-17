create table if not exists public.integration_credential_handoffs(id uuid primary key,actor uuid not null references profiles(id),connection_id uuid not null,kind text not null,secret_sealed text not null,expires_at timestamptz not null default now()+interval '1 hour',claimed_at timestamptz,created_at timestamptz not null default now());
alter table public.integration_credential_handoffs enable row level security;
revoke all on public.integration_credential_handoffs from public,anon,authenticated;
grant all on public.integration_credential_handoffs to service_role;
create or replace function public.integration_create_connection(p_actor uuid,p_parent uuid,p_kind text,p_data jsonb,p_handoff uuid,p_secret text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare parent integration_keys; scopes text[];
begin
 select * into parent from integration_keys where id=p_parent and created_by=p_actor and revoked_at is null and (expires_at is null or expires_at>now()) for share;
 if parent.id is null or not 'platform:full'=any(parent.scopes) or not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_full_admin_required';end if;
 if p_kind='key_create' then
  select array_agg(value) into scopes from jsonb_array_elements_text(p_data->'scopes');
  if coalesce(cardinality(scopes),0)=0 or (p_data->>'expires_at')::timestamptz>now()+interval '366 days' or (p_data->>'expires_at')::timestamptz<=now() then raise exception 'invalid_key';end if;
  insert into integration_keys(id,name,secret_hash,prefix,scopes,created_by,expires_at,deny_record_deletion) values((p_data->>'id')::uuid,p_data->>'name',p_data->>'secret_hash',p_data->>'prefix',scopes,p_actor,(p_data->>'expires_at')::timestamptz,parent.deny_record_deletion or coalesce((p_data->>'deny_record_deletion')::boolean,false));
 elsif p_kind='hook_create' then
  insert into integration_hooks(id,name,url,events,created_by,secret_encrypted) values((p_data->>'id')::uuid,p_data->>'name',p_data->>'url',array(select jsonb_array_elements_text(p_data->'events')),p_actor,p_data->>'secret_encrypted');
 else raise exception 'unsupported_connection';end if;
 insert into integration_credential_handoffs(id,actor,connection_id,kind,secret_sealed) values(p_handoff,p_actor,(p_data->>'id')::uuid,p_kind,p_secret);
 return jsonb_build_object('id',p_data->>'id');
end $$;
revoke all on function integration_create_connection(uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated;grant execute on function integration_create_connection(uuid,uuid,text,jsonb,uuid,text) to service_role;
create or replace function public.integration_claim_handoff(p_actor uuid,p_id uuid) returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare secret text;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 update integration_credential_handoffs set claimed_at=clock_timestamp() where id=p_id and actor=p_actor and expires_at>now() and claimed_at is null returning secret_sealed into secret;
 if secret is null then raise exception 'credential_already_claimed_or_expired';end if;
 return secret;
end $$;
revoke all on function integration_claim_handoff(uuid,uuid) from public,anon,authenticated;grant execute on function integration_claim_handoff(uuid,uuid) to service_role;

create or replace function public.integration_sales_control(p_actor uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous text:=current_setting('request.jwt.claim.sub',true); n integer; before_settings jsonb; merged jsonb; rep uuid:=(p_input->>'rep')::uuid;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 case p_operation
  when 'allocate' then n:=crm_allocate_region(array(select value::uuid from jsonb_array_elements_text(p_input->'operator_ids')),(p_input->>'count')::integer,coalesce(p_input->>'region',''),coalesce(p_input->>'city',''));
  when 'assign' then n:=assign_residential_leads(array(select value::uuid from jsonb_array_elements_text(p_input->'lead_ids')),array(select value::uuid from jsonb_array_elements_text(p_input->'operator_ids')),(p_input->>'only_unassigned')::boolean);
  when 'unassign' then
   if (p_input->>'started_at')::timestamptz>now()+interval '1 second' then raise exception 'future_cutoff_not_allowed';end if;
   n:=crm_remove_operator_leads_batch((p_input->>'operator_id')::uuid,p_input->>'status',(p_input->>'started_at')::timestamptz);
  when 'limits' then
   perform pg_advisory_xact_lock(87105020);
   if rep is null then select to_jsonb(t) into before_settings from communication_settings t where id for update;
   else select to_jsonb(t) into before_settings from communication_rep_limits t where user_id=rep for update;end if;
   if coalesce(before_settings,'{}'::jsonb) is distinct from p_input->'expected_settings' then raise exception 'settings_changed_read_again';end if;
   merged:=coalesce(before_settings,jsonb_build_object('daily_cents',null,'monthly_cents',null,'paused',false))||(p_input->'settings');
   if merged->>'daily_cents' is null or merged->>'monthly_cents' is null then raise exception 'provide_both_limits_for_new_representative';end if;
   perform communication_save_settings(p_actor,merged,rep);
   perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
   return jsonb_build_object('saved',true,'rep',rep,'settings',merged);
  else raise exception 'unsupported_sales_control';
 end case;
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
 return jsonb_build_object('count',n,'records_deleted',false,'statuses_changed',false,'more_possible',p_operation='unassign' and n=25);
end $$;
revoke all on function integration_sales_control(uuid,text,jsonb) from public,anon,authenticated;grant execute on function integration_sales_control(uuid,text,jsonb) to service_role;

create table if not exists public.integration_review_plans(id uuid primary key default gen_random_uuid(),actor uuid not null references profiles(id),kind text not null,data jsonb not null,summary jsonb not null,state text not null default 'pending' check(state in ('pending','applied')),result jsonb,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes');
alter table integration_review_plans enable row level security;
revoke all on integration_review_plans from public,anon,authenticated;grant all on integration_review_plans to service_role;
create table if not exists public.integration_outbound_messages(id uuid primary key default gen_random_uuid(),request_id uuid not null unique,review_id uuid not null unique references integration_review_plans(id),actor uuid not null references profiles(id),target_type text not null,target_id uuid not null,channel text not null check(channel in ('email','sms')),recipient text not null,subject text,body text not null,purpose text not null,content_hash text not null,status text not null default 'sending' check(status in ('sending','accepted','delivered','failed','unknown')),provider_id text,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table integration_outbound_messages enable row level security;
revoke all on integration_outbound_messages from public,anon,authenticated;grant all on integration_outbound_messages to service_role;
create index if not exists integration_outbound_target_idx on integration_outbound_messages(target_id,created_at);

create or replace function integration_booking_snapshot(p_actor uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b referral_bookings;j assignment_blocks;g gift_reservations;c gift_cards;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 select * into b from referral_bookings where id=p_id;if b.id is null then raise exception 'booking_not_found';end if;
 select * into j from assignment_blocks where id=p_id;select * into g from gift_reservations where booking_id=p_id;if g.card_id is not null then select * into c from gift_cards where id=g.card_id;end if;
 return jsonb_build_object('booking',to_jsonb(b),'assignment',case when j.id is not null then to_jsonb(j) end,'gift',case when g.card_id is not null then to_jsonb(g) end,'card',case when c.id is not null then to_jsonb(c) end,'revision',md5(to_jsonb(b)::text),'gift_revision',md5(jsonb_build_array(to_jsonb(g),to_jsonb(c))::text));
end $$;
revoke all on function integration_booking_snapshot(uuid,uuid) from public,anon,authenticated;grant execute on function integration_booking_snapshot(uuid,uuid) to service_role;

create or replace function integration_booking_amend(p_actor uuid,p_id uuid,p_review jsonb,p_booking jsonb,p_assignment jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b referral_bookings;j assignment_blocks;g gift_reservations;c gift_cards;newb referral_bookings;amount integer;applied integer;pay numeric;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 select * into b from referral_bookings where id=p_id for update;
 select * into j from assignment_blocks where id=p_id for update;
 select * into g from gift_reservations where booking_id=p_id for update;if g.card_id is not null then select * into c from gift_cards where id=g.card_id for update;end if;
 if b.id is null or md5(to_jsonb(b)::text) is distinct from p_review->>'revision' or j.updated_at is distinct from (p_review->>'assignment_revision')::timestamptz or md5(jsonb_build_array(to_jsonb(g),to_jsonb(c))::text) is distinct from p_review->>'gift_revision' then raise exception 'booking_changed_preview_again';end if;
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
 insert into customer_portal_events(booking_id,action,actor,data) values(p_id,'admin_amendment',p_actor::text,jsonb_build_object('reason',p_review->>'reason','previous_amount_cents',b.amount_cents,'amount_cents',amount,'previous_gift_cents',b.gift_applied_cents,'gift_applied_cents',applied,'customer_acceptance_fabricated',false));
 return jsonb_build_object('id',p_id,'saved',true,'amount_cents',amount,'gift_applied_cents',applied,'card_charge_cents',amount-applied,'contractor_pay',pay,'assignment_status',case when j.id is not null then 'pending' end,'charged_now',false,'customer_email_sent',false,'future_recurring_visits_changed',false);
end $$;
revoke all on function integration_booking_amend(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;grant execute on function integration_booking_amend(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.owner_assistant_reserved()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select ceil(coalesce((select fixed_cents+case when setup_month=date_trunc('month',now() at time zone 'America/New_York')::date then setup_cents else 0 end+case when stream_month=date_trunc('month',now() at time zone 'America/New_York')::date then stream_cents else 0 end from owner_sms_settings where id),500)
 +coalesce((select sum(case when state in ('completed','failed') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_voice_sessions where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state in ('done','uncertain','blocked') then coalesce(actual_cents,reserved_cents) else greatest(reserved_cents,coalesce(actual_cents,0)) end) from owner_sms_messages where created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0)
 +coalesce((select sum(case when state='reserved' then reserved_cents else coalesce(actual_cents,charged_cents,reserved_cents) end) from communication_usage where source='A.L.I.C.E. external message' and created_at>=date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),0))::integer;
$function$;

CREATE OR REPLACE FUNCTION public.communication_reserve(p_id text, p_user uuid, p_channel text, p_source text, p_units integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare s communication_settings;r communication_rep_limits;t jsonb;u jsonb;cost integer;secs integer;
begin
 if p_source='A.L.I.C.E. external message' then perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));perform pg_advisory_xact_lock(hashtext('turnly-private-owner-sms'));end if;
 perform pg_advisory_xact_lock(87105020);
 if exists(select 1 from communication_usage where id=p_id) then raise exception 'This communication has already been submitted. Check its status before retrying.';end if;
 select * into s from communication_settings where id;
 if s.paused or (p_channel='call' and s.calls_paused) or (p_channel='sms' and s.texts_paused) then raise exception 'Calling or texting is paused by your administrator.';end if;
 if p_channel not in ('call','sms') or p_units not between 1 and 100 then raise exception 'Invalid communication.';end if;
 if p_channel='call' then secs:=s.max_call_minutes*60;cost:=(s.max_call_minutes+2)*s.voice_cents_per_minute+1;else cost:=p_units*s.sms_cents_per_segment;end if;
 if p_source='A.L.I.C.E. external message' and owner_assistant_reserved()+cost>2500 then raise exception 'Alice shared monthly allowance reached';end if;
 t:=communication_totals();
 if (t->>'daily_cents')::numeric+cost>s.daily_cents or (t->>'monthly_cents')::numeric+cost>s.monthly_cents then raise exception 'Combined calling and texting budget reached. Ask an administrator to review the limits.';end if;
 if p_user is not null then
 select * into r from communication_rep_limits where user_id=p_user;u:=communication_totals(p_user);
 if coalesce(r.paused,false) or (u->>'daily_cents')::numeric+cost>coalesce(r.daily_cents,s.default_rep_daily_cents) or (u->>'monthly_cents')::numeric+cost>coalesce(r.monthly_cents,s.default_rep_monthly_cents) then raise exception 'Your calling and texting allowance has been reached or paused. Ask your administrator.';end if;
 end if;
 insert into communication_usage(id,user_id,channel,source,reserved_cents,units,max_seconds,rate_cents) values(p_id,p_user,p_channel,p_source,cost,p_units,secs,case when p_channel='call' then s.voice_cents_per_minute else s.sms_cents_per_segment end);
 perform communication_alerts();return jsonb_build_object('max_seconds',secs,'reserved_cents',cost);
end$function$
