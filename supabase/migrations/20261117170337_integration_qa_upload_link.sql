create or replace function integration_attach_qa_video(p_actor uuid,p_row jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare job assignment_blocks; existing qa_videos; qa uuid; claim text; v qa_videos;
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'active_admin_required';end if;
 select * into job from assignment_blocks where id=(p_row->>'assignment_id')::uuid for update;
 if job.id is null then raise exception 'assignment_not_found';end if;
 select * into existing from qa_videos where id=(p_row->>'id')::uuid;
 if existing.id is not null then
  if existing.assignment_id<>job.id or existing.storage_path is distinct from p_row->>'storage_path' then raise exception 'upload_conflict';end if;
  return jsonb_build_object('id',existing.id,'assignment_id',job.id,'qa_job_id',existing.qa_job_id,'duplicate',true);
 end if;
 if p_row->>'storage_bucket'<>'qa-videos' or p_row->>'storage_path' not like ('integrations/'||job.id::text||'/%') or p_row->>'video_phase' not in ('before','after','other') then raise exception 'invalid_upload';end if;
 claim:=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',p_actor::text,true);
 qa:=ensure_assignment_qa_job(job.id);
 v:=jsonb_populate_record(null::qa_videos,p_row);
 insert into qa_videos(id,qa_job_id,assignment_id,property_id,portal_property_id,property_name,unit_name,contractor_id,title,video_phase,notes,storage_bucket,storage_path,file_name,mime_type,file_size,uploaded_by,source,metadata)
 values(v.id,qa,job.id,v.property_id,v.portal_property_id,job.property_name,job.unit_name,coalesce(job.claimed_by,job.assigned_to),v.title,v.video_phase,v.notes,'qa-videos',v.storage_path,v.file_name,v.mime_type,v.file_size,p_actor,'admin_upload',v.metadata);
 perform set_config('request.jwt.claim.sub',coalesce(claim,''),true);
 return jsonb_build_object('id',v.id,'assignment_id',job.id,'qa_job_id',qa,'uploaded',true,'qa_approved',false);
end $$;
revoke all on function integration_attach_qa_video(uuid,jsonb) from public,anon,authenticated;grant execute on function integration_attach_qa_video(uuid,jsonb) to service_role;
