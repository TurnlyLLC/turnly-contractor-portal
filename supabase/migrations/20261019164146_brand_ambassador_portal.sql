-- Private ambassador attribution and fixed first-clean milestone ledger.
do $$ begin if to_regtype('public.user_role') is not null then alter type public.user_role add value if not exists 'brand_ambassador'; end if; end $$;
alter table public.profiles drop constraint if exists profiles_role_supported;
alter table public.profiles add constraint profiles_role_supported check(role::text in ('admin','contractor','sales','sales_team','property_manager','customer','brand_ambassador')) not valid;
create table public.ba_members (
 user_id uuid primary key references auth.users(id), name text not null, email text not null unique,
 code text not null unique check(code ~ '^BA-[A-Z0-9]{16}$'), enabled boolean not null default true,
 must_change_password boolean not null default true, session_id text,
 created_at timestamptz not null default now()
);
create table public.ba_leads (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ba_members(user_id),
 name text not null, email text not null unique, phone text not null unique,
 customer_id uuid unique references public.referral_customers(id), first_booking_id uuid unique references public.referral_bookings(id),
 stage text not null default 'lead' check(stage in ('lead','requested','booked','completed','cancelled','ineligible')),
 booked_at timestamptz, completed_at timestamptz, service_date date,
 review_required boolean not null default false, consent_version text not null,
 created_at timestamptz not null default now()
);
create index ba_leads_member_created on public.ba_leads(member_id,created_at desc);
create table public.ba_earnings (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.ba_leads(id),
 milestone text not null check(milestone in ('booked','completed')), amount_cents integer not null default 2500 check(amount_cents=2500),
 earned_at timestamptz not null default now(), paid_at timestamptz, paid_by uuid references auth.users(id), payment_reference text,
 unique(lead_id,milestone)
);
create table public.ba_events (
 id bigint generated always as identity primary key, lead_id uuid references public.ba_leads(id),
 event text not null, created_at timestamptz not null default now()
);
do $$ declare t text; begin foreach t in array array['ba_members','ba_leads','ba_earnings','ba_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
grant usage,select on sequence public.ba_events_id_seq to service_role;

create function public.register_ba_lead(p_code text,p_name text,p_email text,p_phone text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare m ba_members; l ba_leads;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into m from ba_members where code=p_code and enabled;
 if not found then raise exception 'Ambassador link is inactive'; end if;
 if length(trim(p_name))<1 or p_email not like '%@%' or length(p_phone)<10 or coalesce(p_consent,'')='' then raise exception 'Contact details and consent are required'; end if;
 select * into l from ba_leads where email=lower(trim(p_email)) or phone=p_phone order by created_at,id limit 1;
 if found then return l.id; end if;
 insert into ba_leads(member_id,name,email,phone,consent_version)
 values(m.user_id,p_name,lower(trim(p_email)),p_phone,p_consent) returning * into l;
 insert into ba_events(lead_id,event) values(l.id,'lead_registered');
 return l.id;
end $$;

create function public.create_ba_booking(p_id uuid,p_token text,p_hash text,p_code text,p_data jsonb,p_status text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(610081200);
 -- Existing request retries never change attribution.
 if not exists(select 1 from referral_bookings where id=p_id) then
 perform register_ba_lead(p_code,p_data->>'name',p_data->>'email',p_data->>'phone','booking-referral-2026-10-19');
 end if;
 return create_direct_booking(p_id,p_token,p_hash,p_data,p_status,p_consent);
end $$;

create function public.ba_booking_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.ba_leads; prior_exists boolean;
begin
 perform pg_advisory_xact_lock(610081200);
 if tg_op='INSERT' then
  select * into l from public.ba_leads where (email=new.email or phone=new.phone) and first_booking_id is null order by created_at,id limit 1 for update;
  if found and exists(select 1 from public.ba_members where user_id=l.member_id and enabled) then
   select exists(select 1 from public.referral_bookings b where b.id<>new.id and (b.customer_id=new.customer_id or b.email=new.email or b.phone=new.phone)) into prior_exists;
   if prior_exists or exists(select 1 from public.referral_customers where id=new.customer_id and (first_assignment_id is not null or (first_booking_id is not null and first_booking_id<>new.id))) or exists(select 1 from public.ba_leads where customer_id=new.customer_id and id<>l.id) then
    update public.ba_leads set stage='ineligible' where id=l.id;
   else
    update public.ba_leads set customer_id=new.customer_id,first_booking_id=new.id,stage='requested',service_date=new.service_date where id=l.id;
   end if;
  end if;
 end if;
 select * into l from public.ba_leads where first_booking_id=new.id for update;
 if not found then return new; end if;
 update public.ba_leads set service_date=new.service_date where id=l.id;
 if new.status in ('scheduled','completed') then
  insert into public.ba_earnings(lead_id,milestone) values(l.id,'booked') on conflict do nothing;
  update public.ba_leads set stage=case when completed_at is null then 'booked' else 'completed' end,booked_at=coalesce(booked_at,now()) where id=l.id;
 end if;
 if new.status='completed' and new.completed_at is not null then
  insert into public.ba_earnings(lead_id,milestone) values(l.id,'completed') on conflict do nothing;
  update public.ba_leads set stage='completed',completed_at=coalesce(completed_at,new.completed_at) where id=l.id;
 end if;
 -- Preserve earned and paid history. Cancellation policy awaits owner decision.
 if new.status in ('cancelled','canceled') or new.payment_status='adjusted' then
  update public.ba_leads set review_required=true,stage=case when completed_at is null then 'cancelled' else stage end where id=l.id;
 end if;
 if tg_op='INSERT' or new.status is distinct from old.status or new.payment_status is distinct from old.payment_status then
  insert into public.ba_events(lead_id,event) values(l.id,'booking:'||new.status||';payment:'||coalesce(new.payment_status,''));
 end if;
 return new;
end $$;
create trigger ba_booking_lifecycle after insert or update of status,payment_status,completed_at,service_date on public.referral_bookings for each row execute function public.ba_booking_lifecycle();
revoke all on function public.ba_booking_lifecycle() from public,anon,authenticated;
revoke all on function public.register_ba_lead(text,text,text,text,text), public.create_ba_booking(uuid,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.register_ba_lead(text,text,text,text,text), public.create_ba_booking(uuid,text,text,text,jsonb,text,text) to service_role;

create function public.ba_record_payment(p_id uuid,p_actor uuid,p_reference text) returns void language plpgsql security invoker set search_path=public as $$
declare e ba_earnings; l ba_leads;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into e from ba_earnings where id=p_id for update;
 if not found or e.paid_at is not null then raise exception 'This earning is unavailable or already paid'; end if;
 select * into l from ba_leads where id=e.lead_id for update;
 if l.review_required then raise exception 'This referral requires admin review before recording a payment'; end if;
 if length(trim(p_reference))<1 then raise exception 'Payment reference required'; end if;
 update ba_earnings set paid_at=now(),paid_by=p_actor,payment_reference=p_reference where id=p_id;
 insert into ba_events(lead_id,event) values(l.id,'payment_recorded:'||e.milestone);
end $$;
revoke all on function public.ba_record_payment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ba_record_payment(uuid,uuid,text) to service_role;
