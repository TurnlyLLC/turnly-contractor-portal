alter table public.assignment_blocks add column if not exists en_route_at timestamptz;

-- Only the authenticated server endpoint may call this function. Row locking
-- rechecks ownership/status atomically after external address lookup.
create or replace function public.advance_contractor_job(
 p_actor uuid,p_job uuid,p_action text,p_lat double precision default null,p_lon double precision default null,
 p_accuracy double precision default null,p_recorded_at timestamptz default null,
 p_site_lat double precision default null,p_site_lon double precision default null,
 p_notes text default '',p_issues text default '')
returns public.assignment_blocks language plpgsql security invoker set search_path='' as $fn$
declare j public.assignment_blocks%rowtype; meters double precision;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role::text='contractor' and status='active') then
  raise exception 'An active contractor account is required.';
 end if;
 select * into j from public.assignment_blocks where id=p_job for update;
 if not found or coalesce(j.claimed_by,j.assigned_to) is distinct from p_actor then raise exception 'This job is not assigned to you.'; end if;
 if p_action='head_to_job' then
  if j.status='en_route' then return j; end if;
  if j.status not in ('claimed','scheduled') then raise exception 'Accept this job before heading to it.'; end if;
  update public.assignment_blocks set status='en_route',en_route_at=now(),
    site_latitude=coalesce(p_site_lat,site_latitude),site_longitude=coalesce(p_site_lon,site_longitude)
   where id=p_job returning * into j;
 elsif p_action='start_job' then
  if j.status='in_progress' then return j; end if;
  if j.status<>'en_route' then raise exception 'Choose Head to job before starting.'; end if;
  if p_lat is null or p_lon is null or p_accuracy is null or p_site_lat is null or p_site_lon is null
   or not(p_lat between -90 and 90) or not(p_lon between -180 and 180)
   or not(p_site_lat between -90 and 90) or not(p_site_lon between -180 and 180)
   or not(p_accuracy between 0 and 100) then raise exception 'Enable precise location. GPS accuracy must be within 100 metres.'; end if;
  if p_recorded_at is null or p_recorded_at < now()-interval '90 seconds' or p_recorded_at > now()+interval '15 seconds' then
   raise exception 'Your location reading expired. Try Start job again for a fresh location.';
  end if;
  meters:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(p_site_lat-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(p_site_lat))*power(sin(radians(p_site_lon-p_lon)/2),2))));
  if meters>200 then raise exception 'You must be within 200 metres of the job to start. Your current distance is % metres.',round(meters)::int; end if;
  update public.assignment_blocks set status='in_progress',claimed_by=p_actor,claimed_at=coalesce(claimed_at,now()),
   started_at=now(),started_by=p_actor,start_notes=nullif(left(p_notes,2000),''),
   start_latitude=p_lat,start_longitude=p_lon,start_location_accuracy=p_accuracy,start_distance_miles=meters/1609.344,
   site_latitude=p_site_lat,site_longitude=p_site_lon,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('arrival_verified_at',now(),'arrival_distance_metres',round(meters)::int)
    ||case when nullif(p_issues,'') is not null then jsonb_build_object('contractor_start_issues',left(p_issues,2000),'latest_contractor_issue',left(p_issues,2000),'issue_reported_at',now(),'issue_reported_by',p_actor) else '{}'::jsonb end
   where id=p_job returning * into j;
 else raise exception 'Unknown job progress action.';
 end if;
 return j;
end;
$fn$;
revoke all on function public.advance_contractor_job(uuid,uuid,text,double precision,double precision,double precision,timestamptz,double precision,double precision,text,text) from public,anon,authenticated;
grant execute on function public.advance_contractor_job(uuid,uuid,text,double precision,double precision,double precision,timestamptz,double precision,double precision,text,text) to service_role;

-- Preserve QA/pay review, but only finish a job that has actually started.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.submit_assignment_for_qa(uuid,jsonb,timestamptz)'::regprocedure);
 if position('  qa_id := public.ensure_assignment_qa_job(target_assignment_id);' in definition)=0 then raise exception 'QA submission function changed; review before migrating.'; end if;
 definition:=replace(definition,E'\r\n',E'\n');
 if position(E'    );\n\n  if not found' in definition)=0 then raise exception 'QA ownership query changed; review before migrating.'; end if;
 definition:=replace(definition,E'    );\n\n  if not found',E'    ) for update;\n\n  if not found');
 definition:=replace(definition,'  qa_id := public.ensure_assignment_qa_job(target_assignment_id);',$guard$
  if assignment_row.status in ('qa_pending','completed') and assignment_row.checklist_completed_at is not null then
    return nullif(assignment_row.metadata->>'qa_job_id','')::uuid;
  end if;
  if assignment_row.status <> 'in_progress' then raise exception 'Start the job before submitting its checklist.'; end if;
  if jsonb_typeof(checklist_payload) is distinct from 'array' or jsonb_array_length(checklist_payload)=0 then raise exception 'Submit the completed checklist before finishing the job.'; end if;
  if exists(select 1 from jsonb_array_elements(checklist_payload) response where coalesce((response->>'required')::boolean,true) and not coalesce((response->>'completed')::boolean,false)) then raise exception 'Complete every required checklist item before submitting.'; end if;
  qa_id := public.ensure_assignment_qa_job(target_assignment_id);$guard$);
 execute definition;
 definition:=pg_get_functiondef('public.customer_portal_change(uuid,text,uuid,text,jsonb)'::regprocedure);
 if position('(''in_progress'',''qa_pending'',''completed'',''cancelled'')' in definition)=0 then raise exception 'Customer change function changed; review before migrating.'; end if;
 execute replace(definition,'(''in_progress'',''qa_pending'',''completed'',''cancelled'')','(''en_route'',''in_progress'',''qa_pending'',''completed'',''cancelled'')');
end;
$patch$;
notify pgrst,'reload schema';
