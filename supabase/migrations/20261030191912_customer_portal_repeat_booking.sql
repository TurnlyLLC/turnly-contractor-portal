create table public.customer_recurring_plans (
 id uuid primary key default gen_random_uuid(), account_id uuid references public.residential_accounts(id),user_id uuid references auth.users(id),
 anchor_booking_id uuid not null references public.referral_bookings(id),latest_booking_id uuid not null references public.referral_bookings(id),
 frequency text not null check(frequency in ('weekly','biweekly','monthly')),price_cents integer not null check(price_cents>0),
 preferred_contractor_id uuid references public.profiles(id),preferred_contractor_name text,
 anchor_day integer not null check(anchor_day between 1 and 31),status text not null default 'active' check(status in ('active','needs_review','cancelled')),
 review_reason text,consent_text text not null,created_at timestamptz not null default now(),
 check(num_nonnulls(account_id,user_id)=1)
);
alter table public.customer_recurring_plans enable row level security;
revoke all on public.customer_recurring_plans from public,anon,authenticated;
grant all on public.customer_recurring_plans to service_role;
create index customer_recurring_plans_account on public.customer_recurring_plans(account_id);
create index customer_recurring_plans_user on public.customer_recurring_plans(user_id);
alter table public.referral_bookings add column recurring_plan_id uuid references public.customer_recurring_plans(id);
create index referral_bookings_recurring_plan on public.referral_bookings(recurring_plan_id);

-- Booking, gift reservation and plan enrollment succeed together or roll back together.
create function public.customer_portal_book_v2(p_anchor uuid,p_email text,p_uid uuid,p_account uuid,p_request text,p_data jsonb,p_plan uuid default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare b referral_bookings; new_id uuid; plan customer_recurring_plans; contractor profiles; v_frequency text; final_status text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request,0));
 select * into b from referral_bookings where id=p_anchor and assignment_deleted_at is null for update;
 if not found then raise exception 'Booking unavailable'; end if;
 if p_uid is null then
  if not exists(select 1 from residential_accounts a where a.id=p_account and a.email=p_email and
   ((a.booking_ids is null and b.email=a.email) or b.id=any(a.booking_ids))) then raise exception 'Booking unavailable'; end if;
 elsif not exists(select 1 from residential_referral_links where user_id=p_uid and booking_id=b.id) then raise exception 'Booking unavailable'; end if;
 select id into new_id from referral_bookings where request_hash=p_request;
 if found then return new_id; end if;
 v_frequency:=coalesce(p_data->'quote'->>'frequency','once');
 if v_frequency not in ('once','weekly','biweekly','monthly') or (v_frequency<>'once' and p_data->'quote'->>'service'<>'standard') then raise exception 'Choose a valid cleaning plan'; end if;
 if jsonb_typeof(p_data->'visit_details') is distinct from 'object' then raise exception 'Confirm your home details'; end if;
 if v_frequency<>'once' and p_plan is null then
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_account::text,p_uid::text)||':'||lower(trim(b.property_address))||':'||b.zip,0));
  if exists(select 1 from customer_recurring_plans cp join referral_bookings prior on prior.id=cp.anchor_booking_id
    where cp.status in ('active','needs_review') and (cp.account_id=p_account or cp.user_id=p_uid)
    and lower(trim(prior.property_address))=lower(trim(b.property_address)) and prior.zip=b.zip) then
   raise exception 'This home already has a recurring plan. Manage your existing plan before starting another.';
  end if;
 end if;
 if p_plan is not null then
  select * into plan from customer_recurring_plans where id=p_plan for update;
  if not found or plan.status<>'active' or plan.latest_booking_id<>b.id or plan.frequency<>v_frequency or
    (p_data->'quote'->>'amount_cents')::integer<>plan.price_cents then raise exception 'Plan changed; refresh before scheduling'; end if;
  if not exists(select 1 from assignment_blocks where id=b.id and status in ('qa_pending','completed')) then raise exception 'Finish the previous visit before scheduling the next'; end if;
 end if;
 -- The legacy RPC also rechecks the booking owner and saved payment method.
 new_id:=customer_portal_rebook(p_anchor,p_email,p_uid,p_request,p_data);
 update referral_bookings set frequency=v_frequency,visit_details=p_data->'visit_details',
  sqft=coalesce((p_data->'quote'->>'sqft')::integer,b.sqft),beds=coalesce((p_data->>'beds')::integer,b.beds),baths=coalesce((p_data->>'baths')::numeric,b.baths) where id=new_id;
 if nullif(p_data->>'gift_code','') is not null then
  select status into final_status from referral_bookings where id=new_id;
  update referral_bookings set status='requested' where id=new_id;
  if gift_reserve(new_id,p_data->>'gift_code')<>(p_data->>'gift_expected_cents')::integer then raise exception 'Gift balance changed. Refresh your quote before booking.'; end if;
  update referral_bookings set status=final_status where id=new_id;
 end if;
 if v_frequency<>'once' then
  if p_plan is null then
   select p.* into contractor from assignment_blocks j join profiles p on p.id=coalesce(j.claimed_by,j.assigned_to,j.completed_by)
    join referral_bookings prior on prior.id=j.id
    where (j.id=b.id or (prior.email=b.email and lower(trim(prior.property_address))=lower(trim(b.property_address)) and prior.zip=b.zip and j.status in ('qa_pending','completed')))
    and p.role::text='contractor' and p.status='active'
    order by (j.id=b.id) desc,j.completed_at desc nulls last limit 1;
   insert into customer_recurring_plans(account_id,user_id,anchor_booking_id,latest_booking_id,frequency,price_cents,preferred_contractor_id,preferred_contractor_name,anchor_day,consent_text)
    values(p_account,p_uid,b.id,new_id,v_frequency,(p_data->'quote'->>'amount_cents')::integer,contractor.id,contractor.full_name,extract(day from (p_data->>'service_date')::date),p_data->>'consent_text') returning * into plan;
  else update customer_recurring_plans set latest_booking_id=new_id where id=p_plan returning * into plan; end if;
  update referral_bookings set recurring_plan_id=plan.id where id=new_id;
 end if;
 if p_uid is null then perform link_customer_rebooking(p_account,p_anchor,new_id); end if;
 return new_id;
end $$;
revoke all on function public.customer_portal_book_v2(uuid,text,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.customer_portal_book_v2(uuid,text,uuid,uuid,text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
