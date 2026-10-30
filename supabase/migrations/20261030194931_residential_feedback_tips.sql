-- Feedback is private to the customer and Turnly; tip earnings are read-only
-- to the beneficiary. Customer ownership is checked by the cookie-auth API.
create table public.residential_feedback (
 booking_id uuid primary key references public.referral_bookings(id),
 contractor_id uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 clean_rating smallint check(clean_rating between 1 and 5),
 contractor_rating smallint check(contractor_rating between 1 and 5),
 comments text not null default '' check(length(comments)<=2000),
 submitted_at timestamptz,
 email_attempt_at timestamptz,
 email_sent_at timestamptz,
 email_id text
);
create index residential_feedback_unsent on public.residential_feedback(created_at) where email_sent_at is null;
alter table public.residential_feedback enable row level security;
revoke all on public.residential_feedback from anon,authenticated;
grant all on public.residential_feedback to service_role;

create table public.residential_booking_tips (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.residential_feedback(booking_id),
 contractor_id uuid not null references public.profiles(id),
 amount_cents integer not null check(amount_cents between 100 and 100000),
 stripe_customer text not null,
 stripe_payment_method text not null,
 stripe_payment_intent text unique,
 status text not null default 'pending' check(status in ('pending','processing','requires_action','failed','succeeded','refunded','disputed')),
 net_cents integer not null default 0 check(net_cents>=0 and net_cents<=amount_cents),
 consent_text text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 paid_at timestamptz,
 paid_by uuid references public.profiles(id),
 paid_amount_cents integer,
 payment_reference text,
 check((paid_at is null)=(paid_amount_cents is null))
);
create index residential_booking_tips_contractor on public.residential_booking_tips(contractor_id,created_at desc);
alter table public.residential_booking_tips enable row level security;
revoke all on public.residential_booking_tips from anon,authenticated;
grant all on public.residential_booking_tips to service_role;
grant select(id,booking_id,contractor_id,amount_cents,status,net_cents,created_at,updated_at,paid_at,paid_amount_cents,payment_reference) on public.residential_booking_tips to authenticated;
create policy tip_earnings_read on public.residential_booking_tips for select to authenticated using(contractor_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.status='active'));

create function public.queue_residential_feedback() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' then
  insert into residential_feedback(booking_id,contractor_id)
  select new.id,p.id from (select 1) seed
  left join assignment_blocks j on j.id=new.id
  left join profiles p on p.id=coalesce(j.claimed_by,j.assigned_to) and p.role='contractor'
  on conflict(booking_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.queue_residential_feedback() from public,anon,authenticated;
create trigger residential_feedback_completed after update of status on public.referral_bookings for each row execute function public.queue_residential_feedback();

create function public.prepare_residential_tip(p_booking uuid,p_amount integer,p_authorization text) returns public.residential_booking_tips language plpgsql set search_path=public as $$
declare f residential_feedback; b referral_bookings; t residential_booking_tips;
begin
 select * into f from residential_feedback where booking_id=p_booking for update;
 if not found or f.contractor_id is null then raise exception 'No contractor is available for this tip'; end if;
 select * into b from referral_bookings where id=p_booking;
 if b.status<>'completed' or b.assignment_deleted_at is not null or b.stripe_customer is null or b.stripe_payment_method is null then raise exception 'Completed cleaning and saved card required'; end if;
 select * into t from residential_booking_tips where booking_id=p_booking;
 if found then
  if t.amount_cents<>p_amount then raise exception 'A tip already exists; refresh its status before changing the amount'; end if;
  return t;
 end if;
 insert into residential_booking_tips(booking_id,contractor_id,amount_cents,stripe_customer,stripe_payment_method,consent_text)
 values(b.id,f.contractor_id,p_amount,b.stripe_customer,b.stripe_payment_method,p_authorization) returning * into t;
 return t;
end $$;
revoke all on function public.prepare_residential_tip(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.prepare_residential_tip(uuid,integer,text) to service_role;

create function public.mark_residential_tip_paid(p_id uuid,p_actor uuid,p_expected integer,p_reference text) returns void language plpgsql set search_path=public as $$
declare t residential_booking_tips;
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin' and status='active') then raise exception 'Admin required'; end if;
 select * into t from residential_booking_tips where id=p_id for update;
 if not found then raise exception 'Tip not found'; end if;
 if t.paid_at is not null then return; end if;
 if t.status not in ('succeeded','refunded') or t.net_cents<=0 or t.net_cents<>p_expected then raise exception 'Refresh and review the payable tip'; end if;
 if length(trim(p_reference))<3 or length(p_reference)>300 then raise exception 'Payment reference required'; end if;
 update residential_booking_tips set paid_at=now(),paid_by=p_actor,paid_amount_cents=t.net_cents,payment_reference=trim(p_reference),updated_at=now() where id=p_id;
end $$;
revoke all on function public.mark_residential_tip_paid(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.mark_residential_tip_paid(uuid,uuid,integer,text) to service_role;

create function public.sync_residential_tip(p_id uuid,p_intent text,p_status text,p_net integer) returns public.residential_booking_tips language plpgsql set search_path=public as $$
declare t residential_booking_tips;
begin
 select * into t from residential_booking_tips where id=p_id for update;
 if not found or (t.stripe_payment_intent is not null and t.stripe_payment_intent<>p_intent) then raise exception 'Tip payment does not match'; end if;
 -- Never let a delayed successful-payment webhook restore a refunded/disputed balance.
 if t.status='disputed' or p_status='disputed' then p_status:='disputed';p_net:=0;
 elsif t.status='refunded' then p_net:=case when p_status='refunded' then least(t.net_cents,p_net) else t.net_cents end;p_status:='refunded';
 elsif t.status='succeeded' and p_status in ('pending','failed','processing','requires_action') then return t;
 end if;
 update residential_booking_tips set stripe_payment_intent=p_intent,status=p_status,net_cents=p_net,updated_at=now() where id=p_id returning * into t;
 return t;
end $$;
revoke all on function public.sync_residential_tip(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.sync_residential_tip(uuid,text,text,integer) to service_role;

-- The native app has an older, currently unused tip table. Serialize both
-- entry points on the booking so a customer cannot be charged by both flows.
create function public.guard_residential_tip_channels() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform 1 from referral_bookings where id=new.booking_id for update;
 if tg_table_name='residential_booking_tips' then
  if to_regclass('public.residential_tips') is not null then
   if exists(select 1 from residential_tips where booking_id=new.booking_id) then raise exception 'A tip already exists for this clean. Contact Turnly to review it.'; end if;
  end if;
 elsif exists(select 1 from residential_booking_tips where booking_id=new.booking_id) then raise exception 'A tip already exists for this clean. Use the customer portal to review it.';
 end if;
 return new;
end $$;
revoke all on function public.guard_residential_tip_channels() from public,anon,authenticated;
create trigger guard_web_tip_channel before insert on public.residential_booking_tips for each row execute function public.guard_residential_tip_channels();
do $$begin
 if to_regclass('public.residential_tips') is not null then
  execute 'create trigger guard_app_tip_channel before insert on public.residential_tips for each row execute function public.guard_residential_tip_channels()';
 end if;
end $$;
