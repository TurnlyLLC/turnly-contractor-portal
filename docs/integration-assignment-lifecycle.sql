-- Authenticated integration dispatcher supplies the active admin; service-only RPC.
create or replace function public.integration_assignment_lifecycle(p_actor uuid,p_id uuid,p_expected timestamptz,p_action text,p_data jsonb,p_reason text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare j assignment_blocks; b referral_bookings; next_status text; m jsonb; prior_claim text; worker profiles;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin required';end if;
 if length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid operation';end if;
 select * into j from assignment_blocks where id=p_id for update;
 if not found then raise exception 'Assignment not found';end if;
 if p_expected is null or j.updated_at is distinct from p_expected then raise exception 'Assignment changed; read it again before retrying';end if;
 if p_action not in ('set_status','reschedule','edit_details') then raise exception 'Unsupported operation';end if;
 if p_action<>'edit_details' and (j.paid_at is not null or coalesce(j.paid_out,false) or 'paid'=any(array[j.payment_status,j.pay_status,j.payout_status,j.quickbooks_payment_status,j.metadata->'payment'->>'status']) or exists(select 1 from contractor_payouts where assignment_id=j.id) or exists(select 1 from global_payout_requests where assignment_id=j.id)) then raise exception 'Recorded or pending payout protects this job; reconcile payment first';end if;
 select * into b from referral_bookings where id=j.id for update;
 m=coalesce(j.metadata,'{}')||jsonb_build_object('last_api_lifecycle_change',jsonb_build_object('actor',p_actor,'at',clock_timestamp(),'reason',p_reason,'previous_status',j.status,'previous_start',j.start_window,'previous_end',j.end_window));
 if p_action='reschedule' then
  if b.id is not null then raise exception 'Residential rescheduling must also update customer/payment scheduling; use the booking reschedule workflow';end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('start_window','end_window')) or p_data->>'start_window' is null or p_data->>'end_window' is null or (p_data->>'end_window')::timestamptz<=(p_data->>'start_window')::timestamptz then raise exception 'Invalid schedule';end if;
  if j.status in ('completed','cancelled','declined') then raise exception 'Reopen the job before rescheduling';end if;
  update assignment_blocks set start_window=(p_data->>'start_window')::timestamptz,end_window=(p_data->>'end_window')::timestamptz,metadata=m,updated_at=clock_timestamp() where id=j.id;
 elsif p_action='edit_details' then
  if p_data='{}' or exists(select 1 from jsonb_each(p_data) x where x.key not in ('title','address','service_type','scope','supplies_notes','special_instructions','completion_notes') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>10000) then raise exception 'Unsupported detail field';end if;
  if b.id is not null and p_data ?| array['address','service_type','scope'] then raise exception 'Change customer scope/address through its booking workflow';end if;
  update assignment_blocks set title=coalesce(p_data->>'title',title),address=coalesce(p_data->>'address',address),service_type=coalesce(p_data->>'service_type',service_type),scope=coalesce(p_data->>'scope',scope),supplies_notes=coalesce(p_data->>'supplies_notes',supplies_notes),special_instructions=coalesce(p_data->>'special_instructions',special_instructions),completion_notes=coalesce(p_data->>'completion_notes',completion_notes),metadata=m,updated_at=clock_timestamp() where id=j.id;
 else
  next_status=p_data->>'status';
  if next_status is null or next_status not in ('pending','open','preferred_pending','claimed','in_progress','qa_pending','completed','cancelled','declined','draft') or exists(select 1 from jsonb_object_keys(p_data) k where k<>'status') then raise exception 'Invalid job status; paid is a payout operation';end if;
  if b.id is not null and j.status is distinct from next_status then
   if next_status in ('cancelled','declined') and b.status<>'cancelled' then perform finish_residential_booking(b.id,p_actor,true);
   elsif next_status='completed' and b.status<>'completed' then perform finish_residential_booking(b.id,p_actor,false);
   elsif next_status not in ('cancelled','declined','completed') and b.status<>'scheduled' then raise exception 'Residential booking is not scheduled; reconcile booking first';end if;
   if j.status='pending' and next_status not in ('pending','completed','cancelled','declined') then raise exception 'Use bookings.approve_job after checklist review before releasing this booking';end if;
  end if;
  select * into worker from profiles where id=coalesce(j.claimed_by,j.assigned_to) and status='active';
  if next_status in ('claimed','in_progress') and worker.id is null then raise exception 'Assign an active contractor first';end if;
  -- Give existing completion/auth triggers the verified actor only within this RPC.
  prior_claim=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  update assignment_blocks set status=next_status,
   visibility=case when next_status='open' then 'open' when next_status='pending' then 'pending' when next_status='preferred_pending' then 'preferred' when next_status in ('claimed','in_progress') then 'claimed' else 'closed' end,
   claimed_by=case when next_status='open' then null when next_status in ('claimed','in_progress') then worker.id else claimed_by end,
   claimed_by_name=case when next_status='open' then null when next_status in ('claimed','in_progress') then worker.full_name else claimed_by_name end,
   claimed_by_email=case when next_status='open' then null when next_status in ('claimed','in_progress') then worker.email else claimed_by_email end,
   assigned_to=case when next_status='open' then null else assigned_to end,
   assigned_to_name=case when next_status='open' then null else assigned_to_name end,
   assigned_to_email=case when next_status='open' then null else assigned_to_email end,
   claimed_at=case when next_status='open' then null when next_status in ('claimed','in_progress') then coalesce(claimed_at,now()) else claimed_at end,
   accepted_at=case when next_status='open' then null when next_status in ('claimed','in_progress') then coalesce(accepted_at,now()) else accepted_at end,
   started_by=case when next_status='in_progress' then worker.id else started_by end,
   started_at=case when next_status='in_progress' then coalesce(started_at,now()) else started_at end,
   completed_at=case when next_status='completed' then coalesce(completed_at,now()) when j.status='completed' then null else completed_at end,
   completed_by=case when next_status='completed' then p_actor else completed_by end,
   metadata=m,updated_at=clock_timestamp() where id=j.id;
  perform set_config('request.jwt.claim.sub',coalesce(prior_claim,''),true);
 end if;
 select * into j from assignment_blocks where id=p_id;
 return jsonb_build_object('id',j.id,'status',j.status,'assigned_to',j.assigned_to,'claimed_by',j.claimed_by,'start_window',j.start_window,'end_window',j.end_window,'completed_at',j.completed_at,'admin_completion_override_by',j.admin_completion_override_by,'updated_at',j.updated_at,'payment_status',j.payment_status);
end;$$;
revoke all on function public.integration_assignment_lifecycle(uuid,uuid,timestamptz,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.integration_assignment_lifecycle(uuid,uuid,timestamptz,text,jsonb,text) to service_role;
