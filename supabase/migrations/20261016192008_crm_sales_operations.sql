-- Sales attribution and messaging stay server-owned; a typed CRM stage is never revenue.
create table public.crm_sales_settings(id boolean primary key default true check(id),commission_mode text check(commission_mode in ('percent','per_card')),commission_rate integer check(commission_rate>=0 and commission_rate<=100000),updated_at timestamptz default now());
insert into public.crm_sales_settings(id,commission_mode,commission_rate)values(true,'percent',1000);
create table public.crm_sales_links(user_id uuid primary key references profiles(id),code text not null unique default replace(gen_random_uuid()::text,'-',''),created_at timestamptz default now());
create table public.crm_checkout_links(token text primary key default replace(gen_random_uuid()::text,'-',''),sales_user_id uuid not null references profiles(id),lead_id uuid not null references sales_leads(id),created_at timestamptz default now(),unique(sales_user_id,lead_id));
create table public.crm_sales_messages(id uuid primary key default gen_random_uuid(),request_id uuid unique not null,user_id uuid not null references profiles(id),lead_id uuid references sales_leads(id),channel text not null check(channel in ('email','sms')),recipient text not null,consent_at timestamptz not null,consent_note text not null,body text not null,status text not null default 'processing',provider_id text,error text,created_at timestamptz default now());
create table public.crm_notifications(id uuid primary key default gen_random_uuid(),dedupe_key text unique not null,recipient_id uuid references profiles(id),kind text not null,lead_id uuid references sales_leads(id),subject_user_id uuid references profiles(id),title text not null,due_at timestamptz not null default now(),resolved boolean not null default false,acknowledged_at timestamptz,created_at timestamptz default now());
create index crm_notifications_due on crm_notifications(recipient_id,resolved,due_at);
create table public.crm_sales_commissions(order_id uuid primary key references gift_orders(id),sales_user_id uuid not null references profiles(id),mode text,rate integer,amount_cents integer,status text not null,updated_at timestamptz default now());
do $$ declare t text; begin foreach t in array array['crm_sales_settings','crm_sales_links','crm_checkout_links','crm_sales_messages','crm_notifications','crm_sales_commissions'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
alter table gift_orders add sales_user_id uuid references profiles(id),add sales_lead_id uuid references sales_leads(id),add buyer_kind text not null default 'other',add brokerage text not null default '',add commission_mode text,add commission_rate integer,add refunded_cents integer not null default 0 check(refunded_cents between 0 and amount_cents),add disputed boolean not null default false;
create index gift_orders_sales_user on gift_orders(sales_user_id,paid_at);
create index gift_orders_buyer on gift_orders(lower(email)) where paid_at is not null;
alter table sales_leads add follow_up_due_at timestamptz,add sales_region text not null default '';
update sales_leads set sales_region=case when lower(sales_state) in ('sc','south carolina') then 'South Carolina' when lower(sales_city) in ('raleigh','durham','cary','apex','garner','wake forest','chapel hill','morrisville') then 'Triangle' when lower(sales_city) in ('greensboro','high point','winston-salem') then 'Triad' when lower(sales_city) in ('asheville','hendersonville') then 'Asheville area' when lower(sales_city) in ('charlotte','mint hill','matthews','concord') then 'Charlotte area' when lower(sales_city) in ('wilmington','carolina beach','wrightsville beach') then 'Wilmington area' else 'Other' end where business_segment='residential';
create index sales_leads_unassigned_region on sales_leads(sales_region,sales_city,id) where sales_owner_id is null and pipeline_stage='new_leads';
create table public.crm_first_purchases(buyer_email text primary key,order_id uuid not null unique references gift_orders(id),paid_at timestamptz not null);
alter table crm_first_purchases enable row level security;
revoke all on crm_first_purchases from public,anon,authenticated;
grant all on crm_first_purchases to service_role;
insert into crm_first_purchases(buyer_email,order_id,paid_at) select distinct on(lower(trim(email))) lower(trim(email)),id,paid_at from gift_orders where paid_at is not null order by lower(trim(email)),paid_at,id;
create function public.crm_sale_recorded() returns trigger language plpgsql security invoker set search_path=public as $$
declare net integer; amount integer; first_order uuid;
begin
 if new.paid_at is null then return new; end if;
 insert into crm_first_purchases(buyer_email,order_id,paid_at)values(lower(trim(new.email)),new.id,new.paid_at) on conflict(buyer_email)do nothing;
 select order_id into first_order from crm_first_purchases where buyer_email=lower(trim(new.email));
 net=greatest(0,new.amount_cents-new.refunded_cents);
 if new.sales_user_id is not null then
  amount=case when first_order<>new.id then 0 when new.commission_rate is null then null when new.commission_mode='percent' then floor(net::numeric*new.commission_rate/10000)::int when new.commission_mode='per_card' then floor(net::numeric/10000*new.commission_rate)::int end;
  insert into crm_sales_commissions(order_id,sales_user_id,mode,rate,amount_cents,status)
  values(new.id,new.sales_user_id,new.commission_mode,new.commission_rate,case when new.disputed or new.status='review' then 0 else amount end,case when first_order<>new.id then 'repeat_purchase' when new.disputed or new.status='review' then 'held' when net=0 then 'reversed' when amount is null then 'rate_not_set' else 'earned' end)
  on conflict(order_id)do update set amount_cents=excluded.amount_cents,status=excluded.status,updated_at=now();
 end if;
 if old.paid_at is null and new.status='paid' and new.sales_lead_id is not null then
  update sales_leads set pipeline_stage='active',sales_confirmation_ref=new.id::text,last_activity_at=now() where id=new.sales_lead_id and business_segment='residential';
  insert into sales_activities(lead_id,user_id,user_name,activity_type,activity_text,metadata)values(new.sales_lead_id,new.sales_user_id,'Verified checkout','purchase','Gift-card purchase completed.',jsonb_build_object('order_id',new.id,'quantity',new.quantity,'amount_cents',new.amount_cents));
 end if;
 return new;
end $$;
create trigger crm_sale_recorded after update of paid_at,refunded_cents,disputed,status on gift_orders for each row execute function crm_sale_recorded();
create function public.crm_follow_up_schedule() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.business_segment<>'residential' then return new;end if;
 if new.do_not_contact then new.follow_up_due_at=null;
 elsif new.pipeline_stage in ('lost','follow_up') and (tg_op='INSERT' or old.pipeline_stage is distinct from new.pipeline_stage or old.do_not_contact) then
 new.follow_up_due_at=now()+interval '1 month';new.next_step_due_at=new.follow_up_due_at;new.task_due_at=new.follow_up_due_at;new.task_status='open';
 elsif new.pipeline_stage not in ('lost','follow_up') then new.follow_up_due_at=null;
 end if;return new;
end $$;
create trigger crm_follow_up_schedule before insert or update on sales_leads for each row execute function crm_follow_up_schedule();
-- Notifications are generated from changes, not from an open browser window.
create function public.crm_lead_notifications() returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid; owner_name text;
begin
 if new.business_segment<>'residential' then return new; end if;
 if new.follow_up_due_at is not null and not new.do_not_contact then
  insert into crm_notifications(dedupe_key,recipient_id,kind,lead_id,title,due_at)
  values('followup:'||new.id,new.sales_owner_id,'follow_up',new.id,'Monthly follow-up: '||coalesce(new.contact_name,new.name,new.property_name),new.follow_up_due_at)
  on conflict(dedupe_key)do update set recipient_id=excluded.recipient_id,due_at=excluded.due_at,title=excluded.title,resolved=false,acknowledged_at=case when crm_notifications.due_at is distinct from excluded.due_at then null else crm_notifications.acknowledged_at end;
 else update crm_notifications set resolved=true where dedupe_key='followup:'||new.id;end if;
 for owner in select distinct x from unnest(array[new.sales_owner_id,case when tg_op='UPDATE' then old.sales_owner_id end]) x where x is not null loop
  if exists(select 1 from sales_leads where sales_owner_id=owner and business_segment='residential' and pipeline_stage='new_leads' and not do_not_contact) then
   update crm_notifications set resolved=true where dedupe_key='empty:'||owner;
  elsif tg_op='UPDATE' and (old.pipeline_stage='new_leads' or old.sales_owner_id is distinct from new.sales_owner_id) then
   select full_name into owner_name from profiles where id=owner;
   insert into crm_notifications(dedupe_key,kind,subject_user_id,title)values('empty:'||owner,'leads_exhausted',owner,coalesce(owner_name,'Sales member')||' has no new leads left to work.')
   on conflict(dedupe_key)do update set resolved=false,acknowledged_at=case when crm_notifications.resolved then null else crm_notifications.acknowledged_at end,due_at=case when crm_notifications.resolved then now() else crm_notifications.due_at end;
  end if;
 end loop;return new;
end $$;
revoke all on function crm_lead_notifications() from public,anon,authenticated;
create trigger crm_lead_notifications after insert or update on sales_leads for each row execute function crm_lead_notifications();
update sales_leads set follow_up_due_at=now()+interval '1 month' where business_segment='residential' and pipeline_stage in ('lost','follow_up') and not do_not_contact;
-- Only the assigned member (or administrator) can work a residential lead.
create policy crm_lead_owner on sales_leads as restrictive for all to authenticated using ((select current_user_has_role(array['admin'])) or (business_segment='residential' and sales_owner_id=(select auth.uid()))) with check ((select current_user_has_role(array['admin'])) or (business_segment='residential' and sales_owner_id=(select auth.uid())));
create function crm_protect_assignment() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') and new.sales_owner_id is distinct from old.sales_owner_id and not current_user_has_role(array['admin']) then raise exception 'Only administrators can reassign leads.'; end if;
 return new;
end $$;
create trigger crm_protect_assignment before update on sales_leads for each row execute function crm_protect_assignment();
create function public.crm_allocate_region(p_operator_ids uuid[],p_count int,p_region text default '',p_city text default '') returns integer language plpgsql security invoker set search_path=public as $$
declare ids uuid[];
begin
 if not current_user_can_use_sales_portal() or not current_user_has_role(array['admin']) then raise exception 'Administrator access required';end if;
 if p_count not between 1 and 2000 then raise exception 'Choose 1–2000 leads';end if;
 select array_agg(id) into ids from(select id from sales_leads where business_segment='residential' and sales_owner_id is null and pipeline_stage='new_leads' and not do_not_contact and (p_region='' or sales_region=p_region) and (p_city='' or sales_city=p_city) order by id limit p_count for update skip locked)x;
 if coalesce(cardinality(ids),0)=0 then return 0;end if;
 return assign_residential_leads(ids,p_operator_ids,true);
end $$;
revoke all on function crm_allocate_region(uuid[],int,text,text) from public,anon;
grant execute on function crm_allocate_region(uuid[],int,text,text) to authenticated;
create function public.crm_remove_operator_leads(p_operator uuid,p_only_new boolean default true) returns integer language plpgsql security invoker set search_path=public as $$
declare row sales_leads; n integer=0;
begin
 if not current_user_can_use_sales_portal() or not current_user_has_role(array['admin']) then raise exception 'Administrator access required';end if;
 for row in select * from sales_leads where business_segment='residential' and sales_owner_id=p_operator and (not p_only_new or pipeline_stage='new_leads') order by id for update loop
  update sales_leads set sales_owner_id=null,sales_owner_name='' where id=row.id;
  insert into sales_activities(lead_id,user_id,activity_type,activity_text,metadata)values(row.id,auth.uid(),'assignment','Returned to unassigned leads.',jsonb_build_object('previous_owner_id',p_operator));n=n+1;
 end loop;return n;
end $$;
revoke all on function crm_remove_operator_leads(uuid,boolean) from public,anon;
grant execute on function crm_remove_operator_leads(uuid,boolean) to authenticated;

-- Child records inherit the lead's ownership filter as well as their existing access gates.
do $$declare t text;begin foreach t in array array['sales_tasks','sales_activities','sales_quotes','sales_contracts','sales_walkthroughs'] loop
 execute format('create policy crm_owned_lead on public.%I as restrictive for all to authenticated using ((select current_user_has_role(array[''admin''])) or exists(select 1 from public.sales_leads l where l.id=lead_id)) with check ((select current_user_has_role(array[''admin''])) or exists(select 1 from public.sales_leads l where l.id=lead_id))',t);
end loop;end $$;
