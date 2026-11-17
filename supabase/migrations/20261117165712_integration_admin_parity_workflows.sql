create or replace function integration_mutate(p_key uuid,p_request text,p_resource text,p_id uuid,p_data jsonb,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare configs jsonb:=$config${"portal_properties":{"table":"portal_properties","fields":["client_id","property_name","name","address","default_service_type","default_scope","supplies_notes","special_instructions","access_notes","recurring_enabled","recurring_frequency","recurring_start_date","recurring_start_time","recurring_end_time","recurring_pay_amount","recurring_assignment_title","company_name","contact_name","contact_email","contact_phone","city","state","postal_code","pipeline_stage","property_type","lead_source","lead_notes","lead_value","square_feet","sales_owner_id","sales_owner_name","next_step","next_step_due_at","expected_close_date","last_activity_at","walkthrough_type","walkthrough_at","walkthrough_end_at","walkthrough_location","walkthrough_assigned_to","walkthrough_status","walkthrough_notes","quote_amount","quote_sent_at","quote_notes","quote_status","quote_expires_at","contract_status","contract_due_at","task_type","task_priority","task_status","task_due_at","sales_city","sales_state","sales_county","sales_website","property_class","prospect_unit_count","average_turns_per_month","budget_range","desired_start_date","decision_maker_status","current_vendor","service_needs","sales_pain_points","opportunity_score","qualification_notes","checklist_template_id","checklist_items","checklist_module_counts"],"required":["property_name"],"create":true,"updated":true,"created_by":true,"filter":{}},"contracts":{"table":"client_contracts","fields":["lead_id","company_name","primary_contact_name","primary_contact_email","primary_contact_phone","billing_email","billing_address","notes","name","status","region","market","contract_start_date","renewal_date","service_model","unit_count","unit_notes","monthly_recurring_revenue","access_notes","property_name","address","city","state","postal_code","email","client_type","property_count","annual_revenue","account_manager_id","account_manager_name","account_manager_ids","account_manager_names","prospect_projected_revenue","projected_annual_turnovers","projected_turnover_revenue","projected_monthly_turnovers","tags"],"required":["company_name"],"create":true,"updated":true,"created_by":true,"filter":{}},"leads":{"table":"sales_leads","fields":["name","company_name","contact_name","contact_email","contact_phone","address","sales_city","sales_state","sales_website","pipeline_stage","sales_owner_id","sales_owner_name","lead_notes","next_step","next_step_due_at","do_not_contact","follow_up_due_at","property_name","client_id","sales_county","property_class","prospect_unit_count","average_turns_per_month","budget_range","desired_start_date","decision_maker_status","current_vendor","service_needs","sales_pain_points","opportunity_score","qualification_notes","default_service_type","default_scope","lead_source","lead_value","task_priority","task_status","task_due_at","last_activity_at","business_segment","prospect_type","sales_region"],"required":["name"],"create":false,"updated":true,"created_by":true,"filter":{}},"customers":{"table":"referral_customers","fields":["name","email","phone"],"required":["name"],"create":false,"updated":false,"created_by":false,"filter":{}},"clients":{"table":"clients","fields":["name","company_name","primary_contact_name","primary_contact_email","primary_contact_phone","billing_email","billing_address","notes","status","region","market","tags","lead_id","email","client_type","property_count","annual_revenue","contract_start_date","renewal_date","account_manager_id","account_manager_name","account_manager_ids","account_manager_names","service_model","unit_count","unit_notes","monthly_recurring_revenue","prospect_projected_revenue","projected_annual_turnovers","projected_turnover_revenue","projected_monthly_turnovers","access_notes","property_name","address","city","state","postal_code"],"required":["company_name"],"create":true,"updated":true,"created_by":true,"filter":{}},"properties":{"table":"properties","fields":["client_id","property_name","address","city","state","zip","access_notes","supply_notes","service_notes","is_active"],"required":["client_id","property_name"],"create":true,"updated":true,"created_by":true,"filter":{}},"units":{"table":"property_units","fields":["property_id","unit_name","square_feet","customer_price","contractor_pay","status","notes","bedroom_count","bathroom_count","checklist_template_id","checklist_items","checklist_module_counts"],"required":["property_id","unit_name"],"create":true,"updated":true,"created_by":true,"filter":{}},"tasks":{"table":"sales_tasks","fields":["lead_id","task_type","task_priority","task_status","task_due_at","next_step"],"required":["lead_id","next_step"],"create":true,"updated":true,"created_by":true,"filter":{}},"quotes":{"table":"sales_quotes","fields":["lead_id","quote_amount","quote_status","quote_expires_at","quote_notes","quote_sent_at"],"required":["lead_id","quote_amount"],"create":true,"updated":true,"created_by":true,"filter":{}},"expenses":{"table":"finance_expenses","fields":["vendor_name","category","description","amount","due_day","due_date","recurrence","status","payment_method","notes"],"required":["vendor_name","amount"],"create":true,"updated":true,"created_by":true,"filter":{}},"contractors":{"table":"profiles","fields":["full_name","phone","region","market","status","location","notes","company_name","service_types","service_type","allowed_regions","allowed_property_ids","allowed_property_names"],"required":["full_name"],"create":false,"updated":true,"created_by":false,"filter":{"role":"contractor"}},"agents":{"table":"referral_agents","fields":["name","brokerage","email","phone","city","state","website","notes","follow_up_on"],"required":["name"],"create":false,"updated":true,"created_by":true,"filter":{}},"client_contacts":{"table":"client_contacts","fields":["client_id","name","cell_phone","email","office_phone","sort_order"],"required":["client_id","name"],"create":true,"updated":true,"created_by":true,"filter":{}},"checklist_templates":{"table":"checklist_templates","fields":["name","department","subdepartment","priority","description","sections","scope_type","residential_service","residential_beds","residential_baths","materials_list"],"required":["name","sections"],"create":true,"updated":true,"created_by":true,"filter":{}},"checklist_modules":{"table":"checklist_modules","fields":["name","department","subdepartment","description","section"],"required":["name","section"],"create":true,"updated":true,"created_by":true,"filter":{}},"walkthroughs":{"table":"sales_walkthroughs","fields":["lead_id","walkthrough_at","walkthrough_end_at","walkthrough_type","walkthrough_location","walkthrough_assigned_to_id","walkthrough_assigned_to","walkthrough_status","walkthrough_notes"],"required":["lead_id","walkthrough_at"],"create":true,"updated":true,"created_by":true,"filter":{}},"walkthrough_slots":{"table":"sales_walkthrough_availability","fields":["starts_at","ends_at","label","status","notes"],"required":["starts_at","ends_at"],"create":true,"updated":true,"created_by":true,"filter":{}},"sales_contracts":{"table":"sales_contracts","fields":["lead_id","contract_status","contract_due_at","contract_value","contract_notes"],"required":["lead_id"],"create":true,"updated":true,"created_by":true,"filter":{}},"regions":{"table":"property_regions","fields":["name","status","notes","metadata"],"required":["name"],"create":true,"updated":true,"created_by":false,"filter":{}},"region_properties":{"table":"property_region_links","fields":["region_id","portal_property_id","contract_id","property_name","status"],"required":["region_id"],"create":true,"updated":true,"created_by":false,"filter":{}},"manager_regions":{"table":"property_manager_region_links","fields":["profile_id","region_id","access_level","status"],"required":["profile_id","region_id"],"create":true,"updated":true,"created_by":false,"filter":{}},"manager_properties":{"table":"property_manager_property_links","fields":["profile_id","portal_property_id","contract_id","property_name","access_level","status"],"required":["profile_id"],"create":true,"updated":true,"created_by":false,"filter":{}},"managers":{"table":"profiles","fields":["full_name","phone","status","company_name","property_manager_property_id","requested_property_name"],"required":[],"create":false,"updated":true,"created_by":false,"filter":{"role":"property_manager"}},"qa_videos":{"table":"qa_videos","fields":["title","label","notes"],"required":[],"create":false,"updated":true,"created_by":false,"filter":{}},"feedback":{"table":"property_manager_clean_feedback","fields":["status","admin_notes"],"required":[],"create":false,"updated":true,"created_by":true,"filter":{}},"inquiries":{"table":"website_inquiries","fields":["status"],"required":[],"create":false,"updated":true,"created_by":false,"filter":{}}}$config$::jsonb; cfg jsonb; k integration_keys; previous integration_operations; fingerprint text; cols text; vals text; assignments text; record jsonb; result jsonb; target uuid; payload jsonb; field text;
begin
 cfg:=configs->p_resource;if cfg is null then raise exception 'unsupported_resource';end if;
 select * into k from integration_keys where id=p_key and revoked_at is null and (expires_at is null or expires_at>now()) for update;
 if k.id is null or not exists(select 1 from profiles where id=k.created_by and role::text='admin' and status='active') or not ('platform:full'=any(k.scopes) or (p_resource||':write')=any(k.scopes)) then raise exception 'scope_denied';end if;
 if p_request !~ '^[A-Za-z0-9_-]{8,100}$' or jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb then raise exception 'invalid_request';end if;
 fingerprint:=md5(jsonb_build_object('resource',p_resource,'id',p_id,'data',p_data,'expected',p_expected)::text);
 select * into previous from integration_operations where key_id=p_key and request_key=p_request;
 if found then if previous.body_hash<>fingerprint or previous.operation<>p_resource then raise exception 'idempotency_conflict';end if;return previous.response||jsonb_build_object('replayed',true);end if;
 for field in select jsonb_object_keys(p_data) loop if not (cfg->'fields')?field then raise exception 'unsupported_field';end if;end loop;
 if k.deny_record_deletion and exists(select 1 from jsonb_each_text(p_data) x where x.key~'(^|_)status$' and lower(x.value) in ('deleted','removed','purged','destroyed')) then raise exception 'record_deletion_disabled';end if;
 payload:=p_data;
 if p_id is null then
  if not (cfg->>'create')::boolean then raise exception 'use_workflow';end if;
  for field in select jsonb_array_elements_text(cfg->'required') loop if coalesce(p_data->>field,'')='' then raise exception 'required_field';end if;end loop;
  if (cfg->>'created_by')::boolean then payload:=payload||jsonb_build_object('created_by',k.created_by);end if;
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

create or replace function integration_admin_extended(p_actor uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a assignment_blocks; l sales_leads; d jsonb:=p_input->'data'; prior jsonb; cfg jsonb; tab text; cols text; vals text; sets text; target uuid; k text; next_stage text; result jsonb; allowed text[];
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 if jsonb_typeof(d)<>'object' or d='{}'::jsonb then raise exception 'invalid_data';end if;
 if p_operation='assignment_configure' then
  select * into a from assignment_blocks where id=(p_input->>'id')::uuid for update;
  if a.id is null then raise exception 'assignment_not_found';end if;
  if a.updated_at is distinct from (p_input->>'expected_updated_at')::timestamptz then raise exception 'version_conflict';end if;
  if a.payment_status in ('paid','processing') or a.paid_at is not null or exists(select 1 from contractor_payouts where assignment_id=a.id and status in ('pending','processing','paid','succeeded','completed')) or exists(select 1 from global_payout_requests where assignment_id=a.id) then raise exception 'reconcile_payment_first';end if;
  allowed:=array['priority','property_id','unit_id','preferred_first','preferred_contractor_ids','preferred_until','recurrence_frequency','recurrence_interval','recurrence_end_date','auto_renewal','property_checklist_items','materials_list','materials_template_id'];
  if length(coalesce(p_input->>'reason',''))<5 then raise exception 'reason_required';end if;
  for k in select jsonb_object_keys(d) loop if not k=any(allowed) then raise exception 'unsupported_field';end if;end loop;
  if exists(select 1 from referral_bookings where id=a.id) and (d ?| array['property_id','unit_id','recurrence_frequency','auto_renewal']) then raise exception 'use_residential_booking_workflow';end if;
  if d?'property_id' then
   if not exists(select 1 from portal_properties where id=(d->>'property_id')::uuid) then raise exception 'choose_existing_portal_property';end if;
   d:=d||jsonb_build_object('property_name',(select property_name from portal_properties where id=(d->>'property_id')::uuid),'portal_property_id',(d->>'property_id')::uuid);
  end if;
  if d->>'unit_id' is not null then
   if not exists(select 1 from property_units where id=(d->>'unit_id')::uuid and property_id=coalesce((d->>'property_id')::uuid,a.property_id)) then raise exception 'unit_does_not_belong_to_property';end if;
   d:=d||jsonb_build_object('unit_name',(select unit_name from property_units where id=(d->>'unit_id')::uuid),'unit_number',(select unit_name from property_units where id=(d->>'unit_id')::uuid));
  end if;
  if d?'preferred_contractor_ids' then
   if exists(select 1 from jsonb_array_elements_text(d->'preferred_contractor_ids') v where not exists(select 1 from profiles where id=v::uuid and status='active' and (role::text='contractor' or contractor_approved=true))) then raise exception 'choose_active_contractor';end if;
   d:=d||jsonb_build_object('preferred_contractor_names',coalesce((select jsonb_agg(p.full_name order by v.n) from jsonb_array_elements_text(d->'preferred_contractor_ids') with ordinality v(id,n) join profiles p on p.id=v.id::uuid),'[]'::jsonb));
  end if;
  d:=d||jsonb_build_object('updated_at',clock_timestamp(),'metadata',coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object('last_api_configuration',jsonb_build_object('actor',p_actor,'reason',p_input->>'reason','at',clock_timestamp(),'previous',to_jsonb(a)-array['metadata','start_latitude','start_longitude'])));
  select string_agg(format('%I=x.%I',f,f),',') into sets from jsonb_object_keys(d) f;
  execute format('update assignment_blocks t set %s from jsonb_populate_record(null::assignment_blocks,$1) x where t.id=$2 returning to_jsonb(t)',sets) into result using d,a.id;
  return jsonb_build_object('id',a.id,'updated_at',result->'updated_at');
 elsif p_operation='sales_workflow' then
  select * into l from sales_leads where id=(p_input->>'lead_id')::uuid for update;
  if l.id is null or l.updated_at is distinct from (p_input->>'expected_lead_updated_at')::timestamptz then raise exception 'lead_version_conflict';end if;
  case p_input->>'kind'
   when 'walkthroughs' then tab:='sales_walkthroughs';allowed:=array['walkthrough_at','walkthrough_end_at','walkthrough_type','walkthrough_location','walkthrough_assigned_to_id','walkthrough_assigned_to','walkthrough_status','walkthrough_notes'];next_stage:='walkthrough';
   when 'quotes' then tab:='sales_quotes';allowed:=array['quote_amount','quote_status','quote_sent_at','quote_expires_at','quote_notes'];
   when 'sales_contracts' then tab:='sales_contracts';allowed:=array['contract_status','contract_due_at','contract_value','contract_notes'];
   when 'tasks' then tab:='sales_tasks';allowed:=array['task_type','task_priority','task_status','task_due_at','next_step'];
   else raise exception 'unsupported_workflow';
  end case;
  for k in select jsonb_object_keys(d) loop if not k=any(allowed) then raise exception 'unsupported_field';end if;end loop;
  target:=(p_input->>'id')::uuid;
  if target is not null then
   execute format('select to_jsonb(t) from %I t where id=$1 for update',tab) into prior using target;
   if prior is null or (prior->>'lead_id')::uuid<>l.id or (prior->>'updated_at')::timestamptz is distinct from (p_input->>'expected_updated_at')::timestamptz then raise exception 'workflow_version_conflict';end if;
   d:=(prior-ARRAY['id','created_at','created_by','updated_at'])||d;
  end if;
  d:=d||jsonb_build_object('lead_id',l.id,'updated_at',clock_timestamp());
  if tab='sales_walkthroughs' and (d->>'walkthrough_at' is null or (d->>'walkthrough_end_at')::timestamptz<=(d->>'walkthrough_at')::timestamptz) then raise exception 'invalid_walkthrough_times';end if;
  if target is null then
   d:=d||jsonb_build_object('created_by',p_actor);
   select string_agg(format('%I',f),','),string_agg(format('x.%I',f),',') into cols,vals from jsonb_object_keys(d) f;
   execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I,$1) x returning id',tab,cols,vals,tab) into target using d;
  else
   select string_agg(format('%I=x.%I',f,f),',') into sets from jsonb_object_keys(d) f;
   execute format('update %I t set %s from jsonb_populate_record(null::%I,$1) x where t.id=$2',tab,sets,tab) using d,target;
  end if;
  if tab='sales_quotes' then next_stage:=case when d->>'quote_status'='accepted' then 'contract_out' else 'quote_sent' end;end if;
  if tab='sales_contracts' then next_stage:=case when d->>'contract_status' in ('signed','active') then 'active' else 'contract_out' end;end if;
  update sales_leads set pipeline_stage=coalesce(next_stage,pipeline_stage),lead_value=case when tab='sales_quotes' then (d->>'quote_amount')::numeric when tab='sales_contracts' then coalesce((d->>'contract_value')::numeric,lead_value) else lead_value end,
   next_step=case when tab='sales_walkthroughs' then 'Walkthrough scheduled' when tab='sales_tasks' then coalesce(nullif(d->>'next_step',''),d->>'task_type',next_step) else next_step end,
   next_step_due_at=case when tab='sales_walkthroughs' then (d->>'walkthrough_at')::timestamptz when tab='sales_tasks' then (d->>'task_due_at')::timestamptz else next_step_due_at end,last_activity_at=clock_timestamp(),updated_at=clock_timestamp() where id=l.id;
  return jsonb_build_object('id',target,'lead_id',l.id,'kind',p_input->>'kind');
 end if;
 raise exception 'unsupported_operation';
end $$;
revoke all on function integration_admin_extended(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function integration_admin_extended(uuid,text,jsonb) to service_role;

create or replace function integration_admin_batch(p_key uuid,p_resource text,p_request uuid,p_records jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare row jsonb; results jsonb:='[]';
begin
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 100 or (select count(distinct x->>'id') from jsonb_array_elements(p_records) x)<>jsonb_array_length(p_records) then raise exception 'provide_1_to_100_distinct_records';end if;
 for row in select value from jsonb_array_elements(p_records) order by value->>'id' loop
  if row->>'id' is null then raise exception 'updates_require_existing_id';end if;
  results:=results||jsonb_build_array(integration_mutate(p_key,p_request::text||'_'||(row->>'id'),p_resource,(row->>'id')::uuid,row->'data',(row->>'expected_updated_at')::timestamptz));
 end loop;
 return jsonb_build_object('results',results,'atomic',true);
end $$;
revoke all on function integration_admin_batch(uuid,text,uuid,jsonb) from public,anon,authenticated;grant execute on function integration_admin_batch(uuid,text,uuid,jsonb) to service_role;

create or replace function integration_assignment_series(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare w jsonb; saved jsonb; results jsonb:='[]'; group_id uuid:=gen_random_uuid();
begin
 if jsonb_typeof(p_input->'windows')<>'array' or jsonb_array_length(p_input->'windows') not between 1 and 100 then raise exception 'provide_1_to_100_windows';end if;
 for w in select value from jsonb_array_elements(p_input->'windows') loop
  saved:=integration_booking_admin(p_actor,'create_assignment',(p_input-'windows')||w);
  update assignment_blocks set recurring_group_id=group_id,recurrence_frequency=coalesce(p_input->>'recurrence_frequency','custom'),assignment_type=coalesce(p_input->>'recurrence_frequency','custom'),recurrence_end_date=(p_input->>'recurrence_end_date')::date,auto_renewal=false where id=(saved->>'id')::uuid;
  results:=results||jsonb_build_array(saved);
 end loop;
 return jsonb_build_object('assignments',results,'recurring_group_id',group_id,'atomic',true,'status','pending','auto_renewal',false);
end $$;
revoke all on function integration_assignment_series(uuid,jsonb) from public,anon,authenticated;grant execute on function integration_assignment_series(uuid,jsonb) to service_role;
