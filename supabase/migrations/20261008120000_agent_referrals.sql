-- Agent outreach and first-clean referrals. Writes go through authenticated server routes.
create table public.referral_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  brokerage text not null default '', email text not null default '', phone text not null default '',
  city text not null default '', address text not null default '', state text not null default '', website text not null default '', postal_code text not null default '',
  phone_1 text not null default '', phone_2 text not null default '', phone_3 text not null default '',
  email_2 text not null default '', email_3 text not null default '',
  email_1_phone text not null default '', email_2_phone text not null default '', email_3_phone text not null default '',
  source_key text unique, source_file text, source_row integer,
  city_rank integer generated always as (case lower(city) when 'durham' then 0 when 'raleigh' then 1 when 'asheville' then 2 else 3 end) stored,
  status text not null default 'new' check(status in ('new','follow_up','not_interested','interested','active')),
  notes text not null default '', follow_up_on date,
  sms_consent boolean not null default false,
  referral_code text unique, activated_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index referral_agents_city on public.referral_agents(city_rank,city,name,id);
-- Shared office contact details do not identify duplicate people. Import keys do.
create index referral_agents_status on public.referral_agents(status,created_at);

create function public.activate_referral_agent() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='UPDATE' then
    new.referral_code := coalesce(old.referral_code,new.referral_code);
    new.activated_at := old.activated_at;
  end if;
  if new.status='active' and new.referral_code is null then
    new.referral_code := 'TA-' || upper(replace(gen_random_uuid()::text,'-',''));
  end if;
  if new.status='active' and new.activated_at is null then
    new.activated_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger activate_referral_agent before insert or update on public.referral_agents
  for each row execute function public.activate_referral_agent();

create table public.referral_customers (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.referral_agents(id),
  lead_id uuid not null references public.sales_leads(id),
  name text not null, email text not null, phone text not null,
  first_assignment_id uuid unique references public.assignment_blocks(id),
  eligible_subtotal numeric(12,2) check(eligible_subtotal >= 0),
  manual_paid_at timestamptz, payment_reference text,
  linked_by uuid references auth.users(id),
  payout_at timestamptz, payout_reference text,
  payout_amount numeric(12,2), payout_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(email), unique(phone),
  check(manual_paid_at is null or length(trim(payment_reference))>0),
  check(payout_at is null or (payout_amount >= 0 and length(trim(payout_reference))>0))
);
create table public.referral_settings (
  id boolean primary key default true check(id),
  template_path text, template_name text,
  qr_x numeric not null default 70, qr_y numeric not null default 68,
  qr_size numeric not null default 20,
  updated_at timestamptz not null default now(),
  check(qr_x >= 0 and qr_y >= 0 and qr_size between 12 and 35 and qr_x+qr_size <= 100 and qr_y+qr_size <= 94)
);
create index referral_customers_agent on public.referral_customers(agent_id,created_at desc);
create index referral_customers_lead on public.referral_customers(lead_id);
insert into public.referral_settings(id) values(true);
create table public.referral_deliveries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null, agent_id uuid not null references public.referral_agents(id),
  channel text not null check(channel in ('email','sms')), recipient text not null,
  status text not null default 'processing', provider_id text, error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(request_id,channel)
);
create index referral_deliveries_agent on public.referral_deliveries(agent_id,created_at desc);

create table public.referral_request_limits (
  key text primary key, window_start timestamptz not null default now(), hits integer not null default 1
);
alter table public.referral_request_limits enable row level security;
revoke all on public.referral_request_limits from anon,authenticated;
grant all on public.referral_request_limits to service_role;
create function public.allow_referral_request(p_key text) returns boolean
language plpgsql security invoker set search_path=public as $$
declare v_hits integer;
begin
  delete from referral_request_limits where window_start < now()-interval '2 hours';
  insert into referral_request_limits(key) values(p_key)
  on conflict(key) do update set
    hits=case when referral_request_limits.window_start < now()-interval '1 hour' then 1 else referral_request_limits.hits+1 end,
    window_start=case when referral_request_limits.window_start < now()-interval '1 hour' then now() else referral_request_limits.window_start end
  returning hits into v_hits;
  return v_hits<=20;
end $$;
revoke all on function public.allow_referral_request(text) from public,anon,authenticated;
grant execute on function public.allow_referral_request(text) to service_role;

