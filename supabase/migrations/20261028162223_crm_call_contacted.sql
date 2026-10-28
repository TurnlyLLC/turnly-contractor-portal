create or replace function public.crm_voice_status(p_parent text,p_sid text,p_status text,p_sequence integer,p_duration integer)
returns void language plpgsql security invoker set search_path=public as $$
declare v crm_voice_calls;
begin
 if p_status not in ('initiated','ringing','in-progress','completed','busy','failed','no-answer','canceled') then return; end if;
 update crm_voice_calls set call_sid=p_sid,status=p_status,sequence=p_sequence,duration_seconds=p_duration
 where parent_sid=p_parent and (call_sid is null or call_sid=p_sid) and sequence<p_sequence returning * into v;
 if found then
  -- Only provider-confirmed connections advance new prospects. Never overwrite an outcome.
  if p_status='in-progress' or (p_status='completed' and p_duration>0) then
   update sales_leads set pipeline_stage='contacted',last_activity_at=now()
   where id=v.lead_id and business_segment='residential'
    and pipeline_stage='new_leads' and not coalesce(do_not_contact,false);
  end if;
  insert into sales_activities(id,lead_id,user_id,user_name,activity_type,activity_text,metadata)
  values(v.id,v.lead_id,v.user_id,(select full_name from profiles where id=v.user_id),'call',
   'Portal call · '||p_status||' · '||p_duration||' seconds',jsonb_build_object('voice_call_id',v.id,'call_sid',p_sid,'duration_seconds',p_duration))
  on conflict(id) do update set activity_text=excluded.activity_text,metadata=excluded.metadata;
 end if;
end $$;
revoke all on function public.crm_voice_status(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.crm_voice_status(text,text,text,integer,integer) to service_role;
