create or replace function public.integration_booking_admin(p_actor uuid,p_operation text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare b referral_bookings; j assignment_blocks; result jsonb; jobid uuid;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin required';end if;
 if length(trim(coalesce(p_input->>'reason','')))<5 then raise exception 'Explain the change';end if;
 if p_operation='create_assignment' then
  if length(trim(coalesce(p_input->>'title','')))=0 or length(trim(coalesce(p_input->>'scope','')))=0 or length(trim(coalesce(p_input->>'address','')))=0 or (p_input->>'pay_amount')::numeric<0 or (p_input->>'pay_amount')::numeric<>round((p_input->>'pay_amount')::numeric,2) or (p_input->>'end_window')::timestamptz<=(p_input->>'start_window')::timestamptz then raise exception 'Provide title, scope, address, valid pay and schedule';end if;
  if not exists(select 1 from portal_properties where id=(p_input->>'property_id')::uuid) then raise exception 'Choose an existing commercial portal property';end if;
  insert into assignment_blocks(title,property_id,property_name,service_type,address,scope,pay_amount,start_window,end_window,status,visibility,created_by,metadata)
  values(p_input->>'title',(p_input->>'property_id')::uuid,(select coalesce(property_name,name,'Commercial property') from portal_properties where id=(p_input->>'property_id')::uuid),coalesce(p_input->>'service_type','Turnover'),p_input->>'address',p_input->>'scope',(p_input->>'pay_amount')::numeric,(p_input->>'start_window')::timestamptz,(p_input->>'end_window')::timestamptz,'pending','pending',p_actor,jsonb_build_object('source','admin_api','creation_reason',p_input->>'reason')) returning id into jobid;
  return jsonb_build_object('id',jobid,'status','pending','next','Read assignment, optionally reassign contractor, then explicitly release using set_status');
 end if;
 if p_operation not in ('reschedule','notes') then raise exception 'Unsupported booking operation';end if;
 select * into b from referral_bookings where id=(p_input->>'id')::uuid for update;
 if not found or b.service_date::text is distinct from p_input->>'expected_service_date' or b.status is distinct from p_input->>'expected_status' or b.payment_status is distinct from p_input->>'expected_payment_status' then raise exception 'Booking missing or changed; refresh first';end if;
 select * into j from assignment_blocks where id=b.id for update;
 if j.id is not null and j.updated_at is distinct from (p_input->>'expected_updated_at')::timestamptz then raise exception 'Assignment changed; read again';end if;
 if exists(select 1 from contractor_payouts where assignment_id=b.id) or exists(select 1 from global_payout_requests where assignment_id=b.id) then raise exception 'Reconcile pending or recorded payout first';end if;
 result=customer_portal_change(b.id,b.email,null,p_operation,p_input);
 insert into customer_portal_events(booking_id,action,actor,data) values(b.id,'admin_'||p_operation,p_actor::text,jsonb_build_object('reason',p_input->>'reason'));
 select * into b from referral_bookings where id=b.id;
 select * into j from assignment_blocks where id=b.id;
 return jsonb_build_object('booking',jsonb_build_object('id',b.id,'service_date',b.service_date,'arrival_start',b.arrival_start,'arrival_end',b.arrival_end,'status',b.status,'payment_status',b.payment_status,'notes',b.notes),'assignment',jsonb_build_object('id',j.id,'status',j.status,'assigned_to',j.assigned_to,'start_window',j.start_window,'end_window',j.end_window,'updated_at',j.updated_at));
end;$$;
revoke all on function public.integration_booking_admin(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_booking_admin(uuid,text,jsonb) to service_role;
