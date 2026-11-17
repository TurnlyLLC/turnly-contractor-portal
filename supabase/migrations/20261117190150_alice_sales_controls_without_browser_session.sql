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
declare previous text:=current_setting('request.jwt.claim.sub',true); n integer; lead_ids uuid[]; before_settings jsonb; merged jsonb; rep uuid:=(p_input->>'rep')::uuid;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 case p_operation
  when 'allocate' then
   if (p_input->>'count')::integer not between 1 and 2000 then raise exception 'invalid_allocation_count';end if;
   select array_agg(id) into lead_ids from(select id from sales_leads where business_segment='residential' and sales_owner_id is null and pipeline_stage='new_leads' and not do_not_contact and (coalesce(p_input->>'region','')='' or sales_region=p_input->>'region') and (coalesce(p_input->>'city','')='' or sales_city=p_input->>'city') order by id limit (p_input->>'count')::integer for update skip locked)x;
   n:=case when coalesce(cardinality(lead_ids),0)=0 then 0 else assign_residential_leads(lead_ids,array(select value::uuid from jsonb_array_elements_text(p_input->'operator_ids')),true) end;
  when 'assign' then n:=assign_residential_leads(array(select value::uuid from jsonb_array_elements_text(p_input->'lead_ids')),array(select value::uuid from jsonb_array_elements_text(p_input->'operator_ids')),(p_input->>'only_unassigned')::boolean);
  when 'unassign' then
   if (p_input->>'started_at')::timestamptz>now()+interval '1 second' then raise exception 'future_cutoff_not_allowed';end if;
   if (p_input->>'operator_id')::uuid is null or p_input->>'status' not in ('all','new_leads','contacted','interested','link_sent','follow_up','active','lost','followups') then raise exception 'invalid_unassignment_scope';end if;
   with batch as (select id from sales_leads where business_segment='residential' and sales_owner_id=(p_input->>'operator_id')::uuid and updated_at<=(p_input->>'started_at')::timestamptz and (p_input->>'status'='all' or pipeline_stage=p_input->>'status' or (p_input->>'status'='followups' and pipeline_stage in ('lost','follow_up'))) order by id limit 25 for update), released as (update sales_leads l set sales_owner_id=null,sales_owner_name='' from batch where l.id=batch.id and l.sales_owner_id=(p_input->>'operator_id')::uuid returning l.id)
   insert into sales_activities(lead_id,user_id,activity_type,activity_text,metadata)select id,p_actor,'assignment','Returned to unassigned leads.',jsonb_build_object('previous_owner_id',p_input->>'operator_id','status_filter',p_input->>'status') from released;
   get diagnostics n=row_count;
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
