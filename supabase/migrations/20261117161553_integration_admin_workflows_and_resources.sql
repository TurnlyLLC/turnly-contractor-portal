create or replace function integration_mutate(p_key uuid,p_request text,p_resource text,p_id uuid,p_data jsonb,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare configs jsonb:=$config${"leads":{"table":"sales_leads","fields":["name","company_name","contact_name","contact_email","contact_phone","address","sales_city","sales_state","sales_website","pipeline_stage","sales_owner_id","sales_owner_name","lead_notes","next_step","next_step_due_at","do_not_contact","follow_up_due_at"],"required":["name"],"create":false,"updated":true,"filter":{}},"customers":{"table":"referral_customers","fields":["name","email","phone"],"required":["name"],"create":false,"updated":false,"filter":{}},"clients":{"table":"clients","fields":["name","company_name","primary_contact_name","primary_contact_email","primary_contact_phone","billing_email","billing_address","notes","status","region","market","tags"],"required":["company_name"],"create":true,"updated":true,"filter":{}},"properties":{"table":"properties","fields":["client_id","property_name","address","city","state","zip","access_notes","supply_notes","service_notes","is_active"],"required":["property_name"],"create":true,"updated":true,"filter":{}},"units":{"table":"property_units","fields":["property_id","unit_name","square_feet","customer_price","contractor_pay","status","notes","bedroom_count","bathroom_count"],"required":["property_id","unit_name"],"create":true,"updated":true,"filter":{}},"tasks":{"table":"sales_tasks","fields":["lead_id","task_type","task_priority","task_status","task_due_at","next_step"],"required":["lead_id","next_step"],"create":true,"updated":true,"filter":{}},"quotes":{"table":"sales_quotes","fields":["lead_id","quote_amount","quote_status","quote_expires_at","quote_notes"],"required":["lead_id","quote_amount"],"create":true,"updated":true,"filter":{}},"expenses":{"table":"finance_expenses","fields":["vendor_name","category","description","amount","due_day","due_date","recurrence","status","payment_method","notes"],"required":["vendor_name","amount"],"create":true,"updated":true,"filter":{}},"contractors":{"table":"profiles","fields":["full_name","phone","region","market"],"required":["full_name"],"create":false,"updated":true,"filter":{"role":"contractor"}},"agents":{"table":"referral_agents","fields":["name","brokerage","email","phone","city","state","website","notes","follow_up_on"],"required":["name"],"create":false,"updated":true,"filter":{}},"portal_properties":{"table":"portal_properties","fields":["client_id","property_name","name","address","default_service_type","default_scope","supplies_notes","special_instructions","access_notes","recurring_enabled","recurring_frequency","recurring_start_date","recurring_start_time","recurring_end_time","recurring_pay_amount","recurring_assignment_title","company_name","contact_name","contact_email","contact_phone","city","state","postal_code"],"required":["property_name"],"create":true,"updated":true,"filter":{}},"contracts":{"table":"client_contracts","fields":["lead_id","company_name","primary_contact_name","primary_contact_email","primary_contact_phone","billing_email","billing_address","notes","name","status","region","market","contract_start_date","renewal_date","service_model","unit_count","unit_notes","monthly_recurring_revenue","access_notes","property_name","address","city","state","postal_code"],"required":["company_name"],"create":true,"updated":true,"filter":{}}}$config$::jsonb; cfg jsonb; k integration_keys; previous integration_operations; fingerprint text; cols text; vals text; assignments text; record jsonb; result jsonb; target uuid; payload jsonb; field text;
begin
 cfg:=configs->p_resource;if cfg is null then raise exception 'unsupported_resource';end if;
 select * into k from integration_keys where id=p_key and revoked_at is null and (expires_at is null or expires_at>now()) for update;
 if k.id is null or not exists(select 1 from profiles where id=k.created_by and role::text='admin' and status='active') or not ('platform:full'=any(k.scopes) or (p_resource||':write')=any(k.scopes)) then raise exception 'scope_denied';end if;
 if p_request !~ '^[A-Za-z0-9_-]{8,100}$' or jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb then raise exception 'invalid_request';end if;
 fingerprint:=md5(jsonb_build_object('resource',p_resource,'id',p_id,'data',p_data,'expected',p_expected)::text);
 select * into previous from integration_operations where key_id=p_key and request_key=p_request;
 if found then if previous.body_hash<>fingerprint or previous.operation<>p_resource then raise exception 'idempotency_conflict';end if;return previous.response||jsonb_build_object('replayed',true);end if;
 for field in select jsonb_object_keys(p_data) loop if not (cfg->'fields')?field then raise exception 'unsupported_field';end if;end loop;
 payload:=p_data;
 if p_id is null then
  if not (cfg->>'create')::boolean then raise exception 'use_workflow';end if;
  for field in select jsonb_array_elements_text(cfg->'required') loop if coalesce(p_data->>field,'')='' then raise exception 'required_field';end if;end loop;
  payload:=payload||jsonb_build_object('created_by',k.created_by);
  select string_agg(format('%I',f),','),string_agg(format('x.%I',f),',') into cols,vals from jsonb_object_keys(payload) f;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x returning id',cfg->>'table',cols,vals,cfg->>'table') into target using payload;
 else
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',cfg->>'table') into record using p_id;
  if record is null then raise exception 'not_found';end if;
  if not record @> (cfg->'filter') then raise exception 'not_found';end if;
  if (cfg->>'updated')::boolean and (p_expected is null or (record->>'updated_at')::timestamptz is distinct from p_expected) then raise exception 'version_conflict';end if;
  if (cfg->>'updated')::boolean then payload:=payload||jsonb_build_object('updated_at',clock_timestamp());end if;
  select string_agg(format('%I=x.%I',f,f),',') into assignments from jsonb_object_keys(payload) f;
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) x where t.id=$2 returning t.id',cfg->>'table',assignments,cfg->>'table') into target using payload,p_id;
 end if;
 result:=jsonb_build_object('id',target,'created',p_id is null,'replayed',false);
 insert into integration_operations(key_id,request_key,body_hash,operation,state,response) values(p_key,p_request,fingerprint,p_resource,'completed',result);
 return result;
