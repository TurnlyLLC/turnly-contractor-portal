-- Website intake is write-only through the Edge Function; inquiry data is admin-only.
create table public.website_inquiries (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check (phone ~ '^\+1[0-9]{10}$'),
  property_name text not null check (char_length(btrim(property_name)) between 1 and 180),
  management_company text not null default '' check (char_length(management_company) <= 180),
  city text not null check (char_length(btrim(city)) between 1 and 120),
  unit_count integer check (unit_count between 1 and 10000),
  timeline text not null check (timeline in ('As soon as available','Within 2 weeks','Within a month','Ongoing turnover support','Planning ahead')),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  sms_consent boolean not null default false,
  sms_consent_at timestamptz,
  sms_consent_text text not null default 'I agree to receive SMS messages related to my inquiry (optional). By checking this box, you consent to texts from Turnly about your request. Message & data rates may apply. Reply STOP to opt out.',
  service_interest text not null default 'Apartment turnover cleaning' check (service_interest = 'Apartment turnover cleaning'),
  source text not null default 'website_contact_form' check (source = 'website_contact_form'),
  status text not null default 'new' check (status in ('new','contacted','closed')),
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  constraint website_inquiry_consent_time check (sms_consent = (sms_consent_at is not null))
);

create index website_inquiries_created_idx on public.website_inquiries (created_at desc, id desc);
create index website_inquiries_status_created_idx on public.website_inquiries (status, created_at desc, id desc);
create index website_inquiries_client_created_idx on public.website_inquiries (client_hash, created_at desc);
create index website_inquiries_email_created_idx on public.website_inquiries (email, created_at desc);

alter table public.website_inquiries enable row level security;
revoke all on public.website_inquiries from public, anon, authenticated;
grant select (id,created_at,updated_at,name,email,phone,property_name,management_company,city,unit_count,timeline,message,sms_consent,sms_consent_at,sms_consent_text,service_interest,source,status) on public.website_inquiries to authenticated;
grant update (status) on public.website_inquiries to authenticated;
grant all on public.website_inquiries to service_role;

create policy "Admins can read website inquiries" on public.website_inquiries for select to authenticated
using ((select public.current_profile_is_admin()));
create policy "Admins can update website inquiry status" on public.website_inquiries for update to authenticated
using ((select public.current_profile_is_admin())) with check ((select public.current_profile_is_admin()));
create trigger website_inquiries_updated_at before update on public.website_inquiries
for each row execute function public.set_updated_at();

-- SECURITY INVOKER: only service_role can execute or insert; never exposed to anon.
-- Transaction locks make the rate checks atomic for concurrent requests.
create function public.capture_website_inquiry(inquiry jsonb, client_hash text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  request_id uuid := (inquiry->>'request_id')::uuid;
  contact_email text := lower(btrim(inquiry->>'email'));
begin
  if client_hash is null or client_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_client_hash';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('website-inquiry-request:' || request_id::text, 0));
  -- Repeated network retries are successful without creating another inquiry.
  if exists(select 1 from public.website_inquiries w where w.id = request_id) then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('website-inquiry-ip:' || client_hash, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('website-inquiry-email:' || contact_email, 0));
  if (select count(*) from public.website_inquiries w where w.client_hash = capture_website_inquiry.client_hash and w.created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.website_inquiries w where w.email = contact_email and w.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'inquiry_rate_limit';
  end if;
  insert into public.website_inquiries (id,name,email,phone,property_name,management_company,city,unit_count,timeline,message,sms_consent,sms_consent_at,client_hash)
  values (request_id,btrim(inquiry->>'name'),contact_email,inquiry->>'phone',btrim(inquiry->>'property_name'),coalesce(btrim(inquiry->>'management_company'),''),btrim(inquiry->>'city'),(inquiry->>'unit_count')::integer,inquiry->>'timeline',btrim(inquiry->>'message'),(inquiry->>'sms_consent')::boolean,case when (inquiry->>'sms_consent')::boolean then now() end,client_hash);
end;
$$;
revoke all on function public.capture_website_inquiry(jsonb,text) from public, anon, authenticated;
grant execute on function public.capture_website_inquiry(jsonb,text) to service_role;

