alter table public.assignment_blocks add column residential_payment_state text;

-- Only expose the collection outcome, never payment credentials or amounts.
create function public.guard_residential_job_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  booking public.referral_bookings%rowtype;
  residential boolean;
begin
  select * into booking from public.referral_bookings where id = new.id;
  residential := booking.id is not null or new.metadata->>'source' = 'residential_booking'
    or new.metadata->>'scope_type' = 'residential' or nullif(new.metadata->>'residential_booking_id','') is not null;
  if tg_op = 'UPDATE' then
    residential := residential or old.residential_payment_state is not null;
  end if;
  if residential is not true then
    new.residential_payment_state := null;
    return new;
  end if;
  new.residential_payment_state := case
    when booking.payment_status = 'paid' and booking.paid_at is not null then 'paid'
    when booking.payment_status = 'action_required' then 'action_required'
    else 'uncollected' end;
  if new.residential_payment_state <> 'paid' and
    (tg_op = 'INSERT' or new.status is distinct from old.status or new.started_at is distinct from old.started_at)
    and (new.status in ('en_route','in_progress','qa_pending','completed') or
      (new.started_at is not null and (tg_op='INSERT' or old.started_at is null))) then
    raise exception 'Payment hold: customer payment has not cleared. Do not start or complete this clean until payment is confirmed.';
  end if;
  return new;
end $$;
revoke all on function public.guard_residential_job_payment() from public, anon, authenticated;
create trigger guard_residential_job_payment before insert or update on public.assignment_blocks
for each row execute function public.guard_residential_job_payment();

create function public.sync_residential_job_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The assignment trigger derives the visible state from the authoritative booking.
  update public.assignment_blocks set residential_payment_state = null where id = new.id;
  return new;
end $$;
revoke all on function public.sync_residential_job_payment() from public, anon, authenticated;
create trigger sync_residential_job_payment after insert or update of payment_status,paid_at on public.referral_bookings
for each row execute function public.sync_residential_job_payment();

update public.assignment_blocks a set residential_payment_state = null
where metadata->>'source' = 'residential_booking' or metadata->>'scope_type' = 'residential'
or nullif(metadata->>'residential_booking_id','') is not null or exists(select 1 from public.referral_bookings b where b.id=a.id);
