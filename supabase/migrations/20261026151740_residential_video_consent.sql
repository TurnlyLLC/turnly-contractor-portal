create table public.assignment_video_consents (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null unique references public.assignment_blocks(id),
 collected_by uuid not null references public.profiles(id),
 customer_name text not null check(length(customer_name) between 2 and 160),
 signature jsonb not null check(jsonb_typeof(signature)='array' and octet_length(signature::text)<60000),
 consent_text text not null,
 consent_version text not null,
 signed_at timestamptz not null default now(),
 assignment_snapshot jsonb not null
);
alter table public.assignment_video_consents enable row level security;
revoke all on public.assignment_video_consents from anon, authenticated;
grant select on public.assignment_video_consents to authenticated;
grant select,insert on public.assignment_video_consents to service_role;
create policy video_consent_read on public.assignment_video_consents for select to authenticated using (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role='admin')
 or exists(select 1 from public.assignment_blocks a where a.id=assignment_id and coalesce(a.claimed_by,a.assigned_to)=(select auth.uid()))
);

create function public.record_residential_video_consent(p_actor uuid,p_assignment uuid,p_record jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.assignment_blocks; saved public.assignment_video_consents;
begin
 select * into a from public.assignment_blocks where id=p_assignment for update;
 if not found or coalesce(a.claimed_by,a.assigned_to) is distinct from p_actor or a.metadata->>'source' is distinct from 'residential_booking'
 or a.status not in ('claimed','scheduled','in_progress') then raise exception 'This assignment cannot accept a video opt-out.'; end if;
 if not exists(select 1 from public.profiles where id=p_actor and role='contractor' and status='active') then raise exception 'Active assigned contractor required.'; end if;
 if not exists(select 1 from jsonb_array_elements(a.property_checklist_items) i where coalesce(i->>'source_item_id',i->>'id','') like 'residential-video-%') then raise exception 'This checklist does not have residential video requirements.'; end if;
 select * into saved from public.assignment_video_consents where assignment_id=p_assignment;
 if found then return to_jsonb(saved); end if;
 insert into public.assignment_video_consents(assignment_id,collected_by,customer_name,signature,consent_text,consent_version,assignment_snapshot)
 values(p_assignment,p_actor,p_record->>'customer_name',p_record->'signature',p_record->>'consent_text',p_record->>'consent_version',
 jsonb_build_object('title',a.title,'service_type',a.service_type,'start_window',a.start_window,'property_name',a.property_name,'scope',a.scope)) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.record_residential_video_consent(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_residential_video_consent(uuid,uuid,jsonb) to service_role;

create function turnly_private.immutable_video_consent() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Signed video opt-outs are permanent assignment records and cannot be overwritten or deleted.'; end $$;
create trigger immutable_video_consent before update or delete on public.assignment_video_consents for each row execute function turnly_private.immutable_video_consent();

-- Keep existing descriptions and tasks; prepend/append the required video modules.
update public.checklist_templates t set sections =
 jsonb_build_array(jsonb_build_object('id','residential-video-before','title','Before-clean video','rooms','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object('id','residential-video-before','type','video','required',true,'label','Record and upload a before-clean walkthrough video, or collect the customer-signed video opt-out.'))))
 || t.sections ||
 jsonb_build_array(jsonb_build_object('id','residential-video-after','title','After-clean video','rooms','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object('id','residential-video-after','type','video','required',true,'label','Record and upload an after-clean walkthrough video. A saved customer opt-out automatically covers this video too.'))))
 where scope_type='residential' and residential_service in ('standard','deep')
 and not exists(select 1 from jsonb_array_elements(t.sections) s where s->>'id'='residential-video-before');

-- Both RPC and direct assignment completion must provide real uploaded evidence or a signed record.
create function turnly_private.guard_residential_video_completion() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare item jsonb; response jsonb; expected jsonb;
begin
 expected:=case when tg_op='UPDATE' then old.property_checklist_items else new.property_checklist_items end;
 if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(coalesce(expected,'[]')) i where coalesce(i->>'source_item_id',i->>'id','') like 'residential-video-%')
 and new.property_checklist_items is distinct from old.property_checklist_items
 and auth.uid() is not null and not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') then raise exception 'Only an admin can change assigned video requirements.'; end if;
 if new.status not in ('qa_pending','completed','approved','paid') then return new; end if;
 if exists(select 1 from public.assignment_video_consents where assignment_id=new.id) then return new; end if;
 for item in select value from jsonb_array_elements(coalesce(expected,'[]')) where coalesce(value->>'source_item_id',value->>'id','') like 'residential-video-%' loop
  select value into response from jsonb_array_elements(coalesce(new.checklist_responses,'[]')) where value->>'source_item_id'=item->>'source_item_id' limit 1;
  if response is null or response->>'completed' is distinct from 'true' or not exists(
   select 1 from public.qa_videos v join storage.objects o on o.bucket_id=v.storage_bucket and o.name=v.storage_path
   where v.id::text=response->'media'->>'id' and v.assignment_id=new.id and v.storage_bucket='qa-videos'
   and v.storage_path=response->'media'->>'path' and v.metadata->>'checklist_item_id'=item->>'id'
  ) then raise exception 'Upload both required walkthrough videos or collect the customer-signed video opt-out before completing this assignment.'; end if;
 end loop;
 return new;
end $$;
create trigger guard_residential_video_completion before insert or update on public.assignment_blocks for each row execute function turnly_private.guard_residential_video_completion();

-- Upgrade untouched assignment snapshots without replacing their cleaning tasks.
update public.assignment_blocks a set property_checklist_items =
 jsonb_build_array(jsonb_build_object('id','residential-video-before-1','source_item_id','residential-video-before','module_id','residential-video-before','module_name','Before-clean video','module_instance',1,'category','Before-clean video','type','video','media_required','video','required',true,'task','Record and upload a before-clean walkthrough video, or collect the customer-signed video opt-out.'))
 || a.property_checklist_items ||
 jsonb_build_array(jsonb_build_object('id','residential-video-after-1','source_item_id','residential-video-after','module_id','residential-video-after','module_name','After-clean video','module_instance',1,'category','After-clean video','type','video','media_required','video','required',true,'task','Record and upload an after-clean walkthrough video. A saved customer opt-out automatically covers this video too.')),
 metadata=coalesce(a.metadata,'{}')||jsonb_build_object('checklist_revision',gen_random_uuid()::text)
 where a.metadata->>'source'='residential_booking' and a.status in ('pending','open','preferred_pending','claimed','scheduled')
 and a.started_at is null and coalesce(a.checklist_responses,'[]')='[]'::jsonb
 and jsonb_array_length(a.property_checklist_items)>0
 and exists(select 1 from public.checklist_templates t where t.id::text=a.metadata->>'checklist_template_id' and t.scope_type='residential' and t.residential_service in ('standard','deep'))
 and not exists(select 1 from jsonb_array_elements(a.property_checklist_items) i where coalesce(i->>'source_item_id',i->>'id','') like 'residential-video-%');
