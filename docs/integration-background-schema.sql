-- Narrow service-only access to the owned checklist, not a portal login token.
grant usage on schema turnly_backend to service_role;
grant select on turnly_backend.items,turnly_backend.submissions to service_role;
-- PostgreSQL row locks require UPDATE privilege on at least one column.
grant update(id) on turnly_backend.items to service_role;
grant insert on turnly_backend.submissions to service_role;

create or replace function public.integration_background_review(
 p_key uuid,p_document uuid,p_approve boolean default false,
 p_expected_updated_at timestamptz default null,p_version integer default null,
 p_expected_submission_id text default null,p_reference text default '',p_reviewed boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare k public.integration_keys; doc public.contractor_documents; owner public.profiles;
 item turnly_backend.items; prior turnly_backend.submissions; bg public.contractor_background_checks;
 decision public.contractor_background_checks; stamped bigint; submission_id text; note text; result jsonb;
begin
 select * into k from public.integration_keys where id=p_key for share;
 if not found or k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=now())
  or not ('platform:full'=any(k.scopes) or (case when p_approve then 'documents:approve' else 'documents:read' end)=any(k.scopes))
  or not exists(select 1 from public.profiles where id=k.created_by and role::text='admin' and status='active')
 then raise exception 'Active authorized integration required'; end if;
 -- Use the same profile-first lock order as the background review workflow.
 select * into doc from public.contractor_documents where id=p_document;
 if not found or doc.profile_id is null then raise exception 'Choose an uploaded report linked to a contractor profile'; end if;
 select * into owner from public.profiles where id=doc.profile_id and role::text='contractor' for update;
 if not found or owner.status in ('deleted','deletion_pending','disabled','suspended','inactive','deactivated','rejected') then raise exception 'Active contractor account required'; end if;
 select * into doc from public.contractor_documents where id=p_document for update;
 if doc.profile_id is distinct from owner.id then raise exception 'Report owner changed. Refresh before approving'; end if;
 if (coalesce(doc.document_type,'')||' '||coalesce(doc.title,'')) !~* 'background[ _-]*(check|screen)' then raise exception 'This is not a background-check report'; end if;
 if doc.storage_bucket<>'contractor-documents' or coalesce(doc.storage_path,'')='' or doc.expiration_date<current_date
  or not exists(select 1 from storage.objects where bucket_id=doc.storage_bucket and name=doc.storage_path)
 then raise exception 'An uploaded, unexpired report file is required'; end if;
 if (select count(*) from turnly_backend.items where kind='background' and required=1 and active=1 and deleted=0)<>1 then raise exception 'A unique required background checklist item is required'; end if;
 select * into item from turnly_backend.items where kind='background' and required=1 and active=1 and deleted=0 for share;
 select * into prior from turnly_backend.submissions where user_id=owner.id::text and item_id=item.id order by created_at desc,id desc limit 1;
 select * into bg from public.contractor_background_checks where profile_id=owner.id;
 if p_approve then
  -- p_reviewed is retained only for older callers; explicit approval is sufficient.
  if length(trim(coalesce(p_reference,''))) not between 1 and 120 then raise exception 'Provide the report reference'; end if;
  if p_expected_updated_at is null or doc.updated_at is distinct from p_expected_updated_at
   or p_version is distinct from coalesce(bg.version,0) or p_expected_submission_id is distinct from prior.id
  then raise exception 'This review changed. Refresh the background review before approving'; end if;
  -- The three stores commit together; an insertion or review failure rolls everything back.
  select * into decision from public.begin_contractor_background_review(k.created_by,owner.id,item.id,'approved',trim(p_reference),'',p_version,true);
  stamped:=greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint,coalesce(prior.created_at,0)+1);
  submission_id:='sub_'||gen_random_uuid()::text;
  note:='[Background review '||decision.operation_id::text||'] [Portal approved document: '||doc.id::text||'] Approved by Turnly.';
  insert into turnly_backend.submissions(id,user_id,item_id,item_title,kind,version,status,fields_json,source,reviewer_note,reviewed_by,reviewed_at,created_at)
   values(submission_id,owner.id::text,item.id,item.title,item.kind,item.version,'approved','{}','admin',note,k.created_by::text,stamped,stamped);
  perform public.finish_contractor_background_review(owner.id,decision.operation_id);
  perform public.review_contractor_document(k.created_by,doc.id,'approved','Approved as instructed via Turnly integration. Report reference: '||trim(p_reference),p_expected_updated_at);
  -- A synchronized background approval neither grants nor revokes overall contractor approval.
  update public.profiles set contractor_approved=owner.contractor_approved where id=owner.id;
  select * into doc from public.contractor_documents where id=p_document;
  select * into bg from public.contractor_background_checks where profile_id=owner.id;
  select * into prior from turnly_backend.submissions where id=submission_id;
 end if;
 result:=jsonb_build_object('document',jsonb_build_object('id',doc.id,'profile_id',doc.profile_id,'title',doc.title,'status',doc.status,'updated_at',doc.updated_at),
  'background',jsonb_build_object('version',coalesce(bg.version,0),'status',bg.status,'sync_state',bg.sync_state,'reference',bg.reference),
  'checklist',jsonb_build_object('item_id',item.id,'submission_id',prior.id,'state',case when prior.source='admin' and prior.status='approved' and bg.status='approved' and bg.sync_state='synced' then 'done' else 'incomplete' end),
  'approved',p_approve,'overall_contractor_approval_changed',false);
 return result;
end;$$;
revoke all on function public.integration_background_review(uuid,uuid,boolean,timestamptz,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.integration_background_review(uuid,uuid,boolean,timestamptz,integer,text,text,boolean) to service_role;
notify pgrst,'reload schema';
