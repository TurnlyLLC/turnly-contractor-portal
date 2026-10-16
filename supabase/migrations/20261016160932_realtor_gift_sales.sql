alter table public.sales_leads
  add column referral_agent_id uuid references public.referral_agents(id) on delete set null,
  add column prospect_type text not null default 'residential' check (prospect_type in ('realtor','brokerage','homeowner','relocation','business_gifting','residential')),
  add column source_contact jsonb not null default '{}'::jsonb,
  add column gift_card_quantity integer not null default 0 check (gift_card_quantity between 0 and 10000),
  add column sales_confirmation_ref text not null default '',
  add column do_not_contact boolean not null default false;
create unique index sales_leads_referral_agent_unique on public.sales_leads(referral_agent_id);
alter table public.sales_leads drop constraint sales_leads_pipeline_stage_check;
alter table public.sales_leads add constraint sales_leads_pipeline_stage_check
  check(pipeline_stage in ('new_leads','contacted','interested','link_sent','follow_up','active','lost','walkthrough','quote_sent','contract_out'));

-- Keep the original referral program intact; one editable CRM prospect per agent.
create function public.ensure_realtor_crm_prospect(agent public.referral_agents) returns void
language plpgsql security invoker set search_path=public as $$
begin
  insert into public.sales_leads(referral_agent_id,business_segment,prospect_type,property_name,name,company_name,
    contact_name,contact_email,contact_phone,address,sales_city,sales_state,sales_website,
    lead_source,lead_notes,source_contact,pipeline_stage,next_step,next_step_due_at,created_at,last_activity_at)
  values(agent.id,'residential','realtor',agent.name,agent.name,coalesce(agent.brokerage,''),agent.name,
    coalesce(agent.email,''),coalesce(nullif(agent.phone,''),agent.phone_1,''),coalesce(agent.address,''),
    coalesce(agent.city,''),coalesce(agent.state,''),coalesce(agent.website,''),'realtor_contact',coalesce(agent.notes,''),
    to_jsonb(agent)-array['referral_code','source_key','created_by'],
    case when agent.status='not_interested' then 'lost' when agent.status in ('interested','follow_up','active') then 'contacted' else 'new_leads' end,
    case when agent.status='not_interested' then 'Respect prior decline; review notes before any outreach' else 'Discuss $100 Turnly gift cards for upcoming closings' end,
    case when agent.follow_up_on is not null then (agent.follow_up_on + time '10:00') at time zone 'America/New_York' end,
    agent.created_at,agent.updated_at)
  on conflict(referral_agent_id) do update set source_contact=excluded.source_contact;
end;
$$;
revoke all on function public.ensure_realtor_crm_prospect(public.referral_agents) from public,anon,authenticated;
grant execute on function public.ensure_realtor_crm_prospect(public.referral_agents) to service_role;
create function public.sync_realtor_crm_prospect() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform public.ensure_realtor_crm_prospect(new);
  -- Refresh primary details only if the operator has not edited their CRM copy.
  if tg_op='UPDATE' then
    update public.sales_leads set
      property_name=case when property_name=old.name then new.name else property_name end,
      name=case when name=old.name then new.name else name end,
      contact_name=case when contact_name=old.name then new.name else contact_name end,
      company_name=case when company_name=coalesce(old.brokerage,'') then coalesce(new.brokerage,'') else company_name end,
      contact_email=case when contact_email=coalesce(old.email,'') then coalesce(new.email,'') else contact_email end,
      contact_phone=case when contact_phone=coalesce(nullif(old.phone,''),old.phone_1,'') then coalesce(nullif(new.phone,''),new.phone_1,'') else contact_phone end,
      address=case when address=coalesce(old.address,'') then coalesce(new.address,'') else address end,
      sales_city=case when sales_city=coalesce(old.city,'') then coalesce(new.city,'') else sales_city end,
      sales_state=case when sales_state=coalesce(old.state,'') then coalesce(new.state,'') else sales_state end,
      sales_website=case when sales_website=coalesce(old.website,'') then coalesce(new.website,'') else sales_website end
    where referral_agent_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_realtor_crm_prospect() from public,anon,authenticated;
create trigger sync_realtor_crm_prospect after insert or update on public.referral_agents
for each row execute function public.sync_realtor_crm_prospect();
select public.ensure_realtor_crm_prospect(a) from public.referral_agents a;
