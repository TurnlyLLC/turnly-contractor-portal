alter table integration_keys drop constraint integration_keys_scopes_check;
alter table integration_keys add constraint integration_keys_scopes_check check (cardinality(scopes)>0 and scopes <@ array['platform:full','leads:create','leads:read','leads:write','customers:read','customers:write','clients:read','clients:write','properties:read','properties:write','units:read','units:write','tasks:read','tasks:write','quotes:read','quotes:write','expenses:read','expenses:write','bookings:read','assignments:read','contractors:read','contractors:write','applicants:read','documents:read','ambassadors:read','referrals:read','agents:read','agents:write','gift_orders:read','payouts:read','activities:read','bookings:write','assignments:write','calendar:read','calendar:write','applicants:write','gift_orders:write','payments:write','sales:read','communications:write','ambassadors:write']::text[]);
alter table integration_keys alter column expires_at drop not null;
alter table integration_hooks drop constraint integration_hooks_events_check;
alter table integration_hooks add constraint integration_hooks_events_check check(cardinality(events)>0 and events <@ array['lead.created','lead.updated','customers.created','customers.updated','clients.created','clients.updated','properties.created','properties.updated','units.created','units.updated','tasks.created','tasks.updated','quotes.created','quotes.updated','expenses.created','expenses.updated','booking.created','booking.updated','assignments.created','assignments.updated','contractors.created','contractors.updated','applicants.created','applicants.updated','documents.created','documents.updated','ambassadors.created','ambassadors.updated','referrals.created','referrals.updated','agents.created','agents.updated','gift_orders.created','gift_orders.updated','payouts.created','payouts.updated','activities.created','activities.updated']::text[]);
create table integration_audit(id uuid primary key,key_id uuid not null references integration_keys(id),operation text not null,status text not null,http_status int,duration_ms int,created_at timestamptz not null default now());
create index integration_audit_recent on integration_audit(created_at desc);
create table integration_operations(key_id uuid references integration_keys(id),request_key text,body_hash text not null,operation text not null,state text not null default 'pending',response jsonb,created_at timestamptz not null default now(),primary key(key_id,request_key));
alter table integration_audit enable row level security;alter table integration_operations enable row level security;
revoke all on integration_audit,integration_operations from public,anon,authenticated;
grant all on integration_audit,integration_operations to service_role;
create or replace function public.integration_use_key(p_hash text,p_scope text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare k integration_keys; n integer;
begin
 select * into k from integration_keys where secret_hash=p_hash and workspace='turnly' and revoked_at is null and (expires_at is null or expires_at>now()) for update;
 if k.id is null or not exists(select 1 from profiles where id=k.created_by and role::text in ('admin','owner','super_admin') and status='active') then return null; end if;
 if p_scope<>'catalog:read' and not ('platform:full'=any(k.scopes) or p_scope=any(k.scopes)) then raise exception 'scope_denied'; end if;
 insert into integration_rate values(k.id,date_trunc('minute',now()),1)
 on conflict(key_id) do update set bucket=excluded.bucket,requests=case when integration_rate.bucket=excluded.bucket then integration_rate.requests+1 else 1 end returning requests into n;
 if n>120 then return '00000000-0000-0000-0000-000000000000'::uuid; end if;
 update integration_keys set last_used_at=now() where id=k.id;
 return k.id;
end $$;

create or replace function public.integration_create_lead(p_key uuid,p_request text,p_hash text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous integration_requests; found_id uuid; owner_id uuid; was_created boolean:=false;
begin
 select created_by into owner_id from integration_keys where id=p_key and revoked_at is null and (expires_at is null or expires_at>now()) and ('leads:create'=any(scopes) or 'platform:full'=any(scopes)) for update;
 if owner_id is null then raise exception 'key_inactive'; end if;
 perform pg_advisory_xact_lock(719261);
 select * into previous from integration_requests where key_id=p_key and request_key=p_request;
 if previous.lead_id is not null then
  if previous.body_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('id',previous.lead_id,'created',false,'replayed',true);
 end if;
 select id into found_id from sales_leads where business_segment='residential' and (
  (p_data->>'contact_email'<>'' and lower(contact_email)=lower(p_data->>'contact_email')) or
  (p_data->>'contact_phone'<>'' and right(regexp_replace(contact_phone,'[^0-9]','','g'),10)=right(regexp_replace(p_data->>'contact_phone','[^0-9]','','g'),10) and lower(name)=lower(p_data->>'name'))
 ) order by created_at limit 1;
 if found_id is null then
  insert into sales_leads(created_by,property_name,name,contact_name,contact_email,contact_phone,sales_city,sales_state,lead_source,business_segment,prospect_type,pipeline_stage)
  values(owner_id,p_data->>'name',p_data->>'name',p_data->>'name',p_data->>'contact_email',p_data->>'contact_phone',p_data->>'sales_city',p_data->>'sales_state','Integration API','residential','realtor','new_leads') returning id into found_id;
  was_created:=true;
 end if;
 insert into integration_requests values(p_key,p_request,p_hash,found_id);
 return jsonb_build_object('id',found_id,'created',was_created,'replayed',false);
end $$;
create function integration_action_claim(p_key uuid,p_request text,p_hash text,p_operation text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous integration_operations;
begin
 perform 1 from integration_keys k join profiles p on p.id=k.created_by where k.id=p_key and k.revoked_at is null and (k.expires_at is null or k.expires_at>now()) and p.role::text='admin' and p.status='active' for update of k;
 if not found then raise exception 'invalid_key'; end if;
 select * into previous from integration_operations where key_id=p_key and request_key=p_request;
 if found then
  if previous.body_hash<>p_hash or previous.operation<>p_operation then raise exception 'idempotency_conflict';end if;
  if previous.state='completed' then return jsonb_build_object('replayed',true,'response',previous.response);end if;
  raise exception 'operation_pending_or_uncertain_conflict';
 end if;
 insert into integration_operations(key_id,request_key,body_hash,operation) values(p_key,p_request,p_hash,p_operation);
 return jsonb_build_object('replayed',false);
end $$;
revoke all on function integration_action_claim(uuid,text,text,text) from public,anon,authenticated;grant execute on function integration_action_claim(uuid,text,text,text) to service_role;
create function integration_mutate(p_key uuid,p_request text,p_resource text,p_id uuid,p_data jsonb,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare configs jsonb:=$config${"leads":{"table":"sales_leads","fields":["name","company_name","contact_name","contact_email","contact_phone","address","sales_city","sales_state","sales_website","pipeline_stage","sales_owner_id","sales_owner_name","lead_notes","next_step","next_step_due_at","do_not_contact","follow_up_due_at"],"required":["name"],"create":false,"updated":true,"filter":{}},"customers":{"table":"referral_customers","fields":["name","email","phone"],"required":["name"],"create":false,"updated":false,"filter":{}},"clients":{"table":"clients","fields":["name","company_name","primary_contact_name","primary_contact_email","primary_contact_phone","billing_email","billing_address","notes","status","region","market","tags"],"required":["company_name"],"create":true,"updated":true,"filter":{}},"properties":{"table":"properties","fields":["client_id","property_name","address","city","state","zip","access_notes","supply_notes","service_notes","is_active"],"required":["property_name"],"create":true,"updated":true,"filter":{}},"units":{"table":"property_units","fields":["property_id","unit_name","square_feet","customer_price","contractor_pay","status","notes","bedroom_count","bathroom_count"],"required":["property_id","unit_name"],"create":true,"updated":true,"filter":{}},"tasks":{"table":"sales_tasks","fields":["lead_id","task_type","task_priority","task_status","task_due_at","next_step"],"required":["lead_id","next_step"],"create":true,"updated":true,"filter":{}},"quotes":{"table":"sales_quotes","fields":["lead_id","quote_amount","quote_status","quote_expires_at","quote_notes"],"required":["lead_id","quote_amount"],"create":true,"updated":true,"filter":{}},"expenses":{"table":"finance_expenses","fields":["vendor_name","category","description","amount","due_day","due_date","recurrence","status","payment_method","notes"],"required":["vendor_name","amount"],"create":true,"updated":true,"filter":{}},"contractors":{"table":"profiles","fields":["full_name","phone","region","market"],"required":["full_name"],"create":false,"updated":true,"filter":{"role":"contractor"}},"agents":{"table":"referral_agents","fields":["name","brokerage","email","phone","city","state","website","notes","follow_up_on"],"required":["name"],"create":false,"updated":true,"filter":{}}}$config$::jsonb; cfg jsonb; k integration_keys; previous integration_operations; fingerprint text; cols text; vals text; assignments text; record jsonb; result jsonb; target uuid; payload jsonb; field text;
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
create or replace function integration_private.enqueue_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare resource text; kind text; body jsonb; rowdata jsonb;
begin
 rowdata:=to_jsonb(new);if tg_op='UPDATE' and rowdata=to_jsonb(old) then return new;end if;
 resource:=coalesce(nullif(tg_argv[0],''),case when tg_table_name='sales_leads' then 'leads' else 'bookings' end);
 if resource='contractors' and rowdata->>'role'<>'contractor' then return new;end if;
 kind:=case resource when 'leads' then 'lead' when 'bookings' then 'booking' else resource end||case tg_op when 'INSERT' then '.created' else '.updated' end;
 body:=jsonb_build_object('resource',resource,'resource_id',coalesce(rowdata->>'id',rowdata->>'user_id'));
 insert into integration_deliveries(hook_id,event_type,payload) select h.id,kind,body from integration_hooks h join profiles p on p.id=h.created_by where h.enabled and kind=any(h.events) and p.role::text='admin' and p.status='active';
 return new;
end $$;
create trigger integration_customers_event after insert or update on public.referral_customers for each row execute function integration_private.enqueue_event('customers');
create trigger integration_clients_event after insert or update on public.clients for each row execute function integration_private.enqueue_event('clients');
create trigger integration_properties_event after insert or update on public.properties for each row execute function integration_private.enqueue_event('properties');
create trigger integration_units_event after insert or update on public.property_units for each row execute function integration_private.enqueue_event('units');
create trigger integration_tasks_event after insert or update on public.sales_tasks for each row execute function integration_private.enqueue_event('tasks');
create trigger integration_quotes_event after insert or update on public.sales_quotes for each row execute function integration_private.enqueue_event('quotes');
create trigger integration_expenses_event after insert or update on public.finance_expenses for each row execute function integration_private.enqueue_event('expenses');
create trigger integration_assignments_event after insert or update on public.assignment_blocks for each row execute function integration_private.enqueue_event('assignments');
create trigger integration_contractors_event after insert or update on public.profiles for each row execute function integration_private.enqueue_event('contractors');
create trigger integration_applicants_event after insert or update on public.recruiting_applications for each row execute function integration_private.enqueue_event('applicants');
create trigger integration_documents_event after insert or update on public.contractor_documents for each row execute function integration_private.enqueue_event('documents');
create trigger integration_ambassadors_event after insert or update on public.ba_members for each row execute function integration_private.enqueue_event('ambassadors');
create trigger integration_referrals_event after insert or update on public.ba_leads for each row execute function integration_private.enqueue_event('referrals');
create trigger integration_agents_event after insert or update on public.referral_agents for each row execute function integration_private.enqueue_event('agents');
create trigger integration_gift_orders_event after insert or update on public.gift_orders for each row execute function integration_private.enqueue_event('gift_orders');
create trigger integration_payouts_event after insert or update on public.contractor_payouts for each row execute function integration_private.enqueue_event('payouts');
create trigger integration_activities_event after insert or update on public.sales_activities for each row execute function integration_private.enqueue_event('activities');
