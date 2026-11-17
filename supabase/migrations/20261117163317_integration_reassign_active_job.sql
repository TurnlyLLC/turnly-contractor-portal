create or replace function public.integration_assignment_change(p_actor uuid,p_id uuid,p_expected timestamptz,p_patch jsonb,p_reason text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare j assignment_blocks; c profiles; m jsonb; previous jsonb; new_pay numeric;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin required';end if;
 if jsonb_typeof(p_patch)<>'object' or p_patch='{}' or exists(select 1 from jsonb_object_keys(p_patch) f where f not in ('contractor_id','pay_amount')) or coalesce(length(trim(p_reason)),0)=0 then raise exception 'Invalid patch';end if;
 select * into j from assignment_blocks where id=p_id for update;
 if not found then raise exception 'Assignment missing';end if;
 if p_expected is null or j.updated_at is distinct from p_expected then raise exception 'assignment_conflict';end if;
 if j.paid_at is not null or coalesce(j.paid_out,false) or 'paid'=any(array[j.payment_status,j.pay_status,j.payout_status,j.quickbooks_payment_status,j.metadata->'payment'->>'status']) or
 exists(select 1 from contractor_payouts where assignment_id=j.id) or exists(select 1 from global_payout_requests where assignment_id=j.id) then raise exception 'Assignment payout already recorded or pending';end if;
 previous=jsonb_build_object('assigned_to',j.assigned_to,'claimed_by',j.claimed_by,'pay_amount',j.pay_amount,'status',j.status,'started_by',j.started_by,'started_at',j.started_at);
 m=coalesce(j.metadata,'{}'::jsonb);
 if p_patch ? 'contractor_id' then
 select * into c from profiles where id=(p_patch->>'contractor_id')::uuid and role::text='contractor' and status='active';
 if not found then raise exception 'Active contractor required';end if;
 if j.status='in_progress' and coalesce(j.claimed_by,j.assigned_to) is distinct from c.id then j.status='claimed';j.started_by=null;j.started_at=null;end if;
 j.assigned_to=c.id;j.assigned_to_name=c.full_name;j.assigned_to_email=c.email;
 if j.claimed_by is not null then j.claimed_by=c.id;j.claimed_by_name=c.full_name;j.claimed_by_email=c.email;end if;
 j.preferred_contractor_ids=array[c.id];j.preferred_contractor_names=array[coalesce(c.full_name,c.email)];j.visibility='preferred';
 m=m||jsonb_build_object('assigned_contractor_ids',jsonb_build_array(c.id),'assigned_contractors',jsonb_build_array(jsonb_build_object('id',c.id,'name',c.full_name,'email',c.email)));
 end if;
 if p_patch ? 'pay_amount' then
 if jsonb_typeof(p_patch->'pay_amount')<>'number' then raise exception 'Invalid pay amount';end if;
 new_pay=(p_patch->>'pay_amount')::numeric;
 if new_pay<0 or new_pay<>round(new_pay,2) then raise exception 'Invalid pay amount';end if;
 j.pay_amount=new_pay;
 m=m||jsonb_build_object('unit_contractor_pay',new_pay,'contractor_pay_override',true,'cleaner_payout_policy','admin_assignment_override');
 end if;
 m=m||jsonb_build_object('last_api_assignment_change',jsonb_build_object('actor',p_actor,'at',now(),'reason',left(p_reason,1000),'previous',previous));
 update assignment_blocks set assigned_to=j.assigned_to,assigned_to_name=j.assigned_to_name,assigned_to_email=j.assigned_to_email,
 claimed_by=j.claimed_by,claimed_by_name=j.claimed_by_name,claimed_by_email=j.claimed_by_email,
 preferred_contractor_ids=j.preferred_contractor_ids,preferred_contractor_names=j.preferred_contractor_names,visibility=j.visibility,pay_amount=j.pay_amount,status=j.status,started_by=j.started_by,started_at=j.started_at,metadata=m,updated_at=clock_timestamp()
 where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'assigned_to',j.assigned_to,'assigned_to_name',j.assigned_to_name,'claimed_by',j.claimed_by,'pay_amount',j.pay_amount,'status',j.status,'updated_at',j.updated_at);
end;$$;
revoke all on function public.integration_assignment_change(uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.integration_assignment_change(uuid,uuid,timestamptz,jsonb,text) to service_role;