end $$;
revoke all on function integration_mutate(uuid,text,text,uuid,jsonb,timestamptz) from public,anon,authenticated;grant execute on function integration_mutate(uuid,text,text,uuid,jsonb,timestamptz) to service_role;

create or replace function public.integration_admin_workflow(p_actor uuid,p_operation text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior_claim text; j assignment_blocks; result jsonb; q uuid;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin required';end if;
 if p_operation not in ('qa_approve','qa_revision','message_create','message_reply','message_read') then raise exception 'Unsupported workflow';end if;
 if jsonb_typeof(p_input)<>'object' then raise exception 'Invalid input';end if;
 prior_claim=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if p_operation in ('qa_approve','qa_revision') then
  select * into j from assignment_blocks where id=(p_input->>'id')::uuid for update;
  if not found or j.updated_at is distinct from (p_input->>'expected_updated_at')::timestamptz then raise exception 'Assignment missing or changed; read again';end if;
  if j.paid_at is not null or coalesce(j.paid_out,false) or 'paid'=any(array[j.payment_status,j.pay_status,j.payout_status,j.quickbooks_payment_status]) or exists(select 1 from contractor_payouts where assignment_id=j.id) or exists(select 1 from global_payout_requests where assignment_id=j.id) then raise exception 'Reconcile recorded or pending payment first';end if;
  q=(p_input->>'qa_job_id')::uuid;
  if not exists(select 1 from qa_jobs where id=q and assignment_id=j.id) then raise exception 'QA job does not belong to this assignment';end if;
  if length(trim(coalesce(p_input->>'reason','')))<5 then raise exception 'Explain the QA decision';end if;
  if p_operation='qa_approve' then
   select to_jsonb(x) into result from approve_assignment_qa(j.id,q,p_input->>'reason') x;
   if exists(select 1 from referral_bookings where id=j.id and status='scheduled') then perform finish_residential_booking(j.id,p_actor,false);end if;
  else select to_jsonb(x) into result from request_assignment_qa_revision(j.id,q,p_input->>'reason') x;end if;
  result=jsonb_build_object('id',j.id,'status',result->>'status','payment_status',result->>'payment_status');
 elsif p_operation='message_create' then
  if length(trim(coalesce(p_input->>'body','')))=0 or length(p_input->>'body')>5000 or length(trim(coalesce(p_input->>'subject','')))=0 or length(p_input->>'subject')>160 or jsonb_typeof(p_input->'recipient_ids')<>'array' or jsonb_array_length(p_input->'recipient_ids') not between 1 and 25 then raise exception 'Provide recipients, subject and message';end if;
  select to_jsonb(create_message_thread_v2(jsonb_build_object('recipient_ids',p_input->'recipient_ids','subject',p_input->>'subject','body',p_input->>'body'))) into result;
 elsif p_operation='message_reply' then
  if length(trim(coalesce(p_input->>'body','')))=0 or length(p_input->>'body')>5000 then raise exception 'Provide message body';end if;
  select to_jsonb(send_message_reply_v2(jsonb_build_object('thread_id',p_input->>'thread_id','body',p_input->>'body'))) into result;
 else perform mark_message_thread_read((p_input->>'thread_id')::uuid);result='{"ok":true}';end if;
 perform set_config('request.jwt.claim.sub',coalesce(prior_claim,''),true);
 return result;
end;$$;
revoke all on function public.integration_admin_workflow(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_admin_workflow(uuid,text,jsonb) to service_role;
