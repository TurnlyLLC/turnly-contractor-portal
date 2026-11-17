create table public.ba_referral_aliases(code text primary key check(code ~ '^BA-[A-Z0-9]{16}$'),member_id uuid not null references public.ba_members(user_id),created_at timestamptz not null default now());
create index ba_referral_aliases_member on public.ba_referral_aliases(member_id);
alter table public.ba_referral_aliases enable row level security;
revoke all on public.ba_referral_aliases from public,anon,authenticated;
grant all on public.ba_referral_aliases to service_role;
create table public.integration_owner_changes(id uuid primary key default gen_random_uuid(),actor uuid not null references public.profiles(id),kind text not null,record_id uuid not null,reason text not null,before_data jsonb not null,after_data jsonb not null,customer_authorization_reference text,created_at timestamptz not null default now());
create index integration_owner_changes_record on public.integration_owner_changes(kind,record_id,created_at desc);
alter table public.integration_owner_changes enable row level security;
revoke all on public.integration_owner_changes from public,anon,authenticated;
grant all on public.integration_owner_changes to service_role;

create function public.integration_owner_snapshot(p_actor uuid,p_kind text,p_id uuid)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active')then raise exception 'Active administrator required';end if;
 if p_kind='ambassador'then select jsonb_build_object('user_id',user_id,'name',name,'email',email,'code',code,'enabled',enabled) into r from ba_members where user_id=p_id;
 elsif p_kind='referral'then select to_jsonb(l) into r from ba_leads l where id=p_id;
 elsif p_kind='recurring'then select to_jsonb(p) into r from customer_recurring_plans p where id=p_id;
 else raise exception 'Unsupported record kind';end if;
 if r is null then raise exception 'Record unavailable';end if;
 return jsonb_build_object('record',r,'revision',md5(r::text));
end $$;
revoke all on function public.integration_owner_snapshot(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.integration_owner_snapshot(uuid,text,uuid) to service_role;

create function public.integration_owner_apply(p_actor uuid,p_review uuid)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integration_review_plans; d jsonb; before_value jsonb; after_value jsonb; s jsonb; k text; rid uuid; cp customer_recurring_plans; b referral_bookings; contractor profiles;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active')then raise exception 'Active administrator required';end if;
 select * into v from integration_review_plans where id=p_review and actor=p_actor and kind='owner-expansion' and expires_at>now() for update;
 if not found then raise exception 'Preview expired; preview again';end if;
 if v.state='applied' then return v.result;end if;
 k:=v.data->>'kind';rid:=(v.data->>'id')::uuid;d:=v.data->'data';
 if k in ('ambassador','referral')then perform pg_advisory_xact_lock(610081200);end if;
 if k='ambassador'then perform 1 from ba_members where user_id=rid for update;
 elsif k='referral'then perform 1 from ba_leads where id=rid for update;
 elsif k='recurring'then perform 1 from customer_recurring_plans where id=rid for update;
 else raise exception 'Unsupported operation';end if;
 s:=integration_owner_snapshot(p_actor,k,rid);before_value:=s->'record';
 if s->>'revision' is distinct from v.data->>'revision'then raise exception 'Record changed. Preview again';end if;
 if k='ambassador'then
  if d - array['name','code'] <> '{}'::jsonb then raise exception 'Unsupported ambassador fields';end if;
  if d ? 'code' and d->>'code' is distinct from before_value->>'code'then
   if (d->>'code') !~ '^BA-[A-Z0-9]{16}$' or exists(select 1 from ba_members where code=d->>'code') or exists(select 1 from ba_referral_aliases where code=d->>'code')then raise exception 'Referral code unavailable';end if;
   insert into ba_referral_aliases(code,member_id)values(before_value->>'code',rid) on conflict(code) do nothing;
  end if;
  if d ? 'name' and (length(trim(d->>'name'))not between 1 and 160)then raise exception 'Invalid name';end if;
  update ba_members set name=coalesce(d->>'name',name),code=coalesce(d->>'code',code)where user_id=rid;
 elsif k='referral'then
  if d - array['member_id'] <> '{}'::jsonb then raise exception 'Unsupported referral fields';end if;
  if not exists(select 1 from ba_members where user_id=(d->>'member_id')::uuid and enabled)then raise exception 'Destination ambassador is inactive';end if;
  if exists(select 1 from ba_earnings where lead_id=rid and paid_at is not null)then raise exception 'Paid earnings require separate reconciliation; historical payee cannot be reassigned';end if;
  update ba_leads set member_id=(d->>'member_id')::uuid where id=rid;
  insert into ba_events(lead_id,event)values(rid,'admin_reassigned:'||(before_value->>'member_id')||':'||(d->>'member_id'));
 else
  if d - array['status','frequency','price_cents','anchor_day','preferred_contractor_id'] <> '{}'::jsonb then raise exception 'Unsupported plan fields';end if;
  if (d ? 'price_cents' or d ? 'frequency' or d->>'status'='active') and length(trim(coalesce(v.data->>'customer_authorization_reference','')))<5 then raise exception 'Customer authorization reference required';end if;
  select * into cp from customer_recurring_plans where id=rid;
  select * into b from referral_bookings where id=cp.latest_booking_id;
  if d->>'status'='active' and (b.status='cancelled' or b.assignment_deleted_at is not null or b.stripe_payment_method is null)then raise exception 'Latest visit must be reconciled and have a saved payment method before resuming';end if;
  if d->>'preferred_contractor_id' is not null then
   select * into contractor from profiles where id=(d->>'preferred_contractor_id')::uuid and role::text='contractor' and status='active';
   if not found then raise exception 'Preferred contractor unavailable';end if;
  end if;
  update customer_recurring_plans set status=coalesce(d->>'status',status),frequency=coalesce(d->>'frequency',frequency),price_cents=coalesce((d->>'price_cents')::integer,price_cents),anchor_day=coalesce((d->>'anchor_day')::integer,anchor_day),
   preferred_contractor_id=case when d ? 'preferred_contractor_id'then contractor.id else preferred_contractor_id end,
   preferred_contractor_name=case when d ? 'preferred_contractor_id'then contractor.full_name else preferred_contractor_name end,
   review_reason=case when d->>'status'='active'then null else v.data->>'reason'end where id=rid;
  insert into customer_portal_events(booking_id,actor,action,data)values(cp.latest_booking_id,'admin:'||p_actor,'admin_recurring_plan_change',jsonb_build_object('plan_id',rid,'changes',d,'reason',v.data->>'reason','customer_authorization_reference',v.data->>'customer_authorization_reference'));
 end if;
 after_value:=integration_owner_snapshot(p_actor,k,rid);
 insert into integration_owner_changes(actor,kind,record_id,reason,before_data,after_data,customer_authorization_reference)values(p_actor,k,rid,v.data->>'reason',before_value,after_value->'record',v.data->>'customer_authorization_reference');
 update integration_review_plans set state='applied',result=after_value where id=v.id;
 return after_value;
end $$;
revoke all on function public.integration_owner_apply(uuid,uuid) from public,anon,authenticated;
grant execute on function public.integration_owner_apply(uuid,uuid) to service_role;
notify pgrst,'reload schema';
