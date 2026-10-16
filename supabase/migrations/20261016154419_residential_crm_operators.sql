-- Existing commercial records stay intact. New CRM intake explicitly selects residential.
alter table public.sales_leads add column business_segment text not null default 'commercial'
  check (business_segment in ('commercial', 'residential'));
update public.sales_leads set business_segment = 'residential'
where lead_source = 'residential_website_contact_form'
   or lower(trim(default_service_type)) = 'residential cleaning';
create index sales_leads_segment_owner_idx on public.sales_leads (business_segment, sales_owner_id, id);

-- Retain compatibility with the existing residential website intake during rollout.
create function public.sales_classify_residential_intake() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.lead_source = 'residential_website_contact_form' then
    new.business_segment := 'residential';
  end if;
  return new;
end;
$$;
create trigger sales_classify_residential_intake before insert on public.sales_leads
for each row execute function public.sales_classify_residential_intake();

-- Website inquiries retain their original inbox record and gain one linked CRM lead.
-- Customer support messages in this inbox are deliberately not sales leads.
create function public.residential_inquiry_to_crm() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.payload->>'lead_source' = 'residential_website_contact_form' then
    insert into public.sales_leads(id,business_segment,property_name,name,contact_name,contact_email,contact_phone,
      address,sales_city,default_service_type,default_scope,lead_source,lead_notes,next_step,created_at,last_activity_at)
    values(new.id,'residential',coalesce(nullif(new.payload->>'property_name',''),'Residential inquiry'),
      coalesce(new.payload->>'name',''),coalesce(new.payload->>'contact_name',''),coalesce(new.payload->>'contact_email',''),
      coalesce(new.payload->>'contact_phone',''),coalesce(new.payload->>'address',''),coalesce(new.payload->>'sales_city',''),
      coalesce(new.payload->>'default_service_type','Residential cleaning'),coalesce(new.payload->>'default_scope',''),
      'residential_website_contact_form',coalesce(new.payload->>'lead_notes',''),
      coalesce(new.payload->>'next_step','Follow up on residential cleaning request'),new.created_at,new.created_at)
    on conflict(id) do nothing;
  end if;
  return new;
end;
$$;
create trigger residential_inquiry_to_crm after insert on public.residential_inquiries
for each row execute function public.residential_inquiry_to_crm();

insert into public.sales_leads(id,business_segment,property_name,name,contact_name,contact_email,contact_phone,
  address,sales_city,default_service_type,default_scope,lead_source,lead_notes,next_step,created_at,last_activity_at)
select id,'residential',coalesce(nullif(payload->>'property_name',''),'Residential inquiry'),
  coalesce(payload->>'name',''),coalesce(payload->>'contact_name',''),coalesce(payload->>'contact_email',''),
  coalesce(payload->>'contact_phone',''),coalesce(payload->>'address',''),coalesce(payload->>'sales_city',''),
  coalesce(payload->>'default_service_type','Residential cleaning'),coalesce(payload->>'default_scope',''),
  'residential_website_contact_form',coalesce(payload->>'lead_notes',''),
  coalesce(payload->>'next_step','Follow up on residential cleaning request'),created_at,created_at
from public.residential_inquiries where payload->>'lead_source'='residential_website_contact_form'
on conflict(id) do nothing;

-- Atomic, audited reassignment. Invoker security retains the existing RLS checks.
create function public.assign_residential_leads(p_lead_ids uuid[], p_operator_ids uuid[], p_only_unassigned boolean default true)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  actor public.profiles%rowtype;
  operator public.profiles%rowtype;
  lead public.sales_leads%rowtype;
  operator_count integer;
  assigned_count integer := 0;
  eligible_index integer := 0;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role <> 'admin' or coalesce(actor.status, '') <> 'active' then
    raise exception 'Only active administrators can assign residential leads.';
  end if;
  if coalesce(cardinality(p_lead_ids),0) not between 1 and 2000
    or cardinality(p_lead_ids) <> (select count(distinct id) from unnest(p_lead_ids) id) then
    raise exception 'Select between 1 and 2000 distinct residential leads.';
  end if;
  operator_count := coalesce(cardinality(p_operator_ids),0);
  if operator_count = 0 or operator_count <> (select count(distinct id) from unnest(p_operator_ids) id) then
    raise exception 'Select at least one distinct active operator.';
  end if;
  -- Lock recipients and leads in a consistent order for concurrent allocations.
  perform id from public.profiles where id = any(p_operator_ids) order by id for share;
  if operator_count <> (select count(*) from public.profiles where id = any(p_operator_ids)
      and role in ('admin','sales','sales_team') and status = 'active') then
    raise exception 'Assignments require active sales-team or administrator accounts.';
  end if;
  perform id from public.sales_leads where id = any(p_lead_ids) order by id for update;
  if cardinality(p_lead_ids) <> (select count(*) from public.sales_leads
      where id = any(p_lead_ids) and business_segment = 'residential') then
    raise exception 'Selection contains unavailable or non-residential leads. Refresh and try again.';
  end if;
  for lead in select * from public.sales_leads where id = any(p_lead_ids) order by id loop
    if coalesce(p_only_unassigned,true) and lead.sales_owner_id is not null then continue; end if;
    select * into operator from public.profiles where id = p_operator_ids[1 + eligible_index % operator_count];
    eligible_index := eligible_index + 1;
    if lead.sales_owner_id is not distinct from operator.id then continue; end if;
    update public.sales_leads set sales_owner_id = operator.id,
      sales_owner_name = coalesce(nullif(operator.full_name,''),operator.email), last_activity_at = now()
      where id = lead.id;
    insert into public.sales_activities(lead_id,user_id,user_name,activity_type,activity_text,metadata)
      values(lead.id,actor.id,coalesce(nullif(actor.full_name,''),actor.email),'assignment',
        'Assigned to ' || coalesce(nullif(operator.full_name,''),operator.email) || '.',
        jsonb_build_object('previous_owner_id',lead.sales_owner_id,'operator_id',operator.id,'business_segment','residential'));
    assigned_count := assigned_count + 1;
  end loop;
  return assigned_count;
end;
$$;
revoke all on function public.assign_residential_leads(uuid[],uuid[],boolean) from public, anon;
grant execute on function public.assign_residential_leads(uuid[],uuid[],boolean) to authenticated;
