create or replace function public.apply_new_clean_payout() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_revenue numeric; v_rate numeric; v_unit_pay numeric;
begin
 -- Back-entered historical completions keep their recorded compensation.
 if new.status in ('completed','complete','done','closed') and nullif(to_jsonb(new)->>'start_window','')::timestamptz < now() then return new; end if;
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
  select amount_cents::numeric/100,cleaner_payout_rate into v_revenue,v_rate from referral_bookings where id=new.id;
  if not found and coalesce(new.metadata->>'residential_booking_id','') ~ '^[0-9a-fA-F-]{36}$' then
   select amount_cents::numeric/100,0.40 into v_revenue,v_rate from referral_bookings where id=(new.metadata->>'residential_booking_id')::uuid;
  end if;
  if v_rate is null then return new; end if;
 else
  v_rate:=0.40;
  if new.unit_id is not null then select customer_price into v_revenue from property_units where id=new.unit_id; end if;
  if v_revenue is null and coalesce(new.metadata->>'unit_customer_price','') ~ '^[0-9]+(\.[0-9]+)?$' then v_revenue:=(new.metadata->>'unit_customer_price')::numeric; end if;
  if v_revenue is null and coalesce(new.metadata->>'customer_price','') ~ '^[0-9]+(\.[0-9]+)?$' then v_revenue:=(new.metadata->>'customer_price')::numeric; end if;
 end if;
 if v_revenue is not null and v_revenue>0 then
  new.pay_amount:=round(v_revenue*v_rate,2);
  new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('cleaner_payout_rate',v_rate,'cleaner_payout_base',v_revenue,'cleaner_payout_policy','40_percent_new_cleans','unit_contractor_pay',new.pay_amount,'pay_review_required',false);
 else
  new.pay_amount:=0;
  new.status:='pending';new.visibility:='pending';
  new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('cleaner_payout_rate',v_rate,'pay_review_required',true,'admin_approval_status','pending');
 end if;
 return new;
end $$;
revoke all on function public.apply_new_clean_payout() from public,anon,authenticated;

-- Repair only unpaid, unclaimed upcoming commercial jobs changed by the faulty rule.
-- Keep the previous value on the assignment for audit; protect payment reservations.
update public.assignment_blocks a
set pay_amount=u.contractor_pay,
 metadata=(coalesce(a.metadata,'{}') - 'cleaner_payout_rate' - 'cleaner_payout_base') ||
 jsonb_build_object('cleaner_payout_policy','property_unit_preset','unit_contractor_pay',u.contractor_pay,
 'pay_review_required',false,'commercial_pay_correction',jsonb_build_object('previous_pay',a.pay_amount,'corrected_at',now(),'reason','Restore Property Units preset; 40 percent is residential only'))
from public.property_units u
where a.unit_id=u.id and u.contractor_pay is not null
 and a.metadata->>'cleaner_payout_policy'='40_percent_new_cleans'
 and coalesce(a.metadata->>'source','')<>'residential_booking'
 and coalesce(a.metadata->>'scope_type','')<>'residential'
 and coalesce(a.metadata->>'residential_booking_id','')=''
 and a.status in ('pending','open','preferred_pending','scheduled')
 and a.claimed_by is null and a.assigned_to is null and a.started_at is null and a.completed_at is null
 and (a.start_window is null or a.start_window>=now())
 and not coalesce(a.paid_out,false) and a.paid_at is null
 and coalesce(a.payment_status,'') not in ('paid','processing','pending_transfer')
 and coalesce(a.pay_status,'') not in ('paid','processing','pending_transfer')
 and coalesce(a.payout_status,'') not in ('paid','processing','pending_transfer')
 and coalesce(a.quickbooks_payment_status,'')<>'paid'
 and not exists(select 1 from public.contractor_payouts p where p.assignment_id=a.id);
