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
