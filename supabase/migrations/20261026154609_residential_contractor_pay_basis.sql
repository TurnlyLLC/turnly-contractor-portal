-- Fill upcoming, unclaimed residential assignments from the full service price.
-- Do not revise historical, claimed, in-progress, completed, or paid compensation.
update public.assignment_blocks a
set pay_amount=round(b.amount_cents::numeric * 0.40)/100,
 metadata=coalesce(a.metadata,'{}')||jsonb_build_object(
 'cleaner_payout_rate',0.40,'cleaner_payout_base',b.amount_cents::numeric/100,
 'cleaner_payout_policy','40_percent_before_gift_cards',
 'unit_contractor_pay',round(b.amount_cents::numeric*0.40)/100,'pay_review_required',false)
from public.referral_bookings b
where a.id=b.id and a.metadata->>'source'='residential_booking'
and a.status in ('pending','open','preferred_pending','scheduled')
and a.claimed_by is null and a.assigned_to is null and a.started_at is null and a.completed_at is null
and (a.start_window is null or a.start_window>=now())
and b.status='scheduled' and b.amount_cents>0;
