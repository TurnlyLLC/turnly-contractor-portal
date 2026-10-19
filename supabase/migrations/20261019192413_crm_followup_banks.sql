-- Record entry to the follow-up flow, independent of later notes or assignments.
alter table public.sales_leads add column follow_up_started_at timestamptz;
-- Existing reminders were created exactly one calendar month after status entry.
update public.sales_leads set follow_up_started_at=follow_up_due_at-interval '1 month'
where business_segment='residential' and pipeline_stage in ('lost','follow_up') and follow_up_due_at is not null;
create or replace function public.crm_follow_up_schedule() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.business_segment<>'residential' then return new;end if;
 if tg_op='UPDATE' and old.do_not_contact then new.do_not_contact=true;end if;
 if new.do_not_contact then
  new.follow_up_due_at=null;new.next_step_due_at=null;new.task_due_at=null;new.task_status='completed';
  if tg_op='UPDATE' then new.follow_up_started_at=old.follow_up_started_at;end if;
 elsif new.pipeline_stage in ('lost','follow_up') then
  if tg_op='INSERT' then new.follow_up_started_at=now();
  elsif old.pipeline_stage not in ('lost','follow_up') then new.follow_up_started_at=now();
  else new.follow_up_started_at=old.follow_up_started_at;end if;
  new.follow_up_due_at=new.follow_up_started_at+interval '30 days';
  new.next_step_due_at=new.follow_up_due_at;new.task_due_at=new.follow_up_due_at;new.task_status='open';
 else
  new.follow_up_started_at=null;new.follow_up_due_at=null;
  if tg_op='UPDATE' and old.pipeline_stage in ('lost','follow_up') then new.next_step_due_at=null;new.task_due_at=null;end if;
 end if;return new;
end $$;
create index sales_leads_followup_age on public.sales_leads(sales_owner_id,follow_up_started_at) where business_segment='residential' and not do_not_contact and pipeline_stage in ('lost','follow_up');
create function public.crm_remove_operator_leads_by_status(p_operator uuid,p_status text) returns integer language plpgsql security invoker set search_path=public as $$
declare item sales_leads; n integer=0;
begin
 if not current_user_can_use_sales_portal() or not current_user_has_role(array['admin']) then raise exception 'Administrator access required';end if;
 if p_operator is null or p_status is null or p_status not in ('all','new_leads','contacted','interested','link_sent','follow_up','active','lost','followups') then raise exception 'Choose a valid lead status';end if;
 for item in select * from sales_leads where business_segment='residential' and sales_owner_id=p_operator and (p_status='all' or pipeline_stage=p_status or (p_status='followups' and pipeline_stage in ('lost','follow_up'))) order by id for update loop
  update sales_leads set sales_owner_id=null,sales_owner_name='' where id=item.id;
  insert into sales_activities(lead_id,user_id,activity_type,activity_text,metadata) values(item.id,auth.uid(),'assignment','Returned to unassigned leads.',jsonb_build_object('previous_owner_id',p_operator,'status_filter',p_status));n=n+1;
 end loop;return n;
end $$;
revoke all on function public.crm_remove_operator_leads_by_status(uuid,text) from public,anon;
grant execute on function public.crm_remove_operator_leads_by_status(uuid,text) to authenticated;

-- Align existing reminders and resolve any previously retained DNC reminders.
update public.sales_leads set follow_up_due_at=follow_up_due_at where business_segment='residential' and (pipeline_stage in ('lost','follow_up') or do_not_contact);
