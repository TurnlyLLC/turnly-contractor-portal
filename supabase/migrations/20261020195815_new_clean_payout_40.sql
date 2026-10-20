-- Existing bookings have NULL; the default applies only to future bookings.
alter table public.referral_bookings add column cleaner_payout_rate numeric(4,3);
alter table public.referral_bookings alter column cleaner_payout_rate set default 0.40;

create function public.apply_new_clean_payout() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_revenue numeric; v_rate numeric; v_booking uuid;
begin
 -- Back-entered historical completions keep their recorded compensation.
 if new.status in ('completed','complete','done','closed') and nullif(to_jsonb(new)->>'start_window','')::timestamptz < now() then return new; end if;
 if TG_OP='UPDATE' then
  -- A repeated INSERT ... ON CONFLICT or status edit must not recalculate agreed pay.
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
create trigger set_new_clean_payout before insert on public.assignment_blocks for each row execute function public.apply_new_clean_payout();
