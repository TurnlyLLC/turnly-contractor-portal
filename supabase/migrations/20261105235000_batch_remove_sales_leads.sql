create function public.crm_remove_operator_leads_batch(p_operator uuid,p_status text,p_started_at timestamptz)
returns integer language plpgsql security invoker set search_path=public as $$
declare removed_count integer;
begin
  if not current_user_can_use_sales_portal() or not current_user_has_role(array['admin']) then
    raise exception 'Administrator access required';
  end if;
  if p_operator is null or p_started_at is null or p_status is null or p_status not in ('all','new_leads','contacted','interested','link_sent','follow_up','active','lost','followups') then
    raise exception 'Choose a valid lead status';
  end if;
  with batch as (
    select id from sales_leads
    where business_segment='residential' and sales_owner_id=p_operator and updated_at<=p_started_at
      and (p_status='all' or pipeline_stage=p_status or (p_status='followups' and pipeline_stage in ('lost','follow_up')))
    order by id limit 25 for update
  ), released as (
    update sales_leads l set sales_owner_id=null,sales_owner_name=''
    from batch where l.id=batch.id and l.sales_owner_id=p_operator returning l.id
  )
  insert into sales_activities(lead_id,user_id,activity_type,activity_text,metadata)
    select id,auth.uid(),'assignment','Returned to unassigned leads.',jsonb_build_object('previous_owner_id',p_operator,'status_filter',p_status) from released;
  get diagnostics removed_count=row_count;
  return removed_count;
end $$;
revoke all on function public.crm_remove_operator_leads_batch(uuid,text,timestamptz) from public,anon;
grant execute on function public.crm_remove_operator_leads_batch(uuid,text,timestamptz) to authenticated;
