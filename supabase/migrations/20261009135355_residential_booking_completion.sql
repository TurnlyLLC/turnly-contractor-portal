-- Retain every existing record. Completed card setup is the assignment intake boundary.
alter table public.referral_bookings add column visit_details jsonb not null default '{}'::jsonb;
alter table public.referral_bookings add column assignment_created_at timestamptz;
alter table public.referral_bookings add column assignment_deleted_at timestamptz;

create table public.residential_inquiries (
 id uuid primary key default gen_random_uuid(),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.residential_inquiries enable row level security;
revoke all on public.residential_inquiries from public,anon,authenticated;
grant all on public.residential_inquiries to service_role;
create index residential_inquiries_created on public.residential_inquiries(created_at desc);
-- Copy historical residential inquiries; keep originals and all references intact.
insert into public.residential_inquiries(id,payload,created_at)
select id,to_jsonb(l),coalesce((to_jsonb(l)->>'created_at')::timestamptz,now())
from public.sales_leads l where lead_source='residential_website_contact_form'
on conflict(id) do nothing;

create or replace function public.create_residential_booking(p_id uuid,p_token text,p_hash text,p_code text,p_data jsonb,p_status text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c referral_customers; a referral_agents; prior referral_bookings;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into prior from referral_bookings where id=p_id;
 if found then
   if prior.token_hash<>p_token or prior.request_hash<>p_hash then raise exception 'Booking request changed. Start a new checkout.'; end if;
   return prior.id;
 end if;
 perform register_agent_referral(p_code,p_data->>'name',p_data->>'email',p_data->>'phone',p_data->>'property_address',p_data->>'city',p_data->>'notes');
 select * into c from referral_customers where email=p_data->>'email' or phone=p_data->>'phone' order by created_at,id limit 1;
 select * into a from referral_agents where id=c.agent_id;
 insert into referral_bookings(id,token_hash,request_hash,customer_id,agent_id,agent_name,referral_code,name,email,phone,profile_address,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,amount_cents,service_date,arrival_start,arrival_end,charge_at,status,notes,visit_details,consent_text,consent_at)
 values(p_id,p_token,p_hash,c.id,a.id,a.name,a.referral_code,p_data->>'name',p_data->>'email',p_data->>'phone',p_data->>'profile_address',p_data->>'property_address',p_data->>'city',p_data->>'state',p_data->>'zip',(p_data->>'beds')::integer,(p_data->>'baths')::numeric,(p_data->>'sqft')::integer,p_data->>'service',p_data->>'frequency',p_data->'quote',(p_data->>'amount_cents')::integer,(p_data->>'service_date')::date,(p_data->>'arrival_start')::time,(p_data->>'arrival_end')::time,(p_data->>'charge_at')::timestamptz,p_status,p_data->>'notes',coalesce(p_data->'visit_details','{}'::jsonb),p_consent,case when p_consent is not null then now() end);
 return p_id;
end $$;
revoke all on function public.create_residential_booking(uuid,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_residential_booking(uuid,text,text,text,jsonb,text,text) to service_role;

create or replace function public.claim_residential_charges() returns setof public.referral_bookings
language plpgsql security invoker set search_path=public as $$
begin
 update referral_bookings set payment_status='uncertain',charge_locked_at=null
 where status='scheduled' and payment_status in ('charging','processing') and charge_started_at<now()-interval '23 hours';
 return query update referral_bookings b set payment_status='charging',charge_started_at=coalesce(b.charge_started_at,now()),charge_locked_at=now()
 where b.id in(select id from referral_bookings
   where assignment_deleted_at is null and exists(select 1 from public.assignment_blocks a where a.id=referral_bookings.id and a.metadata->>'source'='residential_booking' and a.status not in ('cancelled','canceled','declined'))
     and status='scheduled' and consent_at is not null and stripe_payment_method is not null
     and charge_at<=now() and service_date=(now() at time zone 'America/New_York')::date
     and payment_status in ('card_saved','charging','processing')
     and (charge_locked_at is null or charge_locked_at<now()-interval '10 minutes')
   order by charge_at limit 20 for update skip locked)
 returning b.*;
end $$;
revoke all on function public.claim_residential_charges() from public,anon,authenticated;
grant execute on function public.claim_residential_charges() to service_role;


-- Trigger access is private; staff can delete assignments without needing access
-- to customers' private billing records. Retain billing and referral history.
create or replace function turnly_private.residential_assignment_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.referral_bookings;
begin
 if tg_op='DELETE' then
  if old.metadata->>'source'='residential_booking' then
   update public.referral_bookings set assignment_deleted_at=coalesce(assignment_deleted_at,now()),
     status=case when status='completed' then status else 'cancelled' end
   where id=old.id;
  end if;
  return old;
 end if;
 if new.metadata->>'source' is distinct from 'residential_booking' then return new; end if;
 select * into b from public.referral_bookings where id=new.id for update;
 if not found or b.assignment_deleted_at is not null or b.status not in ('scheduled','completed') or b.stripe_payment_method is null then
  raise exception 'Finish card booking before creating an assignment; removed assignments cannot be recreated';
 end if;
 update public.referral_bookings set assignment_created_at=coalesce(assignment_created_at,now()) where id=new.id;
 return new;
end $$;
revoke all on function turnly_private.residential_assignment_lifecycle() from public,anon,authenticated;
create trigger residential_assignment_confirmed before insert on public.assignment_blocks
for each row execute function turnly_private.residential_assignment_lifecycle();
create trigger residential_assignment_removed after delete on public.assignment_blocks
for each row execute function turnly_private.residential_assignment_lifecycle();

update public.referral_bookings b set assignment_created_at=now()
where exists(select 1 from public.assignment_blocks a where a.id=b.id and a.metadata->>'source'='residential_booking');
-- Archive premature pending assignments, retaining the row and all history.
-- Successful card confirmation restores these rows to pending approval.
update public.assignment_blocks a set status='cancelled',visibility='closed',
 metadata=coalesce(a.metadata,'{}'::jsonb)||'{"awaiting_booking":true}'::jsonb
from public.referral_bookings b where a.id=b.id and a.metadata->>'source'='residential_booking'
 and a.status='pending' and b.status in ('requested','review_required','awaiting_card','needs_reschedule');
notify pgrst,'reload schema';
