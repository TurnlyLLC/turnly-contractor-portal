-- One atomic batch: either every reviewed item succeeds or none is changed.
create table public.crm_pay_batches(
 id uuid primary key,admin_id uuid not null references public.profiles(id),
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.crm_pay_batches enable row level security;
revoke all on public.crm_pay_batches from public,anon,authenticated;
grant select,insert on public.crm_pay_batches to service_role;
create function public.crm_bulk_pay_review(p_admin uuid,p_request uuid,p_action text,p_items jsonb,p_reference text default '') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare payload jsonb; previous public.crm_pay_batches; item jsonb; uid uuid; result jsonb; total bigint:=0; item_count integer; reference text:=trim(coalesce(p_reference,''));
begin
 if not exists(select 1 from public.profiles where id=p_admin and role::text='admin' and status='active') then raise exception 'Administrator access required';end if;
 if p_request is null or p_action not in ('approve','record_paid') or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid bulk review';end if;
 item_count:=jsonb_array_length(p_items);
 if item_count<1 or item_count>500 then raise exception 'Select between 1 and 500 earnings items per batch';end if;
 if p_action='record_paid' and length(reference) not between 3 and 240 then raise exception 'Enter a completed payment or bank batch reference';end if;
 payload:=jsonb_build_object('action',p_action,'items',p_items,'reference',reference);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,706));
 select * into previous from public.crm_pay_batches where id=p_request;
 if found then
  if previous.admin_id<>p_admin or previous.payload<>payload then raise exception 'This batch ID was used for a different review';end if;
  return previous.result;
 end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where x->>'kind' is null or x->>'kind' not in ('hourly','commission') or x->>'user_id' is null or x->>'amount_cents' is null or (x->>'amount_cents')::bigint<=0) then raise exception 'Invalid earnings item';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'kind',coalesce(x->>'order_id',x->>'id',(x->>'user_id')||':'||(x->>'period_start')) having count(*)>1) then raise exception 'Duplicate items in batch';end if;
 -- Same lock order for concurrent bulk requests, before entering individual review routines.
 for uid in select distinct (x->>'user_id')::uuid from jsonb_array_elements(p_items) x order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(uid::text,705));
 end loop;
 for item in select x from jsonb_array_elements(p_items) x order by x->>'kind',x->>'user_id',coalesce(x->>'order_id',x->>'id',x->>'period_start') loop
  uid:=(item->>'user_id')::uuid;
  if item->>'kind'='hourly' then
   if p_action='record_paid' and not exists(select 1 from public.crm_hourly_payments where id=(item->>'id')::uuid and user_id=uid and paid_at is null) then raise exception 'An hourly item changed or is already paid. Refresh the batch';end if;
   if p_action='approve' and exists(select 1 from public.crm_hourly_payments where user_id=uid and period_end=(item->>'period_end')::timestamptz) then raise exception 'An hourly period is already approved. Refresh the batch';end if;
   perform public.crm_hourly_payment_review(p_admin,uid,p_action,(item->>'period_start')::timestamptz,(item->>'period_end')::timestamptz,(item->>'amount_cents')::bigint,(item->>'id')::uuid,reference);
  else
   if not exists(select 1 from public.crm_sales_commissions where order_id=(item->>'order_id')::uuid and sales_user_id=uid) then raise exception 'Commission does not belong to the selected representative';end if;
   perform public.crm_commission_payment_review(p_admin,(item->>'order_id')::uuid,p_action,reference,(item->>'amount_cents')::integer);
  end if;
  total:=total+(item->>'amount_cents')::bigint;
 end loop;
 result:=jsonb_build_object('batch_id',p_request,'action',p_action,'item_count',item_count,'amount_cents',total,'representatives',(select count(distinct x->>'user_id') from jsonb_array_elements(p_items) x));
 insert into public.crm_pay_batches(id,admin_id,payload,result)values(p_request,p_admin,payload,result);
 return result;
end $$;
revoke all on function public.crm_bulk_pay_review(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_bulk_pay_review(uuid,uuid,text,jsonb,text) to service_role;
