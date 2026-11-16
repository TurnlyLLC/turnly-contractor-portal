alter table public.integration_keys add column deny_record_deletion boolean not null default false;
update public.integration_keys k set deny_record_deletion=true where exists(select 1 from public.owner_voice_sessions s where s.key_id=k.id);

create or replace function public.owner_voice_accept(p_id uuid,p_call_id text,p_key_id uuid,p_hash text,p_prefix text,p_sealed text,p_owner uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s owner_voice_sessions;
begin
 select * into s from owner_voice_sessions where id=p_id for update;
 if not found or s.owner_id<>p_owner or s.expires_at<=now() or s.callback_sid is null or s.state not in ('connecting','accepting') or
 (s.openai_call_id is not null and s.openai_call_id<>p_call_id) or not exists(select 1 from profiles where id=p_owner and role::text='admin' and status='active') then return null;end if;
 if s.key_id is null then
 insert into integration_keys(id,name,secret_hash,prefix,scopes,created_by,expires_at,deny_record_deletion)
 values(p_key_id,'Private voice session '||p_id,p_hash,p_prefix,array['platform:full'],p_owner,least(s.expires_at,now()+interval '6 minutes'),true);
 update owner_voice_sessions set key_id=p_key_id,key_sealed=p_sealed,openai_call_id=p_call_id,state='accepting' where id=p_id returning * into s;
 end if;
 return jsonb_build_object('key_sealed',s.key_sealed);
end;$$;

create or replace function public.integration_action_claim(p_key uuid,p_request text,p_hash text,p_operation text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous integration_operations; k integration_keys;
begin
 select ik.* into k from integration_keys ik join profiles p on p.id=ik.created_by where ik.id=p_key and ik.revoked_at is null and (ik.expires_at is null or ik.expires_at>now()) and p.role::text='admin' and p.status='active' for update of ik;
 if not found then raise exception 'invalid_key';end if;
 if k.deny_record_deletion and p_operation ~* '(^|[._])(delete|remove|purge|destroy)([._]|$)' then raise exception 'record_deletion_denied';end if;
 select * into previous from integration_operations where key_id=p_key and request_key=p_request;
 if found then
 if previous.body_hash<>p_hash or previous.operation<>p_operation then raise exception 'idempotency_conflict';end if;
 if previous.state='completed' then return jsonb_build_object('replayed',true,'response',previous.response);end if;
 raise exception 'operation_pending_or_uncertain_conflict';end if;
 insert into integration_operations(key_id,request_key,body_hash,operation) values(p_key,p_request,p_hash,p_operation);
 return jsonb_build_object('replayed',false);
end;$$;

create function public.integration_assignment_change(p_actor uuid,p_id uuid,p_expected timestamptz,p_patch jsonb,p_reason text) returns jsonb
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
 previous=jsonb_build_object('assigned_to',j.assigned_to,'claimed_by',j.claimed_by,'pay_amount',j.pay_amount);
 m=coalesce(j.metadata,'{}'::jsonb);
 if p_patch ? 'contractor_id' then
 select * into c from profiles where id=(p_patch->>'contractor_id')::uuid and role::text='contractor' and status='active';
 if not found then raise exception 'Active contractor required';end if;
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
 preferred_contractor_ids=j.preferred_contractor_ids,preferred_contractor_names=j.preferred_contractor_names,visibility=j.visibility,pay_amount=j.pay_amount,metadata=m,updated_at=now()
 where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'assigned_to',j.assigned_to,'assigned_to_name',j.assigned_to_name,'claimed_by',j.claimed_by,'pay_amount',j.pay_amount,'status',j.status,'updated_at',j.updated_at);
end;$$;
revoke all on function public.integration_assignment_change(uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.integration_assignment_change(uuid,uuid,timestamptz,jsonb,text) to service_role;
