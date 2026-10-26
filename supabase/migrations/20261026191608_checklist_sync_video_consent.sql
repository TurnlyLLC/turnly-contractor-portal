-- Flatten a template using the attached job's selected module counts.
create or replace function public.turnly_current_template_items(sections jsonb, previous_sections jsonb, attached jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare s jsonb; r jsonb; i jsonb; result jsonb:='[]'; entries jsonb; n integer; copies integer; category text; task text; kind text; item_id text;
begin
 for s in select value from jsonb_array_elements(coalesce(sections,'[]')) loop
  select max(case when (x->>'module_instance') ~ '^\d+$' then (x->>'module_instance')::integer else 1 end) into copies from jsonb_array_elements(coalesce(attached,'[]')) x where x->>'module_id'=s->>'id';
  if copies is null then
   copies:=case when jsonb_array_length(coalesce(attached,'[]'))>0 and exists(select 1 from jsonb_array_elements(coalesce(previous_sections,'[]')) x where x->>'id'=s->>'id') then 0 else 1 end;
  end if;
  for n in 1..least(copies,100) loop
   entries:='[]';
   for i in select value from jsonb_array_elements(coalesce(s->'items','[]')) loop entries:=entries||jsonb_build_array(jsonb_build_object('item',i,'room','')); end loop;
   for r in select value from jsonb_array_elements(coalesce(s->'rooms','[]')) loop
    for i in select value from jsonb_array_elements(coalesce(r->'items','[]')) loop entries:=entries||jsonb_build_array(jsonb_build_object('item',i,'room',r->>'title')); end loop;
   end loop;
   for r in select value from jsonb_array_elements(entries) loop
    i:=r->'item';task:=coalesce(nullif(i->>'label',''),i->>'task','');if task='' then continue;end if;
    item_id:=coalesce(nullif(i->>'id',''),'item-'||jsonb_array_length(result));
    kind:=lower(coalesce(i->>'type',i->>'media_required','check'));
    kind:=case when kind like '%video%' then 'video' when kind like '%photo%' or kind like '%image%' then 'photo' when kind like '%note%' then 'note' when kind like '%optional%' then 'optional' else 'check' end;
    category:=coalesce(s->>'title','General')||case when copies>1 then ' '||n else '' end||case when coalesce(r->>'room','')<>'' then ' / '||(r->>'room') else '' end;
    result:=result||jsonb_build_array(jsonb_build_object('id',item_id||'-'||n,'source_item_id',item_id,'category',category,'task',task,'label',task,'type',kind,'module_id',coalesce(s->>'id',''),'module_name',coalesce(s->>'title','General'),'module_instance',n,'required',coalesce(i->'required','true'::jsonb),'media_required',case when kind in ('video','photo') then kind else 'none' end,'notes',case when kind='note' then 'Contractor should leave a completion note.' else '' end));
   end loop;
  end loop;
 end loop;
 return result;
end $$;

-- Align responses by item identity, never by position. Changed tasks need a fresh check.
create or replace function public.turnly_sync_template_responses(items jsonb, old_items jsonb, responses jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare i jsonb; old_item jsonb; response jsonb; result jsonb:='[]'; identity jsonb;
begin
 for i in select value from jsonb_array_elements(items) loop
  select value into old_item from jsonb_array_elements(coalesce(old_items,'[]')) where value->>'id'=i->>'id' limit 1;
  response:=null;
  if old_item->>'task'=i->>'task' and old_item->>'type'=i->>'type' and old_item->'required'=i->'required' then
   select value into response from jsonb_array_elements(coalesce(responses,'[]')) where value->>'source_item_id'=i->>'source_item_id' and coalesce(value->>'module_instance','1')=coalesce(i->>'module_instance','1') limit 1;
  end if;
  identity:=jsonb_build_object('source_item_id',i->>'source_item_id','module_id',i->>'module_id','module_name',i->>'module_name','module_instance',i->'module_instance','category',i->>'category','task',i->>'task','required',i->'required','media_required',i->>'media_required');
  result:=result||jsonb_build_array(coalesce(response,jsonb_build_object('completed',false,'note','','completed_at',null))||identity);
 end loop;
 return result;
end $$;

create or replace function turnly_private.sync_attached_template() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.assignment_blocks; items jsonb; revision text;
begin
 if new.sections is not distinct from old.sections and new.name is not distinct from old.name then return new;end if;
 if auth.uid() is not null and not exists(select 1 from profiles where id=auth.uid() and role='admin' and status='active') then raise exception 'Active admin required to synchronize checklists.';end if;
 for a in select b.* from assignment_blocks b where (b.metadata->>'checklist_template_id'=new.id::text or (nullif(b.metadata->>'checklist_template_id','') is null and (
  exists(select 1 from properties p where p.id=b.property_id and p.checklist_template_id=new.id and p.checklist_items=b.property_checklist_items)
  or exists(select 1 from portal_properties p where p.id=b.portal_property_id and p.checklist_template_id=new.id and p.checklist_items=b.property_checklist_items)
  or exists(select 1 from property_units p where p.id=b.unit_id and p.checklist_template_id=new.id and p.checklist_items=b.property_checklist_items))))
  and status not in ('completed','complete','qa_pending','pending_qa','approved','paid','cancelled','canceled','declined')
  and completed_at is null and checklist_completed_at is null and nullif(metadata->>'qa_submitted_at','') is null for update loop
  items:=public.turnly_current_template_items(new.sections,old.sections,a.property_checklist_items);
  if items=a.property_checklist_items and new.name=coalesce(a.metadata->>'checklist_template_name','') then continue;end if;
  revision:=gen_random_uuid()::text;
  update assignment_blocks set property_checklist_items=items,
   checklist_responses=public.turnly_sync_template_responses(items,a.property_checklist_items,a.checklist_responses),
   metadata=coalesce(a.metadata,'{}')||jsonb_build_object('checklist_template_id',new.id,'checklist_template_name',new.name,'checklist_item_count',jsonb_array_length(items),'checklist_revision',revision,'checklist_changed_at',now(),'checklist_sync_source','template_update','checklist_history',coalesce(a.metadata->'checklist_history','[]')||jsonb_build_array(jsonb_build_object('template_id',new.id,'items',a.property_checklist_items,'responses',a.checklist_responses,'replaced_at',now(),'reason','template_update')))
   where id=a.id;
 end loop;
 -- Keep property/unit copies current so future requests also inherit the revision.
 update properties set checklist_items=public.turnly_current_template_items(new.sections,old.sections,checklist_items) where checklist_template_id=new.id;
 update portal_properties set checklist_items=public.turnly_current_template_items(new.sections,old.sections,checklist_items) where checklist_template_id=new.id;
 update property_units set checklist_items=public.turnly_current_template_items(new.sections,old.sections,checklist_items) where checklist_template_id=new.id;
 return new;
end $$;
create trigger sync_attached_template after update of sections,name on public.checklist_templates for each row execute function turnly_private.sync_attached_template();

-- Residential status is based on the attached scope, not the source label of a test job.
create or replace function public.record_residential_video_consent(p_actor uuid,p_assignment uuid,p_record jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.assignment_blocks; saved public.assignment_video_consents;
begin
 select * into a from public.assignment_blocks where id=p_assignment for update;
 if not found or coalesce(a.claimed_by,a.assigned_to) is distinct from p_actor then raise exception 'Only the assigned contractor can collect this customer signature.';end if;
 if a.status not in ('claimed','scheduled','in_progress') then raise exception 'Open an accepted, active assignment to collect the customer signature.';end if;
 if not exists(select 1 from profiles where id=p_actor and role='contractor' and status='active') then raise exception 'Active assigned contractor required.';end if;
 if not (coalesce(a.metadata->>'source','')='residential_booking' or coalesce(a.metadata->>'scope_type','')='residential' or nullif(a.metadata->>'residential_booking_id','') is not null or exists(select 1 from checklist_templates t where t.id::text=a.metadata->>'checklist_template_id' and t.scope_type='residential')) then raise exception 'This assignment does not have a residential cleaning scope.';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(a.property_checklist_items,'[]')) i where coalesce(i->>'source_item_id',i->>'id','') like 'residential-video-%') then raise exception 'Reopen this job to load its current video requirements.';end if;
 select * into saved from assignment_video_consents where assignment_id=p_assignment;if found then return to_jsonb(saved);end if;
 insert into assignment_video_consents(assignment_id,collected_by,customer_name,signature,consent_text,consent_version,assignment_snapshot)
 values(p_assignment,p_actor,p_record->>'customer_name',p_record->'signature',p_record->>'consent_text',p_record->>'consent_version',jsonb_build_object('title',a.title,'service_type',a.service_type,'start_window',a.start_window,'property_name',a.property_name,'scope',a.scope)) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.record_residential_video_consent(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_residential_video_consent(uuid,uuid,jsonb) to service_role;

-- Bring active, explicitly linked residential requests up to date, including test jobs.
do $$
declare a public.assignment_blocks; t public.checklist_templates; items jsonb;
begin
 for a in select * from assignment_blocks where metadata ? 'checklist_template_id' and status in ('pending','open','preferred_pending','claimed','scheduled','in_progress','draft') and completed_at is null and checklist_completed_at is null for update loop
  select * into t from checklist_templates where id::text=a.metadata->>'checklist_template_id' and scope_type='residential';if not found then continue;end if;
  items:=public.turnly_current_template_items(t.sections,'[]',a.property_checklist_items);
  update assignment_blocks set property_checklist_items=items,checklist_responses=public.turnly_sync_template_responses(items,a.property_checklist_items,a.checklist_responses),metadata=coalesce(a.metadata,'{}')||jsonb_build_object('checklist_revision',gen_random_uuid()::text,'checklist_item_count',jsonb_array_length(items),'checklist_changed_at',now(),'checklist_sync_source','template_backfill','checklist_history',coalesce(a.metadata->'checklist_history','[]')||jsonb_build_array(jsonb_build_object('items',a.property_checklist_items,'responses',a.checklist_responses,'replaced_at',now(),'reason','template_backfill'))) where id=a.id;
 end loop;
end $$;

revoke all on function public.turnly_current_template_items(jsonb,jsonb,jsonb),public.turnly_sync_template_responses(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.turnly_current_template_items(jsonb,jsonb,jsonb),public.turnly_sync_template_responses(jsonb,jsonb,jsonb) to authenticated,service_role;
