-- Residential contractor pay: future and unfinished work only.
alter table public.referral_bookings alter column cleaner_payout_rate set default 0.36;

create or replace function public.apply_new_clean_payout() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_revenue numeric; v_rate numeric; v_unit_pay numeric;
begin
 -- Back-entered historical completions keep their recorded compensation.
 if new.status in ('completed','complete','done','closed','cancelled','canceled') or new.completed_at is not null or coalesce(new.paid_out,false) or new.paid_at is not null then return new; end if;
 if TG_OP='UPDATE' then
  -- A repeated INSERT ... ON CONFLICT or status edit must not recalculate agreed pay.
  return new;
 end if;
 -- Commercial compensation is the Property Units preset, never a revenue percentage.
 if coalesce(new.metadata->>'source','') <> 'residential_booking'
    and coalesce(new.metadata->>'scope_type','') <> 'residential'
    and coalesce(new.metadata->>'residential_booking_id','') = '' then
  select contractor_pay into v_unit_pay from public.property_units where id=new.unit_id;
  if v_unit_pay is not null then
   new.pay_amount := v_unit_pay;
   new.metadata := (coalesce(new.metadata,'{}') - 'cleaner_payout_rate' - 'cleaner_payout_base')
     || jsonb_build_object('cleaner_payout_policy','property_unit_preset','unit_contractor_pay',v_unit_pay,'pay_review_required',false);
  end if;
  -- Non-unit commercial work retains its explicit agreed pay.
  return new;
 end if;
 if coalesce(new.metadata->>'source','')='residential_booking' then
  select amount_cents::numeric/100,0.36 into v_revenue,v_rate from referral_bookings where id=new.id;
  if not found and coalesce(new.metadata->>'residential_booking_id','') ~ '^[0-9a-fA-F-]{36}$' then
   select amount_cents::numeric/100,0.36 into v_revenue,v_rate from referral_bookings where id=(new.metadata->>'residential_booking_id')::uuid;
  end if;
  if v_rate is null then return new; end if;
 else
  v_rate:=0.36;
  if new.unit_id is not null then select customer_price into v_revenue from property_units where id=new.unit_id; end if;
  if v_revenue is null and coalesce(new.metadata->>'unit_customer_price','') ~ '^[0-9]+([.][0-9]+)?$' then v_revenue:=(new.metadata->>'unit_customer_price')::numeric; end if;
  if v_revenue is null and coalesce(new.metadata->>'customer_price','') ~ '^[0-9]+([.][0-9]+)?$' then v_revenue:=(new.metadata->>'customer_price')::numeric; end if;
 end if;
 if v_revenue is not null and v_revenue>0 then
  new.pay_amount:=round(v_revenue*v_rate,2);
  new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('cleaner_payout_rate',v_rate,'cleaner_payout_base',v_revenue,'cleaner_payout_policy','36_percent_before_gift_cards','unit_contractor_pay',new.pay_amount,'pay_review_required',false);
 else
  new.pay_amount:=0;
  new.status:='pending';new.visibility:='pending';
  new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('cleaner_payout_rate',v_rate,'pay_review_required',true,'admin_approval_status','pending');
 end if;
 return new;
end $$;
revoke all on function public.apply_new_clean_payout() from public,anon,authenticated;

-- Serialize with assignment/payment writers while capturing the previous values.
lock table public.assignment_blocks, public.contractor_payouts in share row exclusive mode;
with eligible as (
 select a.id,b.id as booking_id,
 coalesce(b.amount_cents::numeric/100,u.customer_price,
  case when a.metadata->>'unit_customer_price' ~ '^[0-9]+([.][0-9]+)?$' then (a.metadata->>'unit_customer_price')::numeric end,
  case when a.metadata->>'customer_price' ~ '^[0-9]+([.][0-9]+)?$' then (a.metadata->>'customer_price')::numeric end,
  case when a.metadata->>'cleaner_payout_base' ~ '^[0-9]+([.][0-9]+)?$' then (a.metadata->>'cleaner_payout_base')::numeric end) as revenue
 from public.assignment_blocks a
 left join public.referral_bookings b on b.id=coalesce(
  case when a.metadata->>'residential_booking_id' ~ '^[0-9a-fA-F-]{36}$' then (a.metadata->>'residential_booking_id')::uuid end,a.id)
 left join public.property_units u on u.id=a.unit_id
 where (a.metadata->>'source'='residential_booking' or a.metadata->>'scope_type'='residential' or coalesce(a.metadata->>'residential_booking_id','')<>'')
 and a.status not in ('completed','complete','done','closed','cancelled','canceled','declined')
 and a.completed_at is null and not coalesce(a.paid_out,false) and a.paid_at is null
 and coalesce(a.paid_amount,0)=0
 and coalesce(a.payment_status,'') not in ('paid','processing','pending_transfer')
 and coalesce(a.pay_status,'') not in ('paid','processing','pending_transfer')
 and coalesce(a.payout_status,'') not in ('paid','processing','pending_transfer')
 and coalesce(a.quickbooks_payment_status,'') not in ('paid','processing','pending_transfer')
 and not exists(select 1 from public.contractor_payouts p where p.assignment_id=a.id)
), updated as (
 update public.assignment_blocks a set pay_amount=round(e.revenue*0.36,2),
 metadata=coalesce(a.metadata,'{}')||jsonb_build_object(
  'cleaner_payout_rate',0.36,'cleaner_payout_base',e.revenue,
  'cleaner_payout_policy','36_percent_before_gift_cards','unit_contractor_pay',round(e.revenue*0.36,2),
  'pay_review_required',false,'residential_rate_change',jsonb_build_object(
   'previous_pay',a.pay_amount,'previous_rate',a.metadata->'cleaner_payout_rate','changed_at',now()))
 from eligible e where a.id=e.id and e.revenue>0
 returning e.booking_id
)
update public.referral_bookings b set cleaner_payout_rate=0.36
where b.id in (select booking_id from updated);

-- Active bookings without an assignment also use the new rate. Historical bookings stay unchanged.
update public.referral_bookings b set cleaner_payout_rate=0.36
where b.status not in ('completed','complete','done','closed','cancelled','canceled','declined')
and not exists(select 1 from public.assignment_blocks a where a.id=b.id or a.metadata->>'residential_booking_id'=b.id::text);

