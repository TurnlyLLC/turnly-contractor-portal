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