create function public.import_referral_agents(p_rows jsonb,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare r jsonb; v_imported integer:=0; v_duplicates integer:=0;
begin
  if jsonb_array_length(p_rows)>500 then raise exception 'Too many rows'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      insert into referral_agents(name,brokerage,email,phone,notes,city,address,state,website,postal_code,phone_1,phone_2,phone_3,email_2,email_3,email_1_phone,email_2_phone,email_3_phone,source_key,source_file,source_row,follow_up_on,created_by)
      values(coalesce(r->>'name',''),coalesce(r->>'brokerage',''),coalesce(r->>'email',''),coalesce(r->>'phone',''),coalesce(r->>'notes',''),coalesce(r->>'city',''),coalesce(r->>'address',''),coalesce(r->>'state',''),coalesce(r->>'website',''),coalesce(r->>'postal_code',''),coalesce(r->>'phone_1',''),coalesce(r->>'phone_2',''),coalesce(r->>'phone_3',''),coalesce(r->>'email_2',''),coalesce(r->>'email_3',''),coalesce(r->>'email_1_phone',''),coalesce(r->>'email_2_phone',''),coalesce(r->>'email_3_phone',''),nullif(r->>'source_key',''),r->>'source_file',(r->>'source_row')::integer,(r->>'follow_up_on')::date,p_actor);
      v_imported:=v_imported+1;
    exception when unique_violation then v_duplicates:=v_duplicates+1;
    end;
  end loop;
  return jsonb_build_object('imported',v_imported,'duplicates',v_duplicates,'errors','[]'::jsonb);
end $$;
revoke all on function public.import_referral_agents(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.import_referral_agents(jsonb,uuid) to service_role;

-- Public registration is atomic: repeat submissions retain the original attribution.
create function public.register_agent_referral(p_code text,p_name text,p_email text,p_phone text,p_address text,p_city text,p_notes text)
returns void language plpgsql security invoker set search_path=public as $$
declare v_agent uuid; v_lead uuid;
begin
  -- A single short lock serializes contact deduplication across email AND phone.
  perform pg_advisory_xact_lock(610081200);
  select id into v_agent from referral_agents where referral_code=p_code and status='active';
  if v_agent is null then raise exception 'Referral link is inactive'; end if;
  if exists(select 1 from referral_customers where email=lower(trim(p_email)) or phone=p_phone) then return; end if;
  insert into sales_leads(property_name,name,contact_name,contact_email,contact_phone,address,sales_city,
      default_service_type,lead_source,lead_notes,pipeline_stage,next_step,task_priority,task_status)
  values ('Residential - '||p_name,'Residential - '||p_name,p_name,lower(trim(p_email)),p_phone,p_address,p_city,
    'Residential cleaning','residential_website_contact_form',p_notes||E'\nAgent referral: '||p_code,'new_leads',
    'Follow up on residential agent referral','high','open') returning id into v_lead;
  insert into referral_customers(agent_id,lead_id,name,email,phone)
    values(v_agent,v_lead,p_name,lower(trim(p_email)),p_phone);
end $$;

-- Never confuse contractor payout status with the customer's invoice payment.
create view public.referral_ledger with (security_invoker=true) as
select c.*, a.name as agent_name, a.referral_code,
  j.status as clean_status,
  (lower(coalesce(j.status,'')) in ('completed','complete','done','closed')) as clean_completed,
  (c.manual_paid_at is not null or (q.quickbooks_status='paid' and q.quickbooks_balance=0 and q.paid_at is not null)) as customer_paid,
  round(coalesce(c.eligible_subtotal,0)*0.10,2) as bonus_amount,
  case
    when c.payout_at is not null then 'paid'
    when lower(coalesce(j.status,'')) in ('completed','complete','done','closed') and c.eligible_subtotal is not null
      and (c.manual_paid_at is not null or (q.quickbooks_status='paid' and q.quickbooks_balance=0 and q.paid_at is not null)) then 'earned'
    else 'pending' end as bonus_status
from public.referral_customers c join public.referral_agents a on a.id=c.agent_id
left join public.assignment_blocks j on j.id=c.first_assignment_id
left join public.quickbooks_invoice_links q on q.id=j.quickbooks_invoice_link_id;

create function public.record_referral_payout(p_customer uuid,p_reference text,p_actor uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_status text; v_amount numeric;
begin
  perform 1 from referral_customers where id=p_customer for update;
  if not found then raise exception 'Customer not found'; end if;
  select bonus_status,bonus_amount into v_status,v_amount from referral_ledger where id=p_customer;
  if v_status <> 'earned' or length(trim(p_reference))=0 then raise exception 'Only an earned bonus can be marked paid'; end if;
  update referral_customers set payout_at=now(),payout_amount=v_amount,payout_reference=p_reference,payout_by=p_actor where id=p_customer;
end $$;

-- No public or browser writes; server routes verify the real profile and role.
alter table public.referral_agents enable row level security;
alter table public.referral_customers enable row level security;
alter table public.referral_settings enable row level security;
alter table public.referral_deliveries enable row level security;
revoke all on public.referral_agents,public.referral_customers,public.referral_settings,public.referral_deliveries,public.referral_ledger from anon,authenticated;
grant all on public.referral_agents,public.referral_customers,public.referral_settings,public.referral_deliveries to service_role;
grant select on public.referral_ledger to service_role;
revoke all on function public.register_agent_referral(text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_referral_payout(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.register_agent_referral(text,text,text,text,text,text,text) to service_role;
grant execute on function public.record_referral_payout(uuid,text,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('agent-flyer-templates','agent-flyer-templates',false,2500000,array['application/pdf']),
      ('agent-flyers','agent-flyers',true,5000000,array['application/pdf'])
on conflict(id) do nothing;
create function public.referral_city_counts() returns table(city text,total bigint)
language sql security invoker set search_path=public as $$
 select city,count(*) from referral_agents group by city order by min(city_rank),city;
$$;
revoke all on function public.referral_city_counts() from public,anon,authenticated;
grant execute on function public.referral_city_counts() to service_role;
notify pgrst,'reload schema';
